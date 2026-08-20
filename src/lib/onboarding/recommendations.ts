import type { EntityReference, FundingOpportunity, Grant, GrantReport } from "@/types/domain";
import type { CandidateField, ProfileCandidate } from "@/lib/organisation-intelligence/types";
import { FIELD_LABELS } from "@/lib/organisation-intelligence/types";

/**
 * First-value recommendations.
 *
 * The point of MG-3 is that an organisation gets something useful before it
 * has configured anything. These are that something: a short, specific list
 * produced from what research actually found.
 *
 * **Every recommendation is grounded**, and grounding is enforced by the type
 * rather than by discipline — `RecommendationBase.grounds` is required and
 * non-empty, so a recommendation that cannot say what it stands on cannot be
 * constructed. This is the same rule that governs claims, applied to advice.
 *
 * They are also **deterministic**. No model is involved. A model asked to
 * suggest funding opportunities would invent plausible ones, which is the
 * single most damaging thing this product could do to a user on their first
 * afternoon.
 */

export type RecommendationKind =
  | "funding_opportunity"
  | "report_due"
  | "evidence_gap"
  | "profile_conflict"
  | "concentration_risk"
  | "indicator_to_establish";

export type RecommendationUrgency = "now" | "soon" | "when_convenient";

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  /** What this is and why it follows. Never a slogan. */
  detail: string;
  urgency: RecommendationUrgency;
  /**
   * What this stands on. Required, and required to be non-empty: an
   * ungrounded recommendation is exactly the kind of confident nonsense the
   * product exists to avoid.
   */
  grounds: string[];
  /** Where to act on it. */
  href?: string;
  /** Mission Graph records behind it, for the provenance drawer. */
  references: EntityReference[];
}

export interface RecommendationInput {
  candidates: ProfileCandidate[];
  conflictFields: CandidateField[];
  missingFields: CandidateField[];
  /** Opportunities already in the workspace. Never invented. */
  opportunities: FundingOpportunity[];
  grants: Grant[];
  grantReports: GrantReport[];
  now: Date;
  makeId: (prefix: string) => string;
}

const DAY = 24 * 60 * 60 * 1000;

const valuesFor = (candidates: ProfileCandidate[], field: CandidateField) =>
  candidates.filter((c) => c.field === field).map((c) => c.value);

/**
 * Produce the recommendations.
 *
 * Ordered by urgency then by how concrete the grounds are, and capped. A first
 * screen with twenty recommendations is a backlog, and a backlog on day one
 * reads as a list of things you are already behind on.
 */
