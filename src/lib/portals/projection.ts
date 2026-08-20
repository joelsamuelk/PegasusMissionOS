import { formatMoney } from "@/lib/finance-intelligence/money";
import type { EntityReference, PortalView, ProjectedRecord } from "@/types/domain";
import { findView } from "./views";

/**
 * Turning a record into what a portal user sees.
 *
 * The last of the three rules, and the one that survives everything else going
 * wrong: **a record is projected, never returned.** Even where access was
 * correctly granted, the object that reaches a portal is built field by field
 * from an allowlist rather than serialised and trimmed.
 *
 * The difference matters because trimming is subtractive and projection is
 * additive. A `delete record.internalNotes` has to be updated every time a
 * field is added; an allowlist does not, because a field nobody listed simply
 * never appears. That is the failure mode this phase exists to prevent, and it
 * is a schema change rather than a security bug — which is why it would be
 * missed.
 */

/** Values a projection can render. Anything else is refused, not stringified. */
function render(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const items = value.map(render).filter((item): item is string => item !== null);
    return items.length ? items.join(", ") : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // `Money` is the one structured value a portal renders, because it is the
    // one an external reader most needs and the one most likely to be rendered
    // as "[object Object]" by a generic serialiser.
    if (typeof record.minorUnits === "number" && typeof record.currency === "string") {
      return formatMoney({ minorUnits: record.minorUnits, currency: record.currency });
    }
    /**
     * Everything else is refused.
     *
     * A nested object rendered by a generic serialiser is how an internal id,
     * an audit stamp or a whole related record ends up on a portal page. If an
     * audience needs a structured field, the view names the leaf.
     */
    return null;
  }
  return null;
}

const humanise = (field: string): string =>
  field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());

export interface ProjectInput {
  entity: EntityReference;
  /** The record itself. Never returned; only read from. */
  record: Record<string, unknown>;
  viewKey: string;
}

/**
 * Project a record through a view.
 *
 * Returns null when the view does not exist. There is deliberately no fallback
 * that returns the record with "sensible defaults": a missing view is a
 * configuration error, and the safe response to one is to show nothing.
 */
export function projectRecord(input: ProjectInput): ProjectedRecord | null {
  const view = findView(input.viewKey);
  if (!view) return null;
  return projectThrough(input.entity, input.record, view);
}

export function projectThrough(
  entity: EntityReference,
  record: Record<string, unknown>,
  view: PortalView,
): ProjectedRecord {
  const fields: ProjectedRecord["fields"] = [];
  const withheld: string[] = [];

  for (const name of view.fields) {
    const value = render(record[name]);
    if (value === null) continue;
    fields.push({ name, label: humanise(name), value });
  }

  /**
   * What is not shown, named.
   *
   * A funder shown four fields of a grant with no indication that six exist
   * will reason as though they have seen the record. Listing the withheld
   * field names is both more honest and, in practice, the thing that stops the
   * follow-up email asking for them.
   *
   * Internal identifiers are excluded from the withheld list as well as from
   * the projection: telling somebody that `grantManagerId` exists is a small
   * leak of internal structure, and it is not information they can use.
   */
  const shown = new Set(view.fields);
  for (const key of Object.keys(record)) {
    if (shown.has(key)) continue;
    if (key === "id" || key === "organisationId" || key === "audit") continue;
    if (key.endsWith("Id") || key.endsWith("Ids")) continue;
    withheld.push(humanise(key));
  }

  return {
    entity: { type: entity.type, id: entity.id, label: entity.label },
    viewKey: view.key,
    fields,
    withheld,
    withheldNote: view.withheldNote,
  };
}

/**
 * Whether a projection accidentally carries something it should not.
 *
 * A belt-and-braces check used by the tests rather than at runtime: the
 * allowlist already makes this impossible, and a runtime scan would be
 * defending against a bug the type system and the projection both prevent.
 * Having it available means a test can assert the absence of a class of value
 * rather than of a specific field name, which is what catches the next field
 * somebody adds.
 */
export function looksInternal(value: string): boolean {
  return (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value) ||
    /^(user|org|grant|prog|txn|alloc|claim)-/.test(value) ||
    value.includes("[object Object]")
  );
}
