import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { RequestContext } from "@/server/context/request-context";
import { HAS_CREATED_BY, HAS_UPDATED_AT, HAS_UPDATED_BY } from "./audit-columns";
import { type Row, toColumns } from "./mapping";

/**
 * The query layer the Supabase adapter is built on.
 *
 * Three things live here that are easy to get wrong once per method and
 * impossible to audit afterwards: tenant scoping, error handling, and the
 * distinction between "no rows" and "not implemented".
 */

/**
 * Whether the adapter applies its own `organisation_id` filter.
 *
 * Storage has two independent defences: this filter, and the RLS policies in
 * the database. They are meant to be redundant. `TenantFilter.off` disables
 * the first one so a test can prove the second exists -- if isolation tests
 * still pass with the adapter filtering removed, RLS is genuinely enforcing;
 * if they fail, there is only ever one layer and it is this one.
 *
 * Nothing in the application may construct a repository with the filter off.
 */
export type TenantFilter = "on" | "off";

export interface AdapterOptions {
  /** Defaults to "on". See {@link TenantFilter}. */
  tenantFilter?: TenantFilter;
}

/**
 * A method that has no Supabase implementation yet.
 *
 * It throws rather than returning an empty result on purpose. A repository
 * method that returns `[]` when it means "not written" renders a page reading
 * "no grants" to an organisation that has grants, and nothing anywhere reports
 * a fault. A thrown error is a visible outage; a silent empty list is data
 * loss that looks like a product decision.
 */
export function notImplemented(repository: string, method: string): never {
  throw new Error(
    `${repository}.${method} has no Supabase implementation. ` +
      `The in-memory adapter has one; this method has not been ported yet. ` +
      `See src/server/data/supabase/README.md for the porting order.`,
  );
}

function fail(action: string, table: string, error: PostgrestError): never {
  throw new Error(`Could not ${action} ${table}: ${error.message}`);
}

/** The columns every read selects. `*` throughout; projection is the mapper's job. */
const ALL = "*";

export class Query {
  /**
   * @param getClient Resolves a client bound to the current request.
   *
   * A factory rather than a client, because a Supabase client carries the
   * caller's session in its cookie handlers and is therefore request-scoped,
   * while `getRepository()` is a memoised singleton. Holding one client in the
   * singleton would serve every request as whoever made the first one.
   */
  constructor(
    private readonly getClient: () => Promise<SupabaseClient>,
    private readonly tenantFilter: TenantFilter,
  ) {}

  /**
   * A select scoped to the context organisation.
   *
   * Every read in the adapter starts here, so the scoping decision is made in
   * one place rather than 255.
   *
   * Takes the client rather than resolving it, and is private, because a
   * PostgREST builder is itself thenable: returning one from an async method
   * means `await` unwraps it and runs the query. Every builder therefore stays
   * inside the method that made it.
   */
  private scoped(client: SupabaseClient, ctx: RequestContext, table: string) {
    const query = client.from(table).select(ALL);
    return this.tenantFilter === "on"
      ? query.eq("organisation_id", ctx.organisationId)
      : query;
  }

  /** Rows matching an equality filter set, scoped to the tenant. */
  async many(
    ctx: RequestContext,
    table: string,
    match: Record<string, unknown> = {},
    options: {
      order?: { column: string; ascending?: boolean };
      /** Exclude archived rows. Archiving is soft, so list reads must ask. */
      liveOnly?: boolean;
      /** Columns that must be at or before a value. For due-by queries. */
      atOrBefore?: Record<string, string>;
    } = {},
  ): Promise<Row[]> {
    const client = await this.getClient();
    let query = this.scoped(client, ctx, table);
    for (const [column, value] of Object.entries(match)) {
      if (value === undefined) continue;
      query = query.eq(column, value);
    }
    if (options.liveOnly) query = query.is("archived_at", null);
    for (const [column, value] of Object.entries(options.atOrBefore ?? {})) {
      query = query.lte(column, value);
    }
    const { order } = options;
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await query;
    if (error) fail("read", table, error);
    return (data ?? []) as unknown as Row[];
  }

