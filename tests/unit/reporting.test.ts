import { describe, expect, it } from "vitest";
import type { Claim, ImpactReport } from "@/types/domain";
import {
  assessReportReadiness,
  buildReportExport,
  canTransitionReport,
  REPORT_TEMPLATES,
} from "@/lib/reporting";
import * as seed from "@/features/store/seed";

function completeReport(): ImpactReport {
  const report = structuredClone(seed.impactReports[0]!);
  report.sections = report.sections.map((section) => ({
    ...section,
    content: `${section.title} content grounded in the records.`,
  }));
  return report;
}

describe("report lifecycle", () => {
  it("ships a definition for every supported report type", () => {
    expect(Object.keys(REPORT_TEMPLATES).sort()).toEqual([
      "annual",
      "board_pack",
      "custom",
      "donor_update",
      "finance",
      "funder",
      "grant",
      "impact",
      "management",
      "partner",
      "programme",
      "trustee",
    ]);
    expect(Object.values(REPORT_TEMPLATES).every((sections) => sections.length > 0)).toBe(true);
  });

  it("allows only explicit adjacent workflow transitions", () => {
    expect(canTransitionReport("draft", "drafting")).toBe(true);
    expect(canTransitionReport("draft", "approved")).toBe(false);
    expect(canTransitionReport("ready_for_approval", "approved")).toBe(true);
    expect(canTransitionReport("submitted", "archived")).toBe(true);
    expect(canTransitionReport("archived", "drafting")).toBe(false);
  });
});

describe("report readiness", () => {
  it("names every undrafted section instead of returning a mystery score", () => {
    const readiness = assessReportReadiness({
      report: seed.impactReports[0]!,
      claims: seed.claims,
      indicators: seed.indicators,
      evidence: seed.evidenceItems,
      now: new Date("2026-08-18T12:00:00Z"),
    });

    expect(readiness.readyForApproval).toBe(false);
    expect(readiness.issues.filter((issue) => issue.kind === "empty_section"))
      .toHaveLength(seed.impactReports[0]!.sections.length);
    expect(readiness.score).toBe(0);
  });

  it("flags a corrected claim without silently replacing the published value", () => {
    const report = completeReport();
    const cited = { ...seed.claims[0]!, supersededBy: "clm-corrected" } as Claim;
    report.sections[0]!.claimIds = [cited.id];

    const readiness = assessReportReadiness({
      report,
      claims: [cited],
      indicators: [],
      evidence: seed.evidenceItems,
      now: new Date("2026-08-18T12:00:00Z"),
    });

    expect(readiness.readyForApproval).toBe(true);
    expect(readiness.issues).toContainEqual(
      expect.objectContaining({ kind: "superseded_claim", claimId: cited.id }),
    );
    expect(report.sections[0]!.claimIds).toEqual([cited.id]);
  });

  it("blocks conflicting current figures for the same fact", () => {
    const first = seed.claims[0]!;
    const conflict = {
      ...structuredClone(first),
      id: "clm-conflict",
      value: { type: "number", number: 999, unit: "young people" },
    } as Claim;

    const readiness = assessReportReadiness({
      report: completeReport(),
      claims: [first, conflict],
      indicators: [],
      evidence: seed.evidenceItems,
      now: new Date("2026-08-18T12:00:00Z"),
    });

    expect(readiness.readyForApproval).toBe(false);
    expect(readiness.issues).toContainEqual(
      expect.objectContaining({ kind: "inconsistent_figure" }),
    );
  });
});

describe("report export", () => {
  it("exports claim references with their source chain", () => {
    const report = completeReport();
    const claim = seed.claims[0]!;
    report.sections[0]!.claimIds = [claim.id];

    const document = buildReportExport(
      report,
      [claim],
      new Date("2026-08-18T12:00:00Z"),
    );

    expect(document.sections[0]!.claims[0]).toEqual({
      id: claim.id,
      text: claim.text,
      sources: claim.sources,
    });
    expect(document.generatedAt).toBe("2026-08-18T12:00:00.000Z");
  });
});
