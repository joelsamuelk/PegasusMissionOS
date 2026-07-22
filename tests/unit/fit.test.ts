import { describe, expect, it } from "vitest";
import { assessFit } from "@/lib/logic/fit";
import type { FundingOpportunity, Organisation, OrganisationProfile } from "@/types/domain";

const org: Organisation = {
  id: "org-1",
  name: "Test Charity",
  legalName: "Test Charity",
  type: "charity",
  operatingRegions: ["West Yorkshire"],
  isDemo: true,
  aiEnabled: true,
  audit: { createdAt: "2024-01-01", updatedAt: "2024-01-01", archivedAt: null },
};

const attest = <T>(value: T) => ({ value, verification: "verified" as const });

const profile: OrganisationProfile = {
  organisationId: "org-1",
  missionStatement: attest("Help young people into work"),
  vision: attest(""),
  summary: attest(""),
  coreActivities: attest(["Youth employment", "Digital skills"]),
  strategicPriorities: attest(["Youth employment", "Mental health and wellbeing"]),
  communitiesServed: attest(["Young people"]),
  geographicReach: attest("West Yorkshire"),
  trustees: attest(["A", "B"]),
  keyPolicies: attest(["Safeguarding"]),
  safeguardingStatus: attest("Up to date"),
  dataProtectionStatus: attest("ICO registered"),
  insuranceStatus: attest("Current"),
  financialYearEnd: attest("31 March"),
  auditors: attest("Examiner"),
  typicalFundingRequirement: attest("£50k"),
  preferredFundingTypes: attest(["Project"]),
  restrictedNeeds: attest(""),
  unrestrictedNeeds: attest(""),
  pastFunders: attest(["Lottery"]),
  matchFundingAvailable: attest(""),
};

function makeOpp(overrides: Partial<FundingOpportunity> = {}): FundingOpportunity {
  return {
    id: "opp-1",
    organisationId: "org-1",
    funderId: "f-1",
    programmeName: "Youth Grant",
    description: "",
    maxAward: 60000,
    currency: "GBP",
    fundingType: "project",
    eligibleOrgTypes: ["charity"],
    eligibleLocations: ["West Yorkshire"],
    priorityThemes: ["Youth employment", "Mental health and wellbeing"],
    requiredDocuments: ["Accounts"],
    reportingRequirements: [],
    stage: "discovered",
    probability: 0,
    saved: false,
    isDemo: true,
    audit: { createdAt: "2026-01-01", updatedAt: "2026-01-01", archivedAt: null },
    ...overrides,
  };
}

describe("assessFit", () => {
  it("returns a strong match when eligibility and themes align", () => {
    const result = assessFit({ opportunity: makeOpp(), organisation: org, profile, evidenceCount: 8 });
    expect(result.eligibilityStatus).toBe("met");
    expect(result.overallScore).toBeGreaterThan(70);
    expect(result.category).toBe("strong_match");
  });

  it("marks not eligible when organisation type is excluded", () => {
    const opp = makeOpp({ eligibleOrgTypes: ["foundation"] });
    const result = assessFit({ opportunity: opp, organisation: org, profile, evidenceCount: 8 });
    expect(result.eligibilityStatus).toBe("unmet");
    expect(result.category).toBe("not_eligible");
    expect(result.recommendedNextAction).toMatch(/eligibility/i);
  });

  it("marks not eligible when the location does not match", () => {
    const opp = makeOpp({ eligibleLocations: ["Scotland"] });
    const result = assessFit({ opportunity: opp, organisation: org, profile, evidenceCount: 8 });
    expect(result.category).toBe("not_eligible");
  });

  it("always produces a transparent factor breakdown with rationale", () => {
    const result = assessFit({ opportunity: makeOpp(), organisation: org, profile, evidenceCount: 2 });
    expect(result.factors.length).toBeGreaterThanOrEqual(7);
    for (const factor of result.factors) {
      expect(factor.rationale.length).toBeGreaterThan(0);
      expect(factor.label.length).toBeGreaterThan(0);
    }
  });

  it("flags missing information when the profile is thin", () => {
    const thin = { ...profile, communitiesServed: attest<string[]>([]) };
    const result = assessFit({ opportunity: makeOpp(), organisation: org, profile: thin, evidenceCount: 1 });
    expect(result.missingInformation.length).toBeGreaterThan(0);
  });
});