  /** One row, or null. Not an error when absent -- absence is a normal answer. */
  async maybeOne(
    ctx: RequestContext,
    table: string,
    match: Record<string, unknown>,
  ): Promise<Row | null> {
    const client = await this.getClient();
    let query = this.scoped(client, ctx, table);
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) fail("read", table, error);
    return (data as unknown as Row | null) ?? null;
  }

  /** Insert one row, returning it. `organisation_id` comes from the context. */
  async insert(
    ctx: RequestContext,
    table: string,
    values: Record<string, unknown>,
    options: { audit?: boolean } = {},
  ): Promise<Row> {
    const columns = toColumns(values);
    columns.organisation_id = ctx.organisationId;
    // Only stamp columns the table actually has. Most tables have none.
    if (options.audit !== false) {
      if (HAS_CREATED_BY.has(table)) columns.created_by ??= ctx.userId;
      if (HAS_UPDATED_BY.has(table)) columns.updated_by ??= ctx.userId;
    }
    const client = await this.getClient();
    const { data, error } = await client.from(table).insert(columns).select().single();
    if (error) fail("write to", table, error);
    return data as Row;
  }

  /**
   * Update one row by id, returning it, or null when it is not in the tenant.
   *
   * Null rather than an error: a caller updating a record that belongs to
   * another organisation is asking about a record that, from where it stands,
   * does not exist. That is the same answer `get` gives.
   */
  async update(
    ctx: RequestContext,
    table: string,
    id: string,
    values: Record<string, unknown>,
    options: { audit?: boolean } = {},
  ): Promise<Row | null> {
    const columns = toColumns(values);
    if (options.audit !== false) {
      if (HAS_UPDATED_BY.has(table)) columns.updated_by = ctx.userId;
      // `updated_at` also has a trigger on most tables. Setting it explicitly
      // keeps the injected clock authoritative: tests pin `ctx.now()`, and a
      // trigger firing `now()` would quietly overwrite it with wall time.
      if (HAS_UPDATED_AT.has(table)) columns.updated_at = ctx.now().toISOString();
    }
    const client = await this.getClient();
    let query = client.from(table).update(columns).eq("id", id);
    if (this.tenantFilter === "on") {
      query = query.eq("organisation_id", ctx.organisationId);
    }
    const { data, error } = await query.select().maybeSingle();
    if (error) fail("update", table, error);
    return (data as unknown as Row | null) ?? null;
  }

  /** Delete rows matching a filter set, scoped to the tenant. */
  async remove(
    ctx: RequestContext,
    table: string,
    match: Record<string, unknown>,
  ): Promise<void> {
    const client = await this.getClient();
    let query = client.from(table).delete();
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value);
    }
    if (this.tenantFilter === "on") {
      query = query.eq("organisation_id", ctx.organisationId);
    }
    const { error } = await query;
    if (error) fail("delete from", table, error);
  }

  /**
   * Rows whose column matches any of `values`.
   *
   * Returns immediately on an empty list. PostgREST renders `in.()` for an
   * empty array, which is a syntax error rather than an empty result.
   */
  async whereIn(
    ctx: RequestContext,
    table: string,
    column: string,
    values: readonly string[],
  ): Promise<Row[]> {
    if (values.length === 0) return [];
    const client = await this.getClient();
    const { data, error } = await this.scoped(client, ctx, table).in(column, [...values]);
    if (error) fail("read", table, error);
    return (data ?? []) as unknown as Row[];
  }

  /** Escape hatch for reads that need a shape the helpers above cannot express. */
  client(): Promise<SupabaseClient> {
    return this.getClient();
  }

  get scoping(): TenantFilter {
    return this.tenantFilter;
  }
}

/**
 * What a repository module needs besides the query layer.
 *
 * Only audit, so far. The in-memory adapter reaches a local `recordAudit`
 * helper from anywhere in its closure; the Supabase modules are separate
 * files, so the dependency is passed rather than shared, and a module that
 * writes an audit event has to say so in its signature.
 */
export interface Deps {
  audit: import("../types").AuditRepository;
  /**
   * Append to the workspace activity feed.
   *
   * Separate from audit on purpose, and both are written at the points the
   * in-memory adapter writes them. Audit is the compliance record: who changed
   * what, retained. Activity is the feed a colleague reads to see what has
   * been happening. They answer different questions and are read by different
   * people, so one is not a view over the other.
   */
  recordActivity(ctx: RequestContext, verb: string, target: string): Promise<void>;
  /**
   * The graph, so a repository can record an edge without restating the
   * two-endpoint tenant check.
   *
   * `evidence.support` is the reason: it delegates to `graph.connect` in both
   * adapters rather than writing its own check, which is the kind of
   * duplication that ends with one copy being weaker than the other.
   */
  graph: import("../types").GraphRepository;
  /**
   * Claims, for the readers that need them fully resolved.
   *
   * A claim is spread across four tables, so "read the claims" is not a
   * `select`. `reports.cutVersion` pins figures against them and must see the
   * same claim the rest of the product sees, sources and all.
   */
  claims: import("../types").ClaimRepository;
  /**
   * Finance, so a gift is attributed by the same code that attributes any
   * other cost.
   *
   * `fundraising.recordDonation` writes an allocation for a restricted gift
   * and calls `finance.allocate` to do it, which is what keeps the endpoint
   * check and the method-and-basis requirement in one implementation.
   */
  finance: import("../types").FinanceRepository;
}
