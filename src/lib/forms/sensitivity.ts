import type { FieldSensitivity, Form, FormField, SubmissionAnswer } from "@/types/domain";

/**
 * Field sensitivity, and what it decides.
 *
 * `MISSION_OS_EXPANSION_PLAN.md` §MG-12 names this phase as the one most
 * likely to introduce beneficiary and case data by accident, and states the
 * condition on doing so: *if it is introduced, sensitivity, retention,
 * deletion and redaction are designed in the same change, never after.* This
 * file is that condition being met rather than promised.
 *
 * Sensitivity is a property of the **field**, fixed when the form is designed.
 * Classifying an answer after it exists is already too late: it has been
 * unclassified for however long it sat there, and everything that read it in
 * the meantime read it unclassified.
 */

export const SENSITIVITY_ORDER: Record<FieldSensitivity, number> = {
  public: 0,
  internal: 1,
  personal: 2,
  special_category: 3,
};

export const SENSITIVITY_LABELS: Record<FieldSensitivity, string> = {
  public: "Public",
  internal: "Internal",
  personal: "Personal data",
  special_category: "Special category data",
};

export const SENSITIVITY_DESCRIPTIONS: Record<FieldSensitivity, string> = {
  public: "Nothing here identifies anybody, and it could be published.",
  internal: "Organisational information. Not personal, not for publication.",
  personal:
    "Identifies a living person. Never reaches a model, and requires a lawful basis.",
  special_category:
    "UK GDPR Article 9: health, ethnicity, religion, sexual life, biometrics, or criminal offence data. Requires a lawful basis, an explicit retention period and a capability most roles do not hold.",
};

/**
 * Whether an answer may ever be assembled into AI context.
 *
 * Expressed as a positive predicate rather than a redaction step, and the
 * difference is not stylistic. Redaction is something a caller does and can
 * forget; this is a filter the context assembler applies, so an answer that
 * should not reach a model is never assembled rather than being assembled and
 * then stripped.
 */
export function mayReachModel(sensitivity: FieldSensitivity): boolean {
  return sensitivity === "public" || sensitivity === "internal";
}

/** The capability required to read answers at this level. */
export function capabilityFor(sensitivity: FieldSensitivity): string {
  return sensitivity === "special_category" ? "beneficiary_data:view" : "read";
}

/** The highest sensitivity anywhere in a set of fields. */
export function peakSensitivity(fields: { sensitivity: FieldSensitivity }[]): FieldSensitivity {
  return fields.reduce<FieldSensitivity>(
    (peak, field) =>
      SENSITIVITY_ORDER[field.sensitivity] > SENSITIVITY_ORDER[peak] ? field.sensitivity : peak,
    "public",
  );
}

export interface PublishProblem {
  code: string;
  message: string;
}

/**
 * Whether a form may be published at all.
 *
 * These are refusals, not warnings. A form that collects special category data
 * without a lawful basis or a retention period is not a form with a gap in its
 * settings — it is a form that should not exist, and the moment to say so is
 * before it is put in front of anybody.
 */
export function checkPublishable(form: Form, fields: FormField[]): PublishProblem[] {
  const problems: PublishProblem[] = [];
  const peak = peakSensitivity(fields);

  if (fields.length === 0) {
    problems.push({
      code: "no_fields",
      message: "A form with no fields cannot be published.",
    });
  }

  if (SENSITIVITY_ORDER[peak] >= SENSITIVITY_ORDER.personal) {
    if (!form.lawfulBasis || form.lawfulBasis.basis === "not_recorded") {
      problems.push({
        code: "no_lawful_basis",
        message:
          "This form collects personal data and does not record a lawful basis for holding it. Record the basis before publishing.",
      });
    }
  }

  if (peak === "special_category") {
    if (!form.retentionDays || form.retentionDays <= 0) {
      problems.push({
        code: "no_retention",
        message:
          "This form collects special category data and does not say how long answers are kept. Indefinitely is not a retention policy.",
      });
    }
    if (form.access === "public") {
      // Not an absolute prohibition in law, but it is one here: a public URL
      // collecting Article 9 data with no access control is a decision that
      // should be made deliberately elsewhere, not reached by ticking a box.
      problems.push({
        code: "public_special_category",
        message:
          "A form collecting special category data cannot be served at a public URL. Use a link with access control, so the organisation knows who was asked.",
      });
    }
  }

  const consentFields = fields.filter((field) => field.type === "consent");
  for (const field of consentFields) {
    if (!field.consentPurpose?.trim()) {
      problems.push({
        code: "consent_without_purpose",
        message: `"${field.label}" asks for consent without saying what to. Consent to an unstated purpose is not consent.`,
      });
    }
  }

  if (SENSITIVITY_ORDER[peak] >= SENSITIVITY_ORDER.personal && consentFields.length === 0) {
    if (form.lawfulBasis?.basis === "consent") {
      problems.push({
        code: "consent_basis_without_field",
        message:
          "This form claims consent as its lawful basis and does not ask for any. Add a consent field, or record the basis that actually applies.",
      });
    }
  }

  return problems;
}

/**
 * Filter answers down to what a model may see.
 *
 * Returns both halves. The withheld list is not decoration: a context that
 * quietly contains six of twelve answers, with no indication that six are
 * missing, invites a model to reason as though it saw everything.
 */
export function partitionForModel(answers: SubmissionAnswer[]): {
  visible: SubmissionAnswer[];
  withheld: { fieldKey: string; sensitivity: FieldSensitivity }[];
} {
  const visible: SubmissionAnswer[] = [];
  const withheld: { fieldKey: string; sensitivity: FieldSensitivity }[] = [];

  for (const answer of answers) {
    if (answer.redacted) {
      withheld.push({ fieldKey: answer.fieldKey, sensitivity: answer.sensitivity });
      continue;
    }
    if (mayReachModel(answer.sensitivity)) visible.push(answer);
    else withheld.push({ fieldKey: answer.fieldKey, sensitivity: answer.sensitivity });
  }

  return { visible, withheld };
}

/**
 * Which answers are due for erasure.
 *
 * Retention is a promise, and a promise nothing enforces is a sentence in a
 * privacy policy. The answers are erased and the submission record is kept:
 * "somebody submitted this form on this date, and the answers have been
 * deleted under our retention policy" is a true and useful statement, and
 * deleting the submission too would make the erasure itself unprovable.
 */
export function answersDueForErasure(
  submissions: { id: string; retainUntil?: string }[],
  now: Date,
): string[] {
  return submissions
    .filter((submission) => {
      if (!submission.retainUntil) return false;
      const until = Date.parse(submission.retainUntil);
      return Number.isFinite(until) && until <= now.getTime();
    })
    .map((submission) => submission.id);
}

/** The retention date for a submission, from the form's policy. */
export function retainUntil(form: Form, submittedAt: Date): string | undefined {
  if (!form.retentionDays || form.retentionDays <= 0) return undefined;
  return new Date(submittedAt.getTime() + form.retentionDays * 86_400_000).toISOString();
}
