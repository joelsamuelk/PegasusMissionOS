import type { ClaimValue, FormField } from "@/types/domain";

/**
 * Spam protection for public forms.
 *
 * Deliberately unglamorous, and deliberately without a third-party service.
 * A CAPTCHA sends every respondent's browser fingerprint to a provider the
 * organisation did not choose, and a charity's beneficiary-facing form is the
 * last place that trade is worth making. What ships instead is a honeypot, a
 * timing check and a small set of content heuristics — enough for the actual
 * threat, which is automated form-filling rather than a determined attacker.
 *
 * The governing rule: **a false positive is worse than a false negative.**
 * A missed spam submission costs somebody thirty seconds. A rejected genuine
 * submission from a person who needed help is a failure the organisation never
 * finds out about. So every signal below is scored rather than absolute, and a
 * suspected submission is stored and flagged rather than discarded.
 */

export interface SpamSignal {
  code: string;
  detail: string;
  /** Contribution to the score, 0..100. */
  weight: number;
}

export interface SpamAssessment {
  score: number;
  /** Above the threshold, and therefore flagged for a human to glance at. */
  suspected: boolean;
  signals: SpamSignal[];
}

/** Above this, a submission is flagged. It is never discarded. */
export const SPAM_THRESHOLD = 60;

/** Nobody reads and completes a real form this fast. */
const MINIMUM_SECONDS = 3;

const LINK = /https?:\/\/|www\./gi;
const SHOUTING = /\b[A-Z]{6,}\b/g;

export interface SpamCheckInput {
  fields: FormField[];
  values: Record<string, ClaimValue | undefined>;
  /**
   * A field no human sees, rendered hidden. Anything filling it in is not
   * reading the page. The cheapest and most reliable signal there is.
   */
  honeypotValue?: string;
  /** How long the form was open, in seconds. Absent where it was not measured. */
  secondsOnPage?: number;
}

export function assessSpam(input: SpamCheckInput): SpamAssessment {
  const signals: SpamSignal[] = [];

  if (input.honeypotValue && input.honeypotValue.trim().length > 0) {
    signals.push({
      code: "honeypot_filled",
      detail: "A field no person can see was filled in.",
      weight: 70,
    });
  }

  if (input.secondsOnPage !== undefined && input.secondsOnPage < MINIMUM_SECONDS) {
    signals.push({
      code: "submitted_too_fast",
      detail: `Submitted ${input.secondsOnPage} seconds after the form loaded.`,
      weight: 40,
    });
  }

  const texts = Object.values(input.values)
    .filter((value): value is ClaimValue => value !== undefined)
    .flatMap((value) =>
      value.type === "text" ? [value.text] : value.type === "list" ? value.items : [],
    );

  const links = texts.join(" ").match(LINK)?.length ?? 0;
  if (links >= 3) {
    signals.push({
      code: "many_links",
      detail: `${links} links across the answers.`,
      weight: 30,
    });
  }

  const shouting = texts.join(" ").match(SHOUTING)?.length ?? 0;
  if (shouting >= 4) {
    signals.push({
      code: "shouting",
      detail: `${shouting} words in block capitals.`,
      weight: 15,
    });
  }

  // The same sentence in several free-text answers is a bot filling every box
  // with one payload. A person answering two questions similarly is common, so
  // this needs three.
  const longAnswers = texts.map((text) => text.trim().toLowerCase()).filter((t) => t.length > 20);
  const repeated = longAnswers.filter(
    (text, index) => longAnswers.indexOf(text) !== index,
  ).length;
  if (repeated >= 2) {
    signals.push({
      code: "repeated_answers",
      detail: "The same long answer appears in several fields.",
      weight: 25,
    });
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  return { score, suspected: score >= SPAM_THRESHOLD, signals };
}

/** The hidden field's key. Stable, so a bot cannot learn it from the markup alone. */
export const HONEYPOT_FIELD_KEY = "organisation_website_confirm";
