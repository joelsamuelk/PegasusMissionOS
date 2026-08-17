import type { AuditStamp } from "@/types/domain";

/**
 * Row mapping between Postgres and the domain model.
 *
 * The schema is `snake_case`; the domain model is `camelCase`. A generic
 * converter handles the bulk, but it is deliberately **not** applied blindly:
 * several columns do not map by name alone, and silently mis-mapping one is the
 * kind of defect that reads correctly and returns wrong data.
 *
 * Known non-mechanical cases, each handled explicitly by its entity mapper:
 *
 * - Audit columns (`created_at`, `updated_at`, `created_by`, `archived_at`)
 *   collapse into a nested `audit` object rather than four flat fields.
 * - `numeric` arrives as a string from PostgREST when it exceeds the safe
 *   integer range, so money and award columns are parsed rather than cast.
 * - `date` columns are returned as `YYYY-MM-DD` strings and must stay strings;
 *   converting them to `Date` and back introduces a timezone shift that moves
 *   deadlines by a day.
 */

export type Row = Record<string, unknown>;

export function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Columns that belong in the nested `audit` object, not on the entity. */
const AUDIT_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "archived_at",
]);

export function auditFrom(row: Row): AuditStamp {
  return {
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    ...(row.created_by ? { createdBy: String(row.created_by) } : {}),
    ...(row.updated_by ? { updatedBy: String(row.updated_by) } : {}),
    archivedAt: (row.archived_at as string | null) ?? null,
  };
}

/**
 * Convert a row to camelCase, lifting audit columns into `audit`.
 *
 * Entity mappers build on this and then fix up the fields that need typed
 * handling. It is a starting point, not a substitute for knowing the schema.
 */
export function baseFrom<T extends Row>(row: Row): T & { audit: AuditStamp } {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (AUDIT_COLUMNS.has(key)) continue;
    out[toCamel(key)] = value;
  }
  out.audit = auditFrom(row);
  return out as T & { audit: AuditStamp };
}

/**
 * Parse a Postgres `numeric`.
 *
 * PostgREST returns `numeric` as a **string** when the value cannot be
 * represented exactly as a JavaScript number, and as a number otherwise. Code
 * that assumes one or the other produces `NaN` on real award values, so both
 * are handled and an unparseable value falls back rather than propagating NaN
 * into an arithmetic chain.
 */
export function numberFrom(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function optionalNumberFrom(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = numberFrom(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Postgres `text[]` arrives as an array; null becomes an empty list. */
export function arrayFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function optionalStringFrom(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

/**
 * Build the column set for an insert or update.
 *
 * `organisationId` is deliberately not accepted from callers: the adapter
 * always supplies it from the request context, so a payload assembled elsewhere
 * cannot redirect a write to another tenant.
 */
export function toColumns(input: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[toSnake(key)] = value;
  }
  return out;
}
