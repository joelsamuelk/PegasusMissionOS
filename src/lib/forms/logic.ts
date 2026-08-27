import { evaluateCondition, type AutomationCondition, type FactBag } from "@/lib/automation";
import type {
  ClaimValue,
  FormField,
  FormSection,
  SubmissionAnswer,
} from "@/types/domain";

/**
 * Conditional logic and validation.
 *
 * The brief asks for show/hide, required conditions, branching and validation,
 * and says *keep logic deterministic*. It is deterministic here by reusing the
 * automation engine's condition language rather than inventing a second one.
 *
 * That reuse is not tidiness. The brief's first instruction in MG-6 was not to
 * build module-specific automation systems, and a form conditional language is
 * exactly that in disguise: two typed trees, two evaluators, two sets of edge
 * cases, drifting apart. Reusing it also means form logic inherits three-valued
 * evaluation for free, which turns out to matter — see `isVisible` below.
 */

const answerToFact = (value: ClaimValue): string | number | boolean | null => {
  switch (value.type) {
    case "text":
      return value.text;
    case "number":
      return value.number;
    case "money":
      return value.minorUnits;
    case "date":
      return value.date;
    case "boolean":
      return value.boolean;
    case "list":
      // Joined rather than dropped, so `contains` works on a multiselect,
      // which is the only operator that makes sense against one.
      return value.items.join(", ");
  }
};

/**
 * The answers, as the flat bag a condition reads.
 *
 * Keyed by bare field key rather than by a namespace, because a form's
 * conditions only ever refer to its own fields and a namespace would be noise
 * a form designer has to type correctly every time.
 */
export function answerFacts(answers: SubmissionAnswer[]): FactBag {
  const bag: FactBag = {};
  for (const answer of answers) {
    if (answer.redacted) continue;
    bag[answer.fieldKey] = answerToFact(answer.value);
  }
  return bag;
}

export function draftFacts(values: Record<string, ClaimValue | undefined>): FactBag {
  const bag: FactBag = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    bag[key] = answerToFact(value);
  }
  return bag;
}

/**
 * Whether a field is shown.
 *
 * The three-valued evaluation earns its place here. A condition referring to a
 * field the respondent has not reached yet is `unknown`, and an unknown
 * condition **hides** the field rather than showing it. Showing it would mean a
 * form that flickers open as somebody scrolls past an unrelated question;
 * treating unknown as false is the behaviour a form designer expects and the
 * one that cannot surprise a respondent.
 */
export function isVisible(
  condition: unknown | undefined,
  facts: FactBag,
  now: Date,
): boolean {
  if (!condition) return true;
  return evaluateCondition(condition as AutomationCondition, { facts, now }).result === "true";
}

/**
 * Whether an answer is required.
 *
 * A hidden field is never required, whatever its `required` flag says. A form
 * that blocks submission on a question it is not showing is unfillable, and
 * that failure is invisible to the person who built the form.
 */
export function isRequired(field: FormField, facts: FactBag, now: Date): boolean {
  if (!isVisible(field.visibleWhen, facts, now)) return false;
  if (field.requiredWhen) {
    return (
      evaluateCondition(field.requiredWhen as AutomationCondition, { facts, now }).result ===
      "true"
    );
  }
  return field.required;
}

export function visibleFields(fields: FormField[], facts: FactBag, now: Date): FormField[] {
  return fields.filter((field) => isVisible(field.visibleWhen, facts, now));
}

export function visibleSections(
  sections: FormSection[],
  facts: FactBag,
  now: Date,
): FormSection[] {
  return sections.filter((section) => isVisible(section.visibleWhen, facts, now));
}

// --- Validation ---------------------------------------------------------

export interface ValidationProblem {
  fieldKey: string;
  message: string;
}

/** Bounded, so a tenant-supplied pattern cannot be a denial of service. */
const MAX_PATTERN_LENGTH = 200;
const MAX_TEXT_FOR_PATTERN = 4_000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\d][\d\s()-]{5,24}$/;

function asText(value: ClaimValue | undefined): string | undefined {
  if (!value) return undefined;
  if (value.type === "text") return value.text;
  if (value.type === "date") return value.date;
  if (value.type === "list") return value.items.join(", ");
  return undefined;
}

function asNumber(value: ClaimValue | undefined): number | undefined {
  if (!value) return undefined;
  if (value.type === "number") return value.number;
  if (value.type === "money") return value.minorUnits;
  return undefined;
}

