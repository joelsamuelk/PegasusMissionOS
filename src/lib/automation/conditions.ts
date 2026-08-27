/**
 * The condition language.
 *
 * An automation is an action taken without a human present, so the question
 * "why did this fire?" must always have an answer, and the answer must be
 * checkable by the person who wrote the rule rather than by the person who
 * wrote the engine. Three decisions follow from that, and they are the whole
 * design.
 *
 * **1. A condition is data, not code.** It is a typed tree that serialises to
 * jsonb. There is no expression string, no `eval`, no sandbox to get wrong. A
 * tenant-authored rule cannot execute anything, which matters because rules
 * are exactly the kind of feature that grows a scripting language by accident.
 *
 * **2. Evaluation is three-valued.** `true`, `false` and **`unknown`**. This
 * is the part most rules engines get wrong and it is not a subtlety: if
 * `report.evidenceCompleteness` is absent and the rule says `< 0.7`, then
 * two-valued logic must answer either true or false, and both are lies. One
 * fires an automation on data nobody has, the other silently never fires and
 * the organisation believes it is covered. `unknown` propagates, and an
 * automation whose condition is `unknown` **does not fire and says why**.
 * This is `missing ≠ assumed` (Invariant 8) applied to automation.
 *
 * **3. Every evaluation returns a trace.** Each leaf records the field, the
 * value it resolved to, and its own result. An automation run stores the
 * trace, so a run can be audited months later without re-deriving anything.
 */

export type FactValue = string | number | boolean | null;

/**
 * The flat, typed view of a record that conditions read.
 *
 * Flat on purpose. A rule author writes `grant.health`, not a path expression
 * into a nested object, and a flat bag means the set of addressable fields is
 * enumerable — which is what lets the rule builder offer a list rather than a
 * text box, and what lets an unknown field be *detected* rather than resolving
 * to `undefined` somewhere deep in an object.
 */
export type FactBag = Record<string, FactValue | undefined>;

export type ComparisonOperator = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";

export type SetOperator = "in" | "not_in";

export type PresenceOperator = "exists" | "not_exists";

export interface FieldCondition {
  type: "field";
  field: string;
  operator: ComparisonOperator | "contains";
  value: FactValue;
}

export interface SetCondition {
  type: "set";
  field: string;
  operator: SetOperator;
  values: FactValue[];
}

export interface PresenceCondition {
  type: "presence";
  field: string;
  operator: PresenceOperator;
}

/**
 * `daysUntil(report.dueDate) <= 30`, from the brief's own examples.
 *
 * A first-class node rather than a function call, because a function call
 * implies a function library, and a function library in a tenant-authored rule
 * is the beginning of a scripting language.
 */
export interface DaysUntilCondition {
  type: "days_until";
  field: string;
  operator: ComparisonOperator;
  days: number;
}

/** `programme.progress < expectedProgress` — two fields on the same record. */
export interface FieldComparisonCondition {
  type: "compare";
  left: string;
  operator: ComparisonOperator;
  right: string;
}

/**
 * `record changed` and `changed to`.
 *
 * Reads the `previous.` namespace, which the dispatcher populates from the
 * event's before-state. A rule about change that could only see the current
 * value would fire on every save.
 */
export interface ChangeCondition {
  type: "changed";
  field: string;
  /** When set, the condition requires the new value to equal this. */
  to?: FactValue;
}

export interface AllCondition {
  type: "all";
  conditions: AutomationCondition[];
}

export interface AnyCondition {
  type: "any";
  conditions: AutomationCondition[];
}

export interface NotCondition {
  type: "not";
  condition: AutomationCondition;
}

export type AutomationCondition =
  | FieldCondition
  | SetCondition
  | PresenceCondition
  | DaysUntilCondition
  | FieldComparisonCondition
  | ChangeCondition
  | AllCondition
  | AnyCondition
  | NotCondition;

export type Truth = "true" | "false" | "unknown";

export interface ConditionTrace {
  /** A human-readable rendering of the node, e.g. `grant.health eq at_risk`. */
  expression: string;
  result: Truth;
  /** Resolved operands, so a run can be audited without re-deriving them. */
  resolved?: Record<string, FactValue | undefined>;
  /** Why the result is unknown, where it is. */
  reason?: string;
  children?: ConditionTrace[];
}

export interface EvaluationResult {
  result: Truth;
  trace: ConditionTrace;
}

export interface EvaluationOptions {
  facts: FactBag;
  now: Date;
}

const UNKNOWN_FIELD = (field: string) =>
  `${field} is not recorded, so this condition cannot be decided. The automation will not fire on data that does not exist.`;

