import type {
  Claim,
  EvidenceItem,
  ImpactReport,
  Indicator,
  IndicatorMeasurement,
  ReportDrift,
  ReportSnapshot,
  ReportVersion,
  ReportVersionReason,
  SnapshotFigure,
} from "@/types/domain";
import { renderClaimValue } from "@/lib/knowledge";

/**
 * Versions, snapshots and drift.
 *
 * This file holds the one rule the whole reporting phase exists to keep:
 *
 *   A published report cannot silently change when underlying live data
 *   changes.
 *
 * There are three ways to fail that rule and only one way to keep it.
 *
 * The failures: copy the numbers into the document, which loses the link back
 * to where they came from; re-render the document from live data, which makes
 * a published report a moving target; or store claim ids alone, which looks
 * rigorous and is not — once a claim is superseded, the id resolves to a
 * *chain*, and the report can no longer say which link it meant.
 *
 * The one that works: pin both. The snapshot holds the claim id **and** the
 * value as rendered at the time. That pair is what makes drift computable, and
 * drift is what turns a silent change into a flagged one.
 */

/** Pin the current figures a report cites. */
export interface SnapshotInput {
  report: ImpactReport;
  claims: Claim[];
  indicators: Indicator[];
  measurements?: IndicatorMeasurement[];
  evidence: EvidenceItem[];
  takenAt: Date;
  id?: string;
  versionId?: string;
}

/**
 * Take a snapshot.
 *
 * Every figure the report cites is resolved once, here, and never resolved
 * again. Anything the report cites that cannot be resolved is **not** silently
 * dropped: it is pinned with a `renderedValue` saying so, because a report
 * citing a claim that has since been deleted is a fact about the report and
 * hiding it would make the snapshot a worse record than no snapshot.
 */
export function buildReportSnapshot(input: SnapshotInput): ReportSnapshot {
  const { report, claims, indicators, evidence, takenAt } = input;
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const measurements = input.measurements ?? [];

  const figures: SnapshotFigure[] = [];
  const claimIds: string[] = [];

  for (const section of report.sections) {
    for (const claimId of section.claimIds ?? []) {
      claimIds.push(claimId);
      const claim = claimsById.get(claimId);
      if (!claim) {
        figures.push({
          subject: { type: "impact_report", id: report.id },
          predicate: `section:${section.key}:missing_claim:${claimId}`,
          claimId,
          renderedValue: "This claim could not be resolved when the snapshot was taken.",
        });
        continue;
      }
      figures.push({
        subject: claim.subject,
        predicate: claim.predicate,
        claimId: claim.id,
        renderedValue: renderClaimValue(claim.value),
        kind: claim.kind,
        verification: claim.verification,
      });
    }
  }

  const indicatorValues = report.includedIndicatorIds.flatMap((indicatorId) => {
    const indicator = indicators.find((i) => i.id === indicatorId);
    if (!indicator) return [];
    const latest = measurements
      .filter((m) => m.indicatorId === indicatorId)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
    return [
      {
        indicatorId,
        value: indicator.currentValue,
        measuredAt: latest?.recordedAt ?? indicator.lastUpdated,
      },
    ];
  });

  // Indicators are pinned as figures too, not only in `indicatorValues`. A
  // reader asking "what did the report say the progression rate was?" should
  // get the same answer whether they came via a claim or via an indicator.
  for (const reading of indicatorValues) {
    const indicator = indicators.find((i) => i.id === reading.indicatorId);
    if (!indicator) continue;
    figures.push({
      subject: { type: "indicator", id: indicator.id, label: indicator.name },
      predicate: "current_value",
      renderedValue: `${reading.value}${indicator.unit === "%" ? "%" : ` ${indicator.unit}`}`,
      verification: indicator.confidence === "high" ? "verified" : "provided",
    });
  }

  return {
    id: input.id ?? `snap-${report.id}-${takenAt.toISOString()}`,
    organisationId: report.organisationId,
    reportId: report.id,
    versionId: input.versionId,
    takenAt: takenAt.toISOString(),
    figures,
    evidenceIds: report.includedEvidenceIds.filter((id) =>
      evidence.some((item) => item.id === id),
    ),
    indicatorValues,
    claimIds: [...new Set(claimIds)],
  };
}

