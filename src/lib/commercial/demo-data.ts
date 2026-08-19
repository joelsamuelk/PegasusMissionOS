import type { CommercialMotion } from "./types";

/**
 * Curated example accounts for a live demonstration.
 *
 * Nothing here is real. It renders only for an account `resolveDemoMode`
 * accepts, so a real operator is never shown an invented pipeline. Import it
 * only behind `ctx.demoMode`.
 */
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