/**
 * Validate a set of answers against the version they answer.
 *
 * Runs against the **fields as published**, not against the current form.
 * Validating a submission against a form that has since been edited would
 * reject answers that were valid when they were given.
 */
export function validateSubmission(input: {
  fields: FormField[];
  values: Record<string, ClaimValue | undefined>;
  now: Date;
}): ValidationProblem[] {
  const { fields, values, now } = input;
  const facts = draftFacts(values);
  const problems: ValidationProblem[] = [];

  for (const field of fields) {
    const visible = isVisible(field.visibleWhen, facts, now);
    const value = values[field.key];

    if (!visible) {
      // An answer to a hidden field is a bug in the client or an attempt to
      // bypass branching. Either way it is refused rather than stored: a
      // stored answer to a question nobody was shown is unexplainable later.
      if (value !== undefined) {
        problems.push({
          fieldKey: field.key,
          message: `${field.label} was answered but is not shown by this form's logic.`,
        });
      }
      continue;
    }

    if (isRequired(field, facts, now) && value === undefined) {
      problems.push({ fieldKey: field.key, message: `${field.label} is required.` });
      continue;
    }
    if (value === undefined) continue;

    const text = asText(value);
    const numeric = asNumber(value);
    const rules = field.validation;

    if (field.type === "email" && text && !EMAIL.test(text)) {
      problems.push({ fieldKey: field.key, message: `${field.label} is not an email address.` });
    }
    if (field.type === "phone" && text && !PHONE.test(text)) {
      problems.push({
        fieldKey: field.key,
        message: `${field.label} does not look like a phone number.`,
      });
    }
    if (field.type === "consent" && value.type !== "boolean") {
      problems.push({
        fieldKey: field.key,
        message: `${field.label} must be answered yes or no.`,
      });
    }

    if ((field.type === "select" || field.type === "radio") && text && field.options) {
      if (!field.options.some((option) => option.value === text)) {
        problems.push({
          fieldKey: field.key,
          message: `${field.label} is not one of the offered options.`,
        });
      }
    }
    if (field.type === "multiselect" && value.type === "list" && field.options) {
      const allowed = new Set(field.options.map((option) => option.value));
      const unknown = value.items.filter((item) => !allowed.has(item));
      if (unknown.length > 0) {
        problems.push({
          fieldKey: field.key,
          message: `${field.label} includes options this form does not offer: ${unknown.join(", ")}.`,
        });
      }
    }

    if (rules) {
      if (text !== undefined) {
        if (rules.minLength !== undefined && text.length < rules.minLength) {
          problems.push({
            fieldKey: field.key,
            message: `${field.label} must be at least ${rules.minLength} characters.`,
          });
        }
        if (rules.maxLength !== undefined && text.length > rules.maxLength) {
          problems.push({
            fieldKey: field.key,
            message: `${field.label} must be ${rules.maxLength} characters or fewer.`,
          });
        }
        if (rules.pattern) {
          if (rules.pattern.length > MAX_PATTERN_LENGTH) {
            problems.push({
              fieldKey: field.key,
              message: `${field.label} has a validation pattern that is too long to run safely.`,
            });
          } else if (text.length > MAX_TEXT_FOR_PATTERN) {
            problems.push({
              fieldKey: field.key,
              message: `${field.label} is too long to check against its validation pattern.`,
            });
          } else {
            try {
              // Anchored, so a tenant pattern cannot match a substring and
              // pass a value the designer meant to reject.
              const anchored = new RegExp(`^(?:${rules.pattern})$`);
              if (!anchored.test(text)) {
                problems.push({
                  fieldKey: field.key,
                  message: rules.patternMessage ?? `${field.label} is not in the expected format.`,
                });
              }
            } catch {
              problems.push({
                fieldKey: field.key,
                message: `${field.label} has a validation pattern this form cannot run.`,
              });
            }
          }
        }
      }

      if (numeric !== undefined) {
        if (rules.min !== undefined && numeric < rules.min) {
          problems.push({
            fieldKey: field.key,
            message: `${field.label} must be at least ${rules.min}.`,
          });
        }
        if (rules.max !== undefined && numeric > rules.max) {
          problems.push({
            fieldKey: field.key,
            message: `${field.label} must be ${rules.max} or less.`,
          });
        }
      }
    }
  }

  // An answer to a field the version does not have. Refused rather than
  // ignored, because silently dropping it means a respondent's answer
  // disappears with no record that it ever arrived.
  const known = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(values)) {
    if (known.has(key)) continue;
    problems.push({
      fieldKey: key,
      message: `${key} is not a field on this version of the form.`,
    });
  }

  return problems;
}