export interface VersionInput {
  report: ImpactReport;
  versionNumber: number;
  reason: ReportVersionReason;
  snapshotId?: string;
  note?: string;
  createdBy?: string;
  createdAt: Date;
  id?: string;
}

/**
 * Cut a version.
 *
 * `sections` is deep-copied rather than referenced. A version that shared its
 * section array with the live report would change whenever the report did,
 * which is the exact failure this type exists to prevent — and it is a failure
 * that would pass every test written against a single in-process store while
 * being catastrophically wrong in production.
 */
export function buildReportVersion(input: VersionInput): ReportVersion {
  return {
    id: input.id ?? `ver-${input.report.id}-${input.versionNumber}`,
    organisationId: input.report.organisationId,
    reportId: input.report.id,
    versionNumber: input.versionNumber,
    reason: input.reason,
    status: input.report.status,
    sections: structuredClone(input.report.sections),
    snapshotId: input.snapshotId,
    note: input.note,
    createdBy: input.createdBy,
    createdAt: input.createdAt.toISOString(),
  };
}

export interface DriftInput {
  snapshot: ReportSnapshot;
  versionId: string;
  /** Every claim now, including successors. */
  claims: Claim[];
  indicators: Indicator[];
}

/**
 * What has changed since the report was published.
 *
 * Reported, never applied. The published document does not move; the
 * organisation is told it no longer matches and decides what that warrants.
 *
 * Severity is deterministic and deliberately coarse. A figure whose claim was
 * explicitly **superseded** is material: someone corrected it on purpose. A
 * figure that merely differs — an indicator that has moved on since — is
 * minor, because delivery continuing is not an error in the report.
 */
export function detectReportDrift(input: DriftInput): ReportDrift[] {
  const { snapshot, claims, indicators } = input;
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const drift: ReportDrift[] = [];

  for (const figure of snapshot.figures) {
    if (figure.claimId) {
      const pinned = claimsById.get(figure.claimId);
      if (!pinned) continue;

      if (pinned.supersededBy) {
        const successor = claimsById.get(pinned.supersededBy);
        const currentValue = successor
          ? renderClaimValue(successor.value)
          : "superseded, successor unavailable";
        if (currentValue === figure.renderedValue) continue;
        drift.push({
          reportId: snapshot.reportId,
          versionId: input.versionId,
          subject: figure.subject,
          predicate: figure.predicate,
          publishedValue: figure.renderedValue,
          currentValue,
          supersededByClaimId: pinned.supersededBy,
          severity: "material",
        });
        continue;
      }

      // The claim itself is immutable, so an un-superseded claim cannot have
      // drifted. Nothing to check.
      continue;
    }

    if (figure.subject.type === "indicator") {
      const indicator = indicators.find((i) => i.id === figure.subject.id);
      if (!indicator) continue;
      const current = `${indicator.currentValue}${indicator.unit === "%" ? "%" : ` ${indicator.unit}`}`;
      if (current === figure.renderedValue) continue;
      drift.push({
        reportId: snapshot.reportId,
        versionId: input.versionId,
        subject: figure.subject,
        predicate: figure.predicate,
        publishedValue: figure.renderedValue,
        currentValue: current,
        severity: "minor",
      });
    }
  }

  return drift;
}

/**
 * Whether a published report still matches the records.
 *
 * Returned as a summary rather than a boolean, because "this report has drifted"
 * is not actionable on its own: the reader needs to know whether anything
 * material moved.
 */
export interface DriftSummary {
  drifted: boolean;
  material: number;
  minor: number;
  items: ReportDrift[];
}

export function summariseDrift(items: ReportDrift[]): DriftSummary {
  const material = items.filter((item) => item.severity === "material").length;
  return {
    drifted: items.length > 0,
    material,
    minor: items.length - material,
    items,
  };
}

/** The next version number for a report. Monotonic; gaps are never reused. */
export function nextVersionNumber(versions: ReportVersion[]): number {
  return versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
}

/**
 * The version a published report resolves to.
 *
 * The latest **published or approved** version, not the latest version. A
 * draft cut after publication is work in progress and must not become what a
 * funder sees.
 */
export function publishedVersion(versions: ReportVersion[]): ReportVersion | null {
  return (
    [...versions]
      .filter((v) => v.reason === "published" || v.reason === "approved" || v.reason === "correction")
      .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
  );
}
