import type { Claim, ImpactReportSection } from "@/types/domain";
import { renderClaimValue } from "@/lib/knowledge";

/**
 * Invariant 5, enforced rather than intended.
 *
 * *Published reports do not silently change.* Half of that was upheld the day
 * `ImpactReportSection.claimIds` shipped: a cited figure is a pointer to an
 * immutable claim, so it cannot move underneath the report. The other half was
 * never enforced and is the reason the invariant has stayed amber through four
 * slices: **a number typed into prose is not a citation**, and nothing stopped
 * one being typed.
 *
 * "Migrate the legacy free-text figures onto claimIds" is the instruction. You
 * cannot migrate what you cannot find, so this module finds them: every
 * number-shaped token in a section's prose that no cited claim accounts for.
 *
 * Two properties matter more than recall here.
 *
 * **It must not fire on prose that is not a figure.** A report saying "in
 * 2025 we worked across 3 boroughs" contains two numbers and one of them is a
 * year. Flagging every integer would produce a warning list nobody reads,
 * which is worse than no warning at all. The exclusions below are therefore
 * deliberate and are the part of this file most likely to need tuning against
 * real reports.
 *
 * **It must be explainable.** Each finding names the token, the sentence it
 * sits in, and what would resolve it. "This section has uncited figures" is a
 * complaint; "the figure 58% in the second sentence is not backed by any cited
 * claim" is a task.
 */

export interface UncitedFigure {
  sectionKey: string;
  /** The number as it appears. */
  token: string;
  /** Enough surrounding text for a person to find it. */
  context: string;
  kind: "money" | "percentage" | "count";
}

/**
 * Numbers that are not claims about performance.
 *
 * A four-digit number between 1900 and 2100 is a year; a number written as
 * part of a date is a date. Both appear constantly in reporting prose and
 * neither is a figure a funder would ask to see evidence for.
 */
const YEAR = /^(19|20|21)\d{2}$/;

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

/** Money, percentages and bare counts, in that order of specificity. */
const FIGURE_PATTERN =
  /(?<money>[£$€]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion))?)|(?<percentage>\d[\d,]*(?:\.\d+)?\s?(?:%|per\s?cent))|(?<count>\b\d[\d,]*(?:\.\d+)?\b)/gi;

function normaliseNumber(token: string): string {
  return token.replace(/[^\d.]/g, "");
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index - 1) + 1);
  const end = text.indexOf(".", index);
  return text.slice(start, end === -1 ? text.length : end + 1).trim();
}

/**
 * Whether a cited claim accounts for a number.
 *
 * Matching is on the digits alone, so "58%" is accounted for by a claim
 * rendering "58 %", "58 percent" or "58". That is deliberately generous: the
 * cost of a false negative here is a warning about a figure that *is* cited,
 * which annoys the writer and teaches them to ignore the list.
 */
function accountedFor(token: string, citedTexts: string[]): boolean {
  const digits = normaliseNumber(token);
  if (!digits) return true;
  return citedTexts.some((text) => normaliseNumber(text).includes(digits));
}

export interface FigureAuditInput {
  sections: ImpactReportSection[];
  claims: Claim[];
  /** Counts below this are almost always prose ("three of our four sites"). */
  minimumCount?: number;
}

export function detectUncitedFigures(input: FigureAuditInput): UncitedFigure[] {
  const { sections, claims } = input;
  const minimumCount = input.minimumCount ?? 10;
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const found: UncitedFigure[] = [];

  const dateLike = new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\b|\\b(?:${MONTHS})\\s+\\d{1,2}\\b`, "gi");

  for (const section of sections) {
    const content = section.content ?? "";
    if (!content.trim()) continue;

    const cited = (section.claimIds ?? [])
      .map((id) => claimsById.get(id))
      .filter((claim): claim is Claim => Boolean(claim))
      .flatMap((claim) => [claim.text, renderClaimValue(claim.value), claim.workings ?? ""]);

    // Blank out anything that reads as a date before scanning for figures, so
    // "15 March" never becomes an uncited count of fifteen.
    const scanned = content.replace(dateLike, (match) => " ".repeat(match.length));

    const pattern = new RegExp(FIGURE_PATTERN.source, FIGURE_PATTERN.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(scanned)) !== null) {
      const groups = match.groups ?? {};
      const token = (groups.money ?? groups.percentage ?? groups.count ?? "").trim();
      if (!token) continue;

      const kind: UncitedFigure["kind"] = groups.money
        ? "money"
        : groups.percentage
          ? "percentage"
          : "count";

      if (kind === "count") {
        const digits = normaliseNumber(token);
        if (YEAR.test(digits)) continue;
        // A small count in prose is nearly always narrative rather than a
        // reported figure. Money and percentages are never exempted: a report
        // saying "we spent £4,000" is making a financial claim whatever the
        // size of the number.
        if (Number(digits) < minimumCount) continue;
      }

      if (accountedFor(token, cited)) continue;

      found.push({
        sectionKey: section.key,
        token,
        context: sentenceAround(content, match.index),
        kind,
      });
    }
  }

  return found;
}

/**
 * How serious an uncited figure is.
 *
 * Money and percentages are blockers: those are the numbers a funder acts on
 * and the numbers an auditor asks about. A bare count is a warning, because
 * the pattern above cannot reliably tell "we ran 24 workshops" from "24
 * Bradford Road".
 */
export function severityFor(figure: UncitedFigure): "blocker" | "warning" {
  return figure.kind === "count" ? "warning" : "blocker";
}

export function describeUncitedFigure(figure: UncitedFigure): string {
  return `${figure.token} appears in this section but no cited claim accounts for it. Record it as a claim and cite it, or remove it. Context: "${figure.context}"`;
}
