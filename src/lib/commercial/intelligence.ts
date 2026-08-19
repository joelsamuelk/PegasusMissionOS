import type { CommercialMotion, CommercialSignal, ResearchClaim } from "./types";
import { signalStrength } from "./engine";

export type CommercialSourceAuthority =
  | "official_registry"
  | "official_organisation"
  | "official_document"
  | "authoritative_public_source"
  | "reputable_news"
  | "professional_directory"
  | "other_public_source";
const authorityWeight: Record<CommercialSourceAuthority, number> = {
  official_registry: 1,
  official_organisation: 0.95,
  official_document: 0.95,
  authoritative_public_source: 0.9,
  reputable_news: 0.8,
  professional_directory: 0.65,
  other_public_source: 0.5,
};
export function sourceAuthorityWeight(authority: CommercialSourceAuthority) {
  return authorityWeight[authority];
}
export function corroboratedConfidence(
  evidence: {
    authority: CommercialSourceAuthority;
    independenceKey: string;
    confidence: number;
  }[],
) {
  const strongestByOrigin = new Map<string, (typeof evidence)[number]>();
  for (const item of evidence) {
    const current = strongestByOrigin.get(item.independenceKey);
    if (
      !current ||
      item.confidence * sourceAuthorityWeight(item.authority) >
        current.confidence * sourceAuthorityWeight(current.authority)
    )
      strongestByOrigin.set(item.independenceKey, item);
  }
  const independent = [...strongestByOrigin.values()];
  if (!independent.length) return { confidence: 0, independentSources: 0 };
  const strongest = Math.max(
    ...independent.map((x) => x.confidence * sourceAuthorityWeight(x.authority)),
  );
  const corroboration = Math.min(0.15, Math.max(0, independent.length - 1) * 0.05);
  return {
    confidence: Math.min(1, Number((strongest + corroboration).toFixed(2))),
    independentSources: independent.length,
  };
}
export interface ProspectChange {
  type: string;
  claimId: string;
  description: string;
  eventDate?: string;
  detectedAt: string;
}
export function detectMeaningfulChanges(
  previous: ResearchClaim[],
  current: ResearchClaim[],
  detectedAt: string,
): ProspectChange[] {
  const prior = new Set(previous.map((c) => c.claim.toLowerCase().replace(/\s+/g, " ")));
  const meaningful =
    /(appointed|joined|funding|grant|new programme|expansion|strategy|hiring|launch|acquisition|ai initiative)/i;
  return current
    .filter(
      (c) =>
        c.kind === "fact" &&
        !prior.has(c.claim.toLowerCase().replace(/\s+/g, " ")) &&
        meaningful.test(c.claim),
    )
    .map((c) => ({
      type:
        meaningful.exec(c.claim)?.[0]?.toLowerCase().replace(/\s+/g, "_") ??
        "meaningful_change",
      claimId: c.id,
      description: c.claim,
      eventDate: c.observedAt,
      detectedAt,
    }));
}
export function shouldEnrichPeople(
  input: { fit: number; confidence: number; researchState: string },
  threshold = { fit: 70, confidence: 60 },
) {
  return (
    input.researchState === "qualified" &&
    input.fit >= threshold.fit &&
    input.confidence >= threshold.confidence
  );
}
const decayDays: Record<string, number> = {
  leadership_appointment: 180,
  leadership_departure: 120,
  job_posting: 45,
  funding_round: 150,
  grant_award: 180,
  annual_report: 365,
  impact_report: 365,
  new_strategy: 270,
  programme_expansion: 180,
  ai_initiative: 150,
  product_launch: 90,
  market_expansion: 150,
};
export function decayPolicy(type: string) {
  return decayDays[type] ?? 90;
}
export function extractCommercialSignals(input: {
  accountId: string;
  motion: CommercialMotion;
  claims: ResearchClaim[];
  now: string;
}): CommercialSignal[] {
  const rules =
    input.motion === "mission_os"
      ? [
          { type: "annual_report", terms: ["annual report"] },
          { type: "impact_report", terms: ["impact report"] },
          {
            type: "programme_expansion",
            terms: ["new programme", "programme expansion", "regional programme"],
          },
          { type: "new_strategy", terms: ["strategic plan", "new strategy"] },
          { type: "grant_award", terms: ["grant award", "funding award"] },
        ]
      : [
          {
            type: "ai_initiative",
            terms: ["ai initiative", "artificial intelligence programme"],
          },
          { type: "job_posting", terms: ["engineering roles", "hiring engineers"] },
          { type: "funding_round", terms: ["seed raise", "funding round"] },
          { type: "leadership_appointment", terms: ["new cto", "appointed cto"] },
          { type: "market_expansion", terms: ["market expansion", "new markets"] },
        ];
  return rules.flatMap((rule) =>
    input.claims
      .filter(
        (c) =>
          c.kind === "fact" && rule.terms.some((t) => c.claim.toLowerCase().includes(t)),
      )
      .map((c) => ({
        id: `signal-${c.id}-${rule.type}`,
        accountId: input.accountId,
        type: rule.type,
        description: c.claim,
        source: c.source ?? "Unknown source",
        sourceUrl: c.sourceUrl ?? "",
        observedAt: c.observedAt ?? input.now,
        confidence: c.confidence,
        relevance: rule.type === "annual_report" ? 65 : 85,
        decayDays: decayPolicy(rule.type),
        interpretation:
          input.motion === "mission_os"
            ? "Evidence may indicate programme, funding or reporting complexity. It does not establish a need for Mission OS."
            : "Evidence may create relevant technology or delivery pressure. The internal problem remains unknown.",
      })),
  );
}
export interface BuyerCandidate {
  id: string;
  name: string;
  title: string;
  sourceUrl: string;
  confidence: number;
}
const weights: Record<CommercialMotion, Record<string, number>> = {
  studio: {
    cto: 100,
    "chief technology officer": 100,
    cpo: 90,
    "vp engineering": 85,
    coo: 75,
    ceo: 70,
    "chief digital officer": 90,
    transformation: 85,
  },
  mission_os: {
    coo: 100,
    "chief operating officer": 100,
    "impact director": 92,
    "fundraising director": 90,
    "development director": 88,
    "programme director": 85,
    "finance director": 80,
    ceo: 75,
    "executive director": 75,
  },
};
export function rankBuyers(people: BuyerCandidate[], motion: CommercialMotion) {
  return people
    .map((person) => {
      const title = person.title.toLowerCase();
      const roleScore = Math.max(
        0,
        ...Object.entries(weights[motion])
          .filter(([role]) => title.includes(role))
          .map(([, score]) => score),
      );
      return {
        ...person,
        score: Math.round(roleScore * person.confidence),
        reason: roleScore
          ? `The ${person.title} role is relevant to the ${motion === "studio" ? "Studio" : "Mission OS"} motion; influence still requires confirmation.`
          : "Role relevance is unknown.",
      };
    })
    .sort((a, b) => b.score - a.score);
}
export function recommendationScore(
  input: {
    fit: number;
    intent: number;
    confidence: number;
    signals: CommercialSignal[];
    relationship: number;
    followUpDue: boolean;
    activeOpportunity: boolean;
    buyerIdentified: boolean;
  },
  now = new Date(),
) {
  const fresh = Math.max(0, ...input.signals.map((s) => signalStrength(s, now)));
  const reasons = [
    { label: "ICP match", impact: input.fit * 0.25, positive: true },
    { label: "Current intent", impact: input.intent * 0.2, positive: true },
    { label: "Evidence confidence", impact: input.confidence * 0.15, positive: true },
    { label: "Fresh signal", impact: fresh * 0.2, positive: fresh > 50 },
    {
      label: "Relevant buyer",
      impact: input.buyerIdentified ? 8 : 0,
      positive: input.buyerIdentified,
    },
    {
      label: "Relationship",
      impact: input.relationship * 0.05,
      positive: input.relationship > 0,
    },
    {
      label: "Follow-up due",
      impact: input.followUpDue ? 8 : 0,
      positive: input.followUpDue,
    },
    {
      label: "Active opportunity",
      impact: input.activeOpportunity ? 10 : 0,
      positive: input.activeOpportunity,
    },
  ];
  return {
    score: Math.min(100, Math.round(reasons.reduce((s, r) => s + r.impact, 0))),
    reasons: reasons.map((r) => ({ ...r, impact: Math.round(r.impact) })),
  };
}
export function matchPegasusProof(motion: CommercialMotion, signals: CommercialSignal[]) {
  const types = new Set(signals.map((s) => s.type));
  if (motion === "mission_os")
    return types.has("impact_report") || types.has("annual_report")
      ? {
          title: "Mission OS · Evidence and reporting",
          reason: "Matched to observed public reporting activity.",
        }
      : {
          title: "Pegasus Mission OS",
          reason:
            "Matched to the Mission OS ICP; specific capability fit remains to be tested.",
        };
  if (types.has("ai_initiative"))
    return {
      title: "AI that understands the work around it",
      reason: "Matched to a sourced AI initiative.",
    };
  if (types.has("job_posting") || types.has("market_expansion"))
    return {
      title: "Platform Transformation",
      reason: "Matched to observable growth and delivery signals.",
    };
  return {
    title: "Technology Strategy & Leadership",
    reason: "Broad motion match; confirm relevance before using.",
  };
}
