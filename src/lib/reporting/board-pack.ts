import type {
  Claim,
  EntityReference,
  ImpactReportSection,
  SnapshotFigure,
} from "@/types/domain";
import { formatMoney, money } from "@/lib/finance-intelligence/money";
import { indicatorProgress } from "@/lib/logic/progress";
import type { AttentionBoard, MissionSnapshot } from "@/lib/intelligence";
import { detectUnknowns } from "@/lib/intelligence";

/**
 * Board pack assembly.
 *
 * The brief: *assemble approved information from Finance, Funding, Programme
 * delivery, Impact, Risk, Relationships and Governance while preserving source
 * snapshots.* Two words in that sentence do the work.
 *
 * **Approved.** A board pack is the document on which trustees discharge a
 * legal duty. Filling it with the organisation's best current guess and
 * letting the meeting sort out which figures are solid is how a board ends up
 * making a decision on an AI-drafted narrative nobody checked. So every figure
 * here is either a recorded value or a claim, and each carries its trust state
 * into the pack rather than being flattened into prose.
 *
 * **Snapshots.** The pack pins what it says. A trustee reading the March pack
 * in June must see March's numbers, and must be able to find out that they
 * have since moved — which is `detectReportDrift`, unchanged, running over the
 * pack's own snapshot.
 *
 * It reuses the MG-4 intelligence layer rather than recomputing anything. The
 * risk section of a board pack and the "what needs attention" list are the same
 * question asked by two audiences, and answering them with two engines would
 * guarantee they eventually disagree — which is the version of this failure
 * that destroys trust fastest.
 */

export interface BoardPackSection extends ImpactReportSection {
  /** The figures this section pins, carried into the pack's snapshot. */
  figures: SnapshotFigure[];
}

export interface BoardPackInput {
  snapshot: MissionSnapshot;
  board: AttentionBoard;
  claims: Claim[];
  periodLabel: string;
  now: Date;
}

const ref = (type: EntityReference["type"], id: string, label?: string): EntityReference =>
  label ? { type, id, label } : { type, id };

/**
 * Only claims a human stands behind reach the pack.
 *
 * `ai_extracted` and `needs_review` are excluded, not downgraded. A board pack
 * that includes an unreviewed extraction with a caveat is still a board pack
 * that includes an unreviewed extraction, and caveats are the first thing a
 * reader skips.
 */
function approvedClaims(claims: Claim[]): Claim[] {
  return claims.filter(
    (claim) =>
      !claim.supersededBy &&
      (claim.verification === "verified" || claim.verification === "provided"),
  );
}

export function buildBoardPack(input: BoardPackInput): {
  sections: BoardPackSection[];
  figures: SnapshotFigure[];
  excluded: { reason: string; count: number }[];
} {
  const { snapshot, board, periodLabel } = input;
  const claims = approvedClaims(input.claims);
  const excludedCount = input.claims.length - claims.length;

  const sections: BoardPackSection[] = [
    financeSection(snapshot, board, periodLabel),
    fundingSection(snapshot, board),
    deliverySection(snapshot),
    impactSection(snapshot),
    riskSection(board),
    relationshipsSection(snapshot, board),
    governanceSection(snapshot),
  ];

  return {
    sections,
    figures: sections.flatMap((section) => section.figures),
    excluded: excludedCount
      ? [
          {
            reason:
              "Claims that are unverified, awaiting review or superseded are excluded from a board pack rather than included with a caveat.",
            count: excludedCount,
          },
        ]
      : [],
  };
}

function section(
  key: string,
  title: string,
  type: ImpactReportSection["type"],
  lines: string[],
  figures: SnapshotFigure[],
  claimIds: string[] = [],
): BoardPackSection {
  return {
    key,
    title,
    type,
    content: lines.filter(Boolean).join("\n"),
    claimIds,
    figures,
  };
}

function financeSection(
  s: MissionSnapshot,
  board: AttentionBoard,
  periodLabel: string,
): BoardPackSection {
  const lines: string[] = [`Financial position for ${periodLabel}.`];
  const figures: SnapshotFigure[] = [];

  if (s.funds.length === 0) {
    lines.push(
      "No funds are recorded, so no financial position can be stated. This is an absence of records rather than a nil position.",
    );
  } else {
    for (const fund of s.funds) {
      const transactions = s.transactions.filter((t) => t.fundId === fund.id);
      const income = transactions
        .filter((t) => t.direction === "income")
        .reduce((sum, t) => sum + t.amount.minorUnits, 0);
      const spend = transactions
        .filter((t) => t.direction === "expenditure")
        .reduce((sum, t) => sum + t.amount.minorUnits, 0);
      const balance = money(income - spend, fund.currency);
      lines.push(
        `${fund.name} (${fund.restriction}): ${formatMoney(balance)} across ${transactions.length} recorded transaction${transactions.length === 1 ? "" : "s"}.`,
      );
      figures.push({
        subject: ref("fund", fund.id, fund.name),
        predicate: "balance",
        renderedValue: formatMoney(balance),
        verification: transactions.length > 0 ? "provided" : "needs_review",
      });
    }
  }

  const financeItems = board.items.filter((item) => item.category === "finance");
  for (const item of financeItems) lines.push(`${item.title}. ${item.detail}`);

  return section("finance", "Finance", "financial", lines, figures);
}