function compare(
  left: FactValue,
  operator: ComparisonOperator,
  right: FactValue,
): Truth {
  if (operator === "eq") return left === right ? "true" : "false";
  if (operator === "neq") return left !== right ? "true" : "false";

  // Ordered comparison over mixed types is a category error rather than a
  // false. Comparing a status string with a number cannot be decided, and
  // answering `false` would let a broken rule look like a rule that simply
  // did not match.
  if (typeof left !== "number" || typeof right !== "number") {
    if (typeof left === "string" && typeof right === "string") {
      const order = left.localeCompare(right);
      switch (operator) {
        case "lt":
          return order < 0 ? "true" : "false";
        case "lte":
          return order <= 0 ? "true" : "false";
        case "gt":
          return order > 0 ? "true" : "false";
        case "gte":
          return order >= 0 ? "true" : "false";
      }
    }
    return "unknown";
  }

  switch (operator) {
    case "lt":
      return left < right ? "true" : "false";
    case "lte":
      return left <= right ? "true" : "false";
    case "gt":
      return left > right ? "true" : "false";
    case "gte":
      return left >= right ? "true" : "false";
  }
}

function daysBetween(from: Date, iso: string): number | undefined {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return undefined;
  const startOfDay = (value: number) => {
    const date = new Date(value);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  };
  return Math.round((startOfDay(target) - startOfDay(from.getTime())) / 86_400_000);
}

/**
 * Three-valued conjunction and disjunction.
 *
 * `all` is false if any child is false, even when another is unknown: a rule
 * requiring three things does not fire if one of them is definitely absent,
 * whatever is unknown about the others. `any` is true if any child is true,
 * for the same reason in the opposite direction. Only where the result would
 * actually turn on the unknown value does the whole become unknown.
 */
function combineAll(results: Truth[]): Truth {
  if (results.includes("false")) return "false";
  if (results.includes("unknown")) return "unknown";
  return "true";
}

function combineAny(results: Truth[]): Truth {
  if (results.includes("true")) return "true";
  if (results.includes("unknown")) return "unknown";
  return "false";
}

