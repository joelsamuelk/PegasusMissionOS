export interface OutreachGrounding {
  facts: ResearchClaimRef[];
  hypotheses: string[];
  unknowns: string[];
}
export interface ResearchClaimRef {
  id: string;
  text: string;
}
const jargon = [
  "game-changing",
  "revolutionary",
  "synergy",
  "leading provider",
  "hope this email finds you well",
  "impressive company",
];
export function checkOutreachQuality(message: string, grounding: OutreachGrounding) {
  const reasons: string[] = [];
  const lower = message.toLowerCase();
  for (const word of jargon)
    if (lower.includes(word))
      reasons.push(`Avoid generic or sales-led phrase: “${word}”.`);
  if (message.split(/\s+/).length > 180) reasons.push("Message exceeds 180 words.");
  const asks = (message.match(/\?/g) ?? []).length;
  if (asks > 1) reasons.push("Message contains multiple asks.");
  for (const hypothesis of grounding.hypotheses)
    if (
      lower.includes(hypothesis.toLowerCase()) &&
      !/(may|might|wonder|hypothesis|could)/i.test(message)
    )
      reasons.push("A hypothesis is presented without uncertainty language.");
  for (const unknown of grounding.unknowns)
    if (lower.includes(unknown.toLowerCase()))
      reasons.push(`Message asserts an explicitly unknown item: ${unknown}.`);
  return {
    score: Math.max(0, 100 - reasons.length * 20),
    reasons,
    passed: reasons.length === 0,
  };
}
