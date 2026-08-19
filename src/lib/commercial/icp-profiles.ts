import type { ICPProfile } from "./types";

/**
 * The targeting model itself.
 *
 * These are the real ideal customer profiles the discovery jobs score against
 * — `pilotJobs` references them by id — so they are configuration rather than
 * demonstration content, and every account sees them.
 */

export const icpProfiles: ICPProfile[] = [
  [
    "ai-transformation",
    "AI Transformation",
    "studio",
    "Organisations turning a visible AI initiative into safe, useful operational systems.",
    ["Technology", "Professional services"],
    ["CTO", "CIO", "COO"],
    ["AI initiative", "operational workflow"],
    ["AI strategy", "AI hiring"],
    ["Intelligent Systems & AI"],
  ],
  [
    "product-build",
    "Product Build",
    "studio",
    "Funded teams with a validated problem and a product to ship.",
    ["Technology", "Climate", "Health"],
    ["Founder", "CPO", "CTO"],
    ["funding", "new product"],
    ["funding round", "product launch"],
    ["Product Engineering"],
  ],
  [
    "platform-transformation",
    "Platform Transformation",
    "studio",
    "Growing organisations constrained by legacy platforms or engineering delivery.",
    ["Technology", "Services"],
    ["CTO", "VP Engineering"],
    ["replatforming", "engineering hiring"],
    ["acquisition", "new CTO"],
    ["Platform & Engineering Transformation"],
  ],
  [
    "technology-leadership",
    "Technology Leadership",
    "studio",
    "Leadership teams needing senior technology direction without a permanent executive hire.",
    ["Technology", "Nonprofit"],
    ["CEO", "COO", "Board member"],
    ["CTO departure", "no CTO"],
    ["leadership change", "new strategy"],
    ["Technology Strategy & Leadership"],
  ],
  [
    "mission-os",
    "Mission OS",
    "mission_os",
    "Mission-driven organisations with enough funding, programme and reporting complexity to benefit from one operating system.",
    ["Charity", "NGO", "Foundation", "Social enterprise"],
    ["CEO", "COO", "Fundraising Director", "Impact Director", "Finance Director"],
    [
      "multiple programmes",
      "multiple funders",
      "impact reporting",
      "spreadsheet-heavy processes",
    ],
    ["programme expansion", "new strategy", "funding deadline"],
    ["Pegasus Mission OS"],
  ],
].map(
  ([
    id,
    name,
    commercialMotion,
    description,
    targetSectors,
    buyerPersonas,
    positiveSignals,
    triggerSignals,
    relevantCapabilities,
  ]) =>
    ({
      id,
      name,
      commercialMotion,
      description,
      targetSectors,
      buyerPersonas,
      positiveSignals,
      triggerSignals,
      relevantCapabilities,
      weights: {
        icpMatch: 30,
        problemEvidence: 20,
        timing: 20,
        buyerAccessibility: 10,
        differentiation: 10,
        commercialPotential: 10,
      },
    }) as ICPProfile,
);
