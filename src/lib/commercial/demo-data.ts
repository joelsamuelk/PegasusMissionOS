import type { CommercialMotion, ICPProfile } from "./types";

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

export interface RankedAccount {
  id: string;
  name: string;
  domain: string;
  motion: CommercialMotion;
  icp: string;
  sector: string;
  location: string;
  fit: number;
  intent: number;
  confidence: number;
  whyNow: string;
  angle: string;
  person: string;
  role: string;
  nextAction: string;
  lastInteraction: string;
  source: string;
  sourceUrl: string;
  unknowns: string[];
  priority: number;
  recommendationType?: "new" | "changed" | "follow_up" | "opportunity";
}

export const rankedAccounts: RankedAccount[] = [
  {
    id: "northstar",
    name: "Northstar Youth Trust",
    domain: "northstaryouth.org",
    motion: "mission_os",
    icp: "Mission OS",
    sector: "Youth charity",
    location: "London, UK",
    fit: 91,
    intent: 82,
    confidence: 88,
    whyNow: "Published a 2026–29 strategy expanding from 4 to 7 programmes.",
    angle: "Explore how programme, funding and impact reporting will scale together.",
    person: "Maya Okafor",
    role: "Chief Operating Officer",
    nextAction: "Draft a founder introduction",
    lastInteraction: "No prior contact",
    source: "2026–29 organisational strategy",
    sourceUrl: "#",
    unknowns: ["Current systems", "Procurement timeline", "Available budget"],
    priority: 92,
    recommendationType: "new",
  },
  {
    id: "relay",
    name: "Relay Health",
    domain: "relayhealth.example",
    motion: "studio",
    icp: "AI Transformation",
    sector: "Health technology",
    location: "Cambridge, UK",
    fit: 88,
    intent: 85,
    confidence: 81,
    whyNow: "Announced an AI clinical-operations programme 12 days ago.",
    angle: "Test whether workflow design and safe delivery are slowing the initiative.",
    person: "Daniel Chen",
    role: "Chief Technology Officer",
    nextAction: "Review research, then draft email",
    lastInteraction: "Article shared · 6 months ago",
    source: "Company newsroom announcement",
    sourceUrl: "#",
    unknowns: ["Delivery partner", "Programme budget", "Technical architecture"],
    priority: 90,
    recommendationType: "changed",
  },
  {
    id: "common-ground",
    name: "Common Ground Foundation",
    domain: "commonground.example",
    motion: "mission_os",
    icp: "Mission OS",
    sector: "Community foundation",
    location: "Manchester, UK",
    fit: 86,
    intent: 73,
    confidence: 92,
    whyNow: "Annual report shows 14 active funds and three new regional programmes.",
    angle: "Discuss a clearer operating picture across restricted funds and outcomes.",
    person: "Sofia Williams",
    role: "Director of Impact",
    nextAction: "Request warm introduction via Leah",
    lastInteraction: "Met at Good Finance event · 48 days ago",
    source: "2025–26 annual report",
    sourceUrl: "#",
    unknowns: ["CRM in use", "Reporting pain is a hypothesis"],
    priority: 86,
    recommendationType: "follow_up",
  },
  {
    id: "kinetic",
    name: "Kinetic Materials",
    domain: "kinetic.example",
    motion: "studio",
    icp: "Product Build",
    sector: "Climate technology",
    location: "Bristol, UK",
    fit: 82,
    intent: 78,
    confidence: 76,
    whyNow: "Opened six product and engineering roles after a seed raise.",
    angle: "Ask how they are balancing hiring with the next product milestone.",
    person: "Priya Shah",
    role: "Co-founder & CPO",
    nextAction: "Find an introduction path",
    lastInteraction: "No prior contact",
    source: "Public careers page",
    sourceUrl: "#",
    unknowns: ["Product maturity", "External delivery appetite"],
    priority: 82,
    recommendationType: "new",
  },
];