function fundingSection(s: MissionSnapshot, board: AttentionBoard): BoardPackSection {
  const active = s.grants.filter((g) => g.status === "active");
  const pipeline = s.opportunities.filter(
    (o) => !["unsuccessful", "archived", "awarded"].includes(o.stage),
  );
  const currency = s.currency;
  const awardTotal = active.reduce((sum, g) => sum + g.awardValue, 0);

  const lines = [
    `${active.length} active grant${active.length === 1 ? "" : "s"} worth ${formatMoney(money(Math.round(awardTotal * 100), currency))}.`,
    `${pipeline.length} opportunit${pipeline.length === 1 ? "y" : "ies"} in the pipeline.`,
    ...board.items
      .filter((item) => item.category === "funding" || item.category === "grants")
      .map((item) => `${item.title}. ${item.detail}`),
  ];

  const figures: SnapshotFigure[] = active.map((grant) => ({
    subject: ref("grant", grant.id, grant.title),
    predicate: "award_value",
    renderedValue: formatMoney(money(Math.round(grant.awardValue * 100), grant.currency)),
    verification: "provided",
  }));

  return section("funding", "Funding", "claims", lines, figures);
}

function deliverySection(s: MissionSnapshot): BoardPackSection {
  const active = s.programmes.filter((p) => p.status === "active");
  const lines = [
    `${active.length} programme${active.length === 1 ? " is" : "s are"} in delivery.`,
    ...active.map((programme) => {
      const activities = s.activities.filter((a) => a.programmeId === programme.id);
      const outputs = s.outputs.filter((o) => o.programmeId === programme.id);
      return `${programme.name}: ${activities.length} activit${activities.length === 1 ? "y" : "ies"}, ${outputs.length} output${outputs.length === 1 ? "" : "s"}.`;
    }),
  ];

  const figures: SnapshotFigure[] = s.outputs
    .filter((output) => output.currentValue !== undefined)
    .map((output) => ({
      subject: ref("output", output.id, output.title),
      predicate: "current_value",
      renderedValue: `${output.currentValue}${output.unit ? ` ${output.unit}` : ""}${output.targetValue ? ` of ${output.targetValue}` : ""}`,
      verification: "provided",
    }));

  return section("programmes", "Programme delivery", "metrics", lines, figures);
}

function impactSection(s: MissionSnapshot): BoardPackSection {
  const lines: string[] = [];
  const figures: SnapshotFigure[] = [];

  for (const indicator of s.indicators) {
    if (!indicator.lastUpdated) {
      // Named rather than omitted. An impact section that lists only the
      // indicators with readings tells the board a flattering half-truth.
      lines.push(`${indicator.name}: never measured.`);
      continue;
    }
    const progress = indicatorProgress(indicator);
    const rendered = `${indicator.currentValue}${indicator.unit === "%" ? "%" : ` ${indicator.unit}`}`;
    lines.push(
      `${indicator.name}: ${rendered}, ${progress}% of a ${indicator.target} target, last measured ${indicator.lastUpdated}.`,
    );
    figures.push({
      subject: ref("indicator", indicator.id, indicator.name),
      predicate: "current_value",
      renderedValue: rendered,
      verification: indicator.confidence === "high" ? "verified" : "provided",
    });
  }

  if (lines.length === 0) lines.push("No indicators are defined.");
  return section("impact", "Impact", "metrics", lines, figures);
}

function riskSection(board: AttentionBoard): BoardPackSection {
  const risks = board.items.filter((item) => item.kind === "risk");
  const lines = risks.length
    ? risks.map(
        (item) =>
          `[${item.severity}] ${item.title}. ${item.detail} Signals: ${item.signals.map((sig) => sig.detail).join(" ")}`,
      )
    : ["No risk currently meets the threshold for board attention."];

  return section("risk", "Risk and assurance", "table", lines, []);
}

function relationshipsSection(s: MissionSnapshot, board: AttentionBoard): BoardPackSection {
  const items = board.items.filter((item) => item.category === "relationships");
  const lines = [
    `${s.relationships.filter((r) => r.status === "active").length} active relationship${s.relationships.filter((r) => r.status === "active").length === 1 ? "" : "s"}.`,
    ...items.map((item) => `${item.title}. ${item.detail}`),
  ];
  return section("relationships", "Relationships", "narrative", lines, []);
}

function governanceSection(s: MissionSnapshot): BoardPackSection {
  const lines: string[] = [];
  const figures: SnapshotFigure[] = [];

  if (s.profile) {
    const fields: [string, { value: unknown; verification: string; lastVerifiedAt?: string }][] = [
      ["Safeguarding", s.profile.safeguardingStatus],
      ["Data protection", s.profile.dataProtectionStatus],
      ["Insurance", s.profile.insuranceStatus],
      ["Financial year end", s.profile.financialYearEnd],
    ];
    for (const [label, field] of fields) {
      lines.push(
        `${label}: ${String(field.value)} (${field.verification.replace(/_/g, " ")}${field.lastVerifiedAt ? `, last verified ${field.lastVerifiedAt}` : ""}).`,
      );
      figures.push({
        subject: ref("organisation", s.organisationId, label),
        predicate: label.toLowerCase().replace(/\s+/g, "_"),
        renderedValue: String(field.value),
        verification: field.verification as SnapshotFigure["verification"],
      });
    }
  } else {
    lines.push("No organisation profile is recorded.");
  }

  // The section trustees most need and are least often given.
  const unknowns = detectUnknowns(s);
  if (unknowns.length > 0) {
    lines.push("");
    lines.push("Questions this pack cannot answer from the records:");
    for (const unknown of unknowns) {
      lines.push(`- ${unknown.question} (${unknown.reason.replace(/_/g, " ")}).`);
    }
  }

  return section("governance", "Governance", "narrative", lines, figures);
}
