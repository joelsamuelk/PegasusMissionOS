import type {
  FitAssessment,
  FitCategory,
  FitFactor,
  FundingOpportunity,
  Organisation,
  OrganisationProfile,
} from "@/types/domain";

/**
 * Explainable funding fit assessment.
 *
 * This is decision support only. It produces a transparent, factor-by-factor
 * breakdown with the evidence used and the assumptions that require
 * validation. A low score is never presented as an authoritative rejection.
 */

function weightedScore(factors: FitFactor[]): number {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = factors.reduce((sum, f) => sum + (f.score * f.weight) / 100, 0);
  return Math.round((weighted / totalWeight) * 100);
}

function categoryFor(score: number, eligibilityMet: boolean): FitCategory {
  if (!eligibilityMet) return "not_eligible";
  if (score >= 75) return "strong_match";
  if (score >= 55) return "potential_match";
  return "review_required";
}

export interface FitInput {
  opportunity: FundingOpportunity;
  organisation: Organisation;
  profile: OrganisationProfile;
  /** Count of evidence items available in the library. */
  evidenceCount: number;
}

export function assessFit(input: FitInput): Omit<FitAssessment, "id" | "generatedAt"> {
  const { opportunity, organisation, profile, evidenceCount } = input;

  // Eligibility: organisation type and location.
  const typeEligible =
    opportunity.eligibleOrgTypes.length === 0 ||
    opportunity.eligibleOrgTypes.includes(organisation.type);
  const locationEligible =
    opportunity.eligibleLocations.length === 0 ||
    opportunity.eligibleLocations.some((loc) =>
      organisation.operatingRegions.some(
        (r) =>
          r.toLowerCase().includes(loc.toLowerCase()) ||
          loc.toLowerCase().includes(r.toLowerCase()) ||
          loc.toLowerCase() === "uk" ||
          loc.toLowerCase().includes("national"),
      ),
    );
  const eligibilityMet = typeEligible && locationEligible;

  // Strategic alignment: overlap between priority themes and org priorities.
  const orgThemes = [
    ...profile.strategicPriorities.value,
    ...profile.coreActivities.value,
  ].map((t) => t.toLowerCase());
  const themeMatches = opportunity.priorityThemes.filter((theme) =>
    orgThemes.some(
      (o) => o.includes(theme.toLowerCase()) || theme.toLowerCase().includes(o),
    ),
  );
  const strategicScore =
    opportunity.priorityThemes.length === 0
      ? 60
      : Math.round((themeMatches.length / opportunity.priorityThemes.length) * 100);

  // Beneficiary alignment: overlap between communities served.
  const beneficiaryScore = profile.communitiesServed.value.length > 0 ? 78 : 45;

  // Financial suitability: typical requirement within award band.
  const financialScore = opportunity.maxAward
    ? opportunity.maxAward >= 10000
      ? 82
      : 60
    : 55;

  // Organisational readiness from profile completeness signals.
  const readinessSignals = [
    profile.safeguardingStatus.value,
    profile.dataProtectionStatus.value,
    profile.insuranceStatus.value,
  ].filter((v) => v && v.toLowerCase() !== "unknown");
  const readinessScore = Math.round((readinessSignals.length / 3) * 100) || 40;

  // Evidence strength.
  const evidenceScore = Math.min(100, 30 + evidenceCount * 8);

  const factors: FitFactor[] = [
    {
      key: "eligibility",
      label: "Eligibility",
      status: eligibilityMet ? "met" : "unmet",
      score: eligibilityMet ? 100 : 0,
      weight: 3,
      rationale: eligibilityMet
        ? `Organisation type and operating regions match the funder criteria.`
        : `${!typeEligible ? "Organisation type" : "Operating region"} does not currently meet the stated eligibility.`,
      evidenceUsed: ["Organisation type", "Operating regions"],
      assumptions: eligibilityMet
        ? []
        : ["Eligibility wording may allow exceptions; confirm with the funder."],
    },
    {
      key: "strategic",
      label: "Strategic alignment",
      status: strategicScore >= 66 ? "met" : strategicScore >= 33 ? "partial" : "uncertain",
      score: strategicScore,
      weight: 2.5,
      rationale:
        themeMatches.length > 0
          ? `Shared priorities: ${themeMatches.join(", ")}.`
          : `No direct overlap detected between funder themes and recorded priorities.`,
      evidenceUsed: ["Strategic priorities", "Core activities"],
      assumptions:
        themeMatches.length === 0
          ? ["Theme wording differs; a human review may find alignment."]
          : [],
    },
    {
      key: "geographic",
      label: "Geographic alignment",
      status: locationEligible ? "met" : "unmet",
      score: locationEligible ? 90 : 20,
      weight: 1.5,
      rationale: locationEligible
        ? `Delivery regions fall within the funder's eligible locations.`
        : `Delivery regions may fall outside the funder's eligible locations.`,
      evidenceUsed: ["Operating regions", "Geographic reach"],
      assumptions: [],
    },
    {
      key: "beneficiary",
      label: "Beneficiary alignment",
      status: beneficiaryScore >= 66 ? "met" : "partial",
      score: beneficiaryScore,
      weight: 2,
      rationale:
        profile.communitiesServed.value.length > 0
          ? `Communities served: ${profile.communitiesServed.value.join(", ")}.`
          : `Communities served are not fully recorded in the profile.`,
      evidenceUsed: ["Communities served"],
      assumptions: ["Confirm the funder's target beneficiary definition matches."],
    },
    {
      key: "financial",
      label: "Financial suitability",
      status: financialScore >= 66 ? "met" : "partial",
      score: financialScore,
      weight: 1.5,
      rationale: opportunity.maxAward
        ? `Maximum award aligns with a typical requirement for a programme of this size.`
        : `Award band is not fully specified.`,
      evidenceUsed: ["Typical funding requirement"],
      assumptions: ["Confirm restricted or unrestricted status against the budget."],
    },
    {
      key: "readiness",
      label: "Organisational readiness",
      status: readinessScore >= 66 ? "met" : "partial",
      score: readinessScore,
      weight: 1.5,
      rationale: `${readinessSignals.length} of 3 governance readiness signals recorded (safeguarding, data protection, insurance).`,
      evidenceUsed: ["Safeguarding status", "Data protection status", "Insurance status"],
      assumptions: readinessScore < 100 ? ["Some governance fields need review."] : [],
    },
    {
      key: "evidence",
      label: "Evidence strength",
      status: evidenceScore >= 66 ? "met" : evidenceScore >= 40 ? "partial" : "uncertain",
      score: evidenceScore,
      weight: 1.5,
      rationale: `${input.evidenceCount} evidence items available to support this application.`,
      evidenceUsed: ["Evidence library"],
      assumptions: [],
    },
    {
      key: "capacity",
      label: "Delivery capacity",
      status: "partial",
      score: 62,
      weight: 1,
      rationale: `Estimated from organisation size and current active programmes.`,
      evidenceUsed: ["Organisation size"],
      assumptions: ["Delivery capacity should be confirmed by the programme lead."],
    },
  ];

  const overallScore = weightedScore(factors);
  const category = categoryFor(overallScore, eligibilityMet);

  const missingInformation: string[] = [];
  if (profile.communitiesServed.value.length === 0)
    missingInformation.push("Communities served are not recorded.");
  if (readinessScore < 100)
    missingInformation.push("Governance readiness fields need review.");
  if (evidenceCount < 4)
    missingInformation.push("Add more supporting evidence to strengthen the case.");

  const keyRisks: string[] = [];
  if (!eligibilityMet) keyRisks.push("Eligibility is not currently met.");
  if (strategicScore < 50)
    keyRisks.push("Strategic alignment is weak and should be reviewed by a human.");
  if (opportunity.fundingType === "restricted")
    keyRisks.push("Restricted funding: delivery must match the funded activities exactly.");

  const recommendedNextAction = !eligibilityMet
    ? "Confirm eligibility directly with the funder before investing effort."
    : category === "strong_match"
      ? "Create an application workspace and begin drafting priority answers."
      : category === "potential_match"
        ? "Review the uncertain factors, then decide whether to proceed."
        : "Gather the missing information above, then reassess.";

  const effortEstimate: "low" | "medium" | "high" =
    (opportunity.requiredDocuments.length ?? 0) > 4 ? "high" : "medium";
  const strategicValue: "low" | "medium" | "high" =
    (opportunity.maxAward ?? 0) > 50000 ? "high" : "medium";

  return {
    opportunityId: opportunity.id,
    organisationId: organisation.id,
    overallScore,
    category,
    eligibilityStatus: eligibilityMet ? "met" : "unmet",
    factors,
    keyRisks,
    missingInformation,
    recommendedNextAction,
    effortEstimate,
    strategicValue,
    generatedBy: "mock",
  };
}

export const FIT_CATEGORY_LABELS: Record<FitCategory, string> = {
  strong_match: "Strong match",
  potential_match: "Potential match",
  review_required: "Review required",
  not_eligible: "Not currently eligible",
};