export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { candidates, conflictFields, missingFields, now, makeId } = input;
  const out: Recommendation[] = [];

  // --- Reports approaching, where a due date is actually known -----------
  // "if known" in the brief is load-bearing: a new organisation has no grants,
  // and inventing a deadline would be worse than showing nothing.
  const upcoming = input.grantReports
    .filter((report) => report.status !== "submitted")
    .map((report) => ({
      report,
      days: Math.ceil((new Date(report.dueDate).getTime() - now.getTime()) / DAY),
    }))
    .filter(({ days }) => days >= 0 && days <= 90)
    .sort((a, b) => a.days - b.days);

  for (const { report, days } of upcoming.slice(0, 3)) {
    const grant = input.grants.find((g) => g.id === report.grantId);
    out.push({
      id: makeId("rec"),
      kind: "report_due",
      title: `${report.title} is due in ${days} day${days === 1 ? "" : "s"}`,
      detail: grant
        ? `Reporting obligation on ${grant.title}, due ${report.dueDate}.`
        : `Due ${report.dueDate}.`,
      urgency: days <= 14 ? "now" : "soon",
      grounds: [
        `Report record with due date ${report.dueDate}`,
        ...(grant ? [`Grant: ${grant.title}`] : []),
      ],
      href: grant ? `/grants/${grant.id}` : "/grants",
      references: [
        { type: "grant_report", id: report.id, label: report.title },
        ...(grant ? [{ type: "grant" as const, id: grant.id, label: grant.title }] : []),
      ],
    });
  }

  // --- Funding opportunities, matched on what research established --------
  const regions = valuesFor(candidates, "operatingRegions").concat(
    valuesFor(candidates, "geography"),
  );
  const communities = valuesFor(candidates, "communityServed");

  if (regions.length > 0 || communities.length > 0) {
    const matches = input.opportunities
      .filter((opportunity) => opportunity.stage === "discovered" || opportunity.stage === "reviewing")
      .map((opportunity) => {
        const reasons: string[] = [];

        const regionMatch = opportunity.eligibleLocations.find((location) =>
          regions.some((region) => overlaps(region, location)),
        );
        if (regionMatch) reasons.push(`Open to ${regionMatch}, which matches your stated area`);

        const themeMatch = opportunity.priorityThemes.find((theme) =>
          communities.some((community) => overlaps(community, theme)),
        );
        if (themeMatch) reasons.push(`Priority theme "${themeMatch}" matches who you serve`);

        return { opportunity, reasons };
      })
      // A match with no stated reason is not a match, it is a list.
      .filter(({ reasons }) => reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length);

    for (const { opportunity, reasons } of matches.slice(0, 3)) {
      out.push({
        id: makeId("rec"),
        kind: "funding_opportunity",
        title: opportunity.programmeName,
        detail:
          `${reasons.join(". ")}. Pegasus has not assessed full eligibility yet. That needs ` +
          "the details you confirm in review.",
        urgency: opportunity.deadline ? "soon" : "when_convenient",
        grounds: [
          ...reasons,
          ...(opportunity.deadline ? [`Deadline ${opportunity.deadline}`] : []),
        ],
        href: `/funding/${opportunity.id}`,
        references: [
          { type: "funding_opportunity", id: opportunity.id, label: opportunity.programmeName },
        ],
      });
    }
  }

  // --- Conflicts ---------------------------------------------------------
  if (conflictFields.length > 0) {
    out.push({
      id: makeId("rec"),
      kind: "profile_conflict",
      title: `${conflictFields.length} profile conflict${conflictFields.length === 1 ? "" : "s"} to resolve`,
      detail:
        "Two or more of your sources disagree. Pegasus will not choose, because a wrong value on " +
        "a funder-facing profile is worse than a missing one.",
      urgency: "now",
      grounds: conflictFields.map((field) => `Conflicting sources for ${FIELD_LABELS[field]}`),
      href: "/onboarding/review",
      references: [],
    });
  }

  // --- Evidence gaps -----------------------------------------------------
  const evidenceGaps = missingFields.filter((field) =>
    (["programme", "indicator", "outcome", "annualIncome", "safeguardingStatus"] as CandidateField[]).includes(
      field,
    ),
  );
  if (evidenceGaps.length > 0) {
    out.push({
      id: makeId("rec"),
      kind: "evidence_gap",
      title: `${evidenceGaps.length} evidence gap${evidenceGaps.length === 1 ? "" : "s"} that applications commonly ask about`,
      detail:
        "Pegasus did not find these in your public information. You may hold them. They may " +
        "simply not be published.",
      urgency: "when_convenient",
      grounds: evidenceGaps.map((field) => `Not found in any source: ${FIELD_LABELS[field]}`),
      href: "/evidence",
      references: [],
    });
  }

  // --- Indicators worth establishing --------------------------------------
  const outcomes = valuesFor(candidates, "outcome");
  const indicators = valuesFor(candidates, "indicator");
  if (outcomes.length > 0 && indicators.length < outcomes.length) {
    const unmeasured = outcomes.length - indicators.length;
    out.push({
      id: makeId("rec"),
      kind: "indicator_to_establish",
      title: `${unmeasured} outcome${unmeasured === 1 ? "" : "s"} you describe but do not appear to measure`,
      detail:
        "You describe these publicly. Without an indicator there is nothing to report progress " +
        "against when a funder asks.",
      urgency: "when_convenient",
      grounds: [
        `${outcomes.length} outcomes described publicly`,
        `${indicators.length} indicators found`,
      ],
      href: "/programmes",
      references: [],
    });
  }

  // --- Funding concentration ---------------------------------------------
  // Only from grants actually held. A concentration warning computed from a
  // website's thank-you page would be a guess dressed as financial analysis.
  const activeGrants = input.grants.filter((g) => g.status === "active");
  if (activeGrants.length >= 2) {
    const total = activeGrants.reduce((sum, g) => sum + g.awardValue, 0);
    const byFunder = new Map<string, number>();
    for (const grant of activeGrants) {
      byFunder.set(grant.funderId, (byFunder.get(grant.funderId) ?? 0) + grant.awardValue);
    }
    const [topFunder, topValue] = [...byFunder.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const share = topValue / total;

    if (share >= 0.5) {
      out.push({
        id: makeId("rec"),
        kind: "concentration_risk",
        title: `${Math.round(share * 100)}% of your active grant funding comes from one funder`,
        detail:
          "Concentration is not a fault, and many organisations run this way deliberately. It is " +
          "worth knowing, because it is the first question a trustee board asks about resilience.",
        urgency: "when_convenient",
        grounds: [
          `${activeGrants.length} active grants totalling ${activeGrants[0]!.currency} ${total.toLocaleString("en-GB")}`,
          `Largest funder accounts for ${activeGrants[0]!.currency} ${topValue.toLocaleString("en-GB")}`,
        ],
        href: "/grants",
        references: [{ type: "funder", id: topFunder }],
      });
    }
  }

  const order: Record<RecommendationUrgency, number> = { now: 0, soon: 1, when_convenient: 2 };
  return out
    .sort((a, b) => order[a.urgency] - order[b.urgency] || b.grounds.length - a.grounds.length)
    .slice(0, 8);
}

/** Loose containment, so "Leeds" matches "Leeds and Bradford". */
function overlaps(a: string, b: string): boolean {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}