export function evaluateCondition(
  condition: AutomationCondition,
  options: EvaluationOptions,
): EvaluationResult {
  const { facts, now } = options;

  switch (condition.type) {
    case "field": {
      const actual = facts[condition.field];
      if (actual === undefined) {
        return {
          result: "unknown",
          trace: {
            expression: `${condition.field} ${condition.operator} ${String(condition.value)}`,
            result: "unknown",
            reason: UNKNOWN_FIELD(condition.field),
          },
        };
      }
      const result =
        condition.operator === "contains"
          ? typeof actual === "string" && typeof condition.value === "string"
            ? actual.toLowerCase().includes(condition.value.toLowerCase())
              ? "true"
              : "false"
            : "unknown"
          : compare(actual, condition.operator, condition.value);
      return {
        result,
        trace: {
          expression: `${condition.field} ${condition.operator} ${String(condition.value)}`,
          result,
          resolved: { [condition.field]: actual },
        },
      };
    }

    case "set": {
      const actual = facts[condition.field];
      if (actual === undefined) {
        return {
          result: "unknown",
          trace: {
            expression: `${condition.field} ${condition.operator} [${condition.values.join(", ")}]`,
            result: "unknown",
            reason: UNKNOWN_FIELD(condition.field),
          },
        };
      }
      const member = condition.values.includes(actual);
      const result: Truth =
        condition.operator === "in" ? (member ? "true" : "false") : member ? "false" : "true";
      return {
        result,
        trace: {
          expression: `${condition.field} ${condition.operator} [${condition.values.join(", ")}]`,
          result,
          resolved: { [condition.field]: actual },
        },
      };
    }

    case "presence": {
      const actual = facts[condition.field];
      // Presence is the one operator that is never unknown: whether a field is
      // recorded is itself always knowable, and the whole point of `exists` is
      // to let a rule author handle absence deliberately.
      const present = actual !== undefined && actual !== null && actual !== "";
      const result: Truth =
        condition.operator === "exists" ? (present ? "true" : "false") : present ? "false" : "true";
      return {
        result,
        trace: {
          expression: `${condition.field} ${condition.operator}`,
          result,
          resolved: { [condition.field]: actual ?? null },
        },
      };
    }

    case "days_until": {
      const actual = facts[condition.field];
      if (typeof actual !== "string") {
        return {
          result: "unknown",
          trace: {
            expression: `daysUntil(${condition.field}) ${condition.operator} ${condition.days}`,
            result: "unknown",
            reason: UNKNOWN_FIELD(condition.field),
          },
        };
      }
      const days = daysBetween(now, actual);
      if (days === undefined) {
        return {
          result: "unknown",
          trace: {
            expression: `daysUntil(${condition.field}) ${condition.operator} ${condition.days}`,
            result: "unknown",
            reason: `${condition.field} holds "${actual}", which is not a date this engine can read.`,
          },
        };
      }
      const result = compare(days, condition.operator, condition.days);
      return {
        result,
        trace: {
          expression: `daysUntil(${condition.field}) ${condition.operator} ${condition.days}`,
          result,
          resolved: { [condition.field]: actual, days },
        },
      };
    }

    case "compare": {
      const left = facts[condition.left];
      const right = facts[condition.right];
      const missing = [
        left === undefined ? condition.left : null,
        right === undefined ? condition.right : null,
      ].filter(Boolean);
      if (missing.length > 0) {
        return {
          result: "unknown",
          trace: {
            expression: `${condition.left} ${condition.operator} ${condition.right}`,
            result: "unknown",
            reason: UNKNOWN_FIELD(missing.join(" and ")),
          },
        };
      }
      const result = compare(left!, condition.operator, right!);
      return {
        result,
        trace: {
          expression: `${condition.left} ${condition.operator} ${condition.right}`,
          result,
          resolved: { [condition.left]: left, [condition.right]: right },
        },
      };
    }

    case "changed": {
      const previousKey = `previous.${condition.field}`;
      const current = facts[condition.field];
      const previous = facts[previousKey];

      /**
       * No recorded previous value means change cannot be established.
       *
       * This is the case that must not be answered `true`. An event carrying
       * `grant.health = at_risk` and no previous value would otherwise compare
       * `undefined !== "at_risk"` and report a change — which is how a
       * simulation over current records, where there is no "before" at all,
       * would report that a change rule fires on everything. The engine's
       * contract is therefore that **a change event carries its previous
       * value**, and an event that does not is undecidable rather than
       * assumed either way.
       */
      if (previous === undefined) {
        return {
          result: "unknown",
          trace: {
            expression:
              condition.to === undefined
                ? `${condition.field} changed`
                : `${condition.field} changed to ${String(condition.to)}`,
            result: "unknown",
            reason: `No previous value for ${condition.field} was recorded on this event, so whether it changed cannot be established.`,
            resolved: { [condition.field]: current ?? null },
          },
        };
      }

      const changed = previous !== current;
      const result: Truth =
        !changed
          ? "false"
          : condition.to === undefined
            ? "true"
            : current === condition.to
              ? "true"
              : "false";
      return {
        result,
        trace: {
          expression:
            condition.to === undefined
              ? `${condition.field} changed`
              : `${condition.field} changed to ${String(condition.to)}`,
          result,
          resolved: { [previousKey]: previous ?? null, [condition.field]: current ?? null },
        },
      };
    }

    case "all":
    case "any": {
      const children = condition.conditions.map((child) => evaluateCondition(child, options));
      const results = children.map((child) => child.result);
      const result = condition.type === "all" ? combineAll(results) : combineAny(results);
      return {
        result,
        trace: {
          expression: condition.type === "all" ? "all of" : "any of",
          result,
          children: children.map((child) => child.trace),
        },
      };
    }

    case "not": {
      const child = evaluateCondition(condition.condition, options);
      const result: Truth =
        child.result === "unknown" ? "unknown" : child.result === "true" ? "false" : "true";
      return {
        result,
        trace: { expression: "not", result, children: [child.trace] },
      };
    }
  }
}

/** Every field a condition tree reads. Used to check a rule against a schema. */
export function fieldsUsed(condition: AutomationCondition): string[] {
  switch (condition.type) {
    case "field":
    case "set":
    case "presence":
    case "days_until":
      return [condition.field];
    case "changed":
      return [condition.field, `previous.${condition.field}`];
    case "compare":
      return [condition.left, condition.right];
    case "all":
    case "any":
      return condition.conditions.flatMap(fieldsUsed);
    case "not":
      return fieldsUsed(condition.condition);
  }
}

/** Flatten a trace to the leaves that decided it, for display. */
export function decidingLeaves(trace: ConditionTrace): ConditionTrace[] {
  if (!trace.children) return [trace];
  return trace.children.flatMap(decidingLeaves);
}

/** A one-line explanation of why a run did or did not fire. */
export function explainTrace(trace: ConditionTrace): string {
  const leaves = decidingLeaves(trace);
  const unknowns = leaves.filter((leaf) => leaf.result === "unknown");
  if (unknowns.length > 0) {
    return `Could not be decided: ${unknowns.map((leaf) => leaf.reason ?? leaf.expression).join(" ")}`;
  }
  const failed = leaves.filter((leaf) => leaf.result === "false");
  if (trace.result === "false") {
    return `Did not match: ${failed.map((leaf) => leaf.expression).join("; ")}`;
  }
  return `Matched: ${leaves.map((leaf) => leaf.expression).join("; ")}`;
}
