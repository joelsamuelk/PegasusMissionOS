import { appConfig } from "@/lib/config";
import { store } from "@/features/store";
import { createInMemoryRepository } from "./in-memory/adapter";
import { createSupabaseRepository } from "./supabase/adapter";
import { createAnonClient } from "./supabase/client";
import type { MissionRepository } from "./types";

export type { MissionRepository } from "./types";

/**
 * Adapter selection.
 *
 * This is the only place in the application that knows which storage
 * implementation is in use. Everything else depends on the `MissionRepository`
 * interface.
 *
 * The choice is made from configuration, not from a caller: with a Supabase
 * project configured, every request is served by Postgres with row level
 * security; without one, by the seeded in-memory workspace. There is no flag
 * and no override, because "which database is this reading?" must not be
 * answerable differently in two places.
 *
 * The Supabase repository is memoised like the in-memory one, which is safe
 * because it holds a client *factory* rather than a client: the session lives
 * in the client, the client is built per request from that request's cookies,
 * and nothing request-scoped is captured here.
 */

let cached: MissionRepository | null = null;

export function getRepository(): MissionRepository {
  if (!cached) {
    cached = appConfig.isMockData
      ? createInMemoryRepository(store)
      : createSupabaseRepository(createAnonClient);
  }
  return cached;
}

/** Reset the memoised adapter. Tests only. */
export function __resetRepository(): void {
  cached = null;
}

/**
 * The seeded demo workspace, whatever the configured adapter happens to be.
 *
 * The public marketing site renders previews of the demo — Northstar Community
 * Foundation, a fictional charity with clearly labelled sample data — and it
 * must render them for an anonymous visitor with no session and no tenant. It
 * therefore cannot go through `getRepository()`: once the Supabase adapter is
 * live, that resolves to a Postgres tenant, and a marketing page asking a
 * production database for `org-northstar` would either fail or, far worse,
 * return whatever a real organisation happens to have under that id.
 *
 * Pairing this with `createDemoContext()` keeps the marketing site inside the
 * data boundary — it depends on `MissionRepository` like every other caller —
 * while making it structurally impossible for a public page to read tenant
 * data.
 */
let demoCached: MissionRepository | null = null;

export function getDemoRepository(): MissionRepository {
  if (!demoCached) demoCached = createInMemoryRepository(store);
  return demoCached;
}

export type RuntimeDataSource = "in-memory" | "supabase";

export interface RuntimeDescriptor {
  source: RuntimeDataSource;
  label: string;
  detail: string;
}

/**
 * Describe the data layer actually in use.
 *
 * The previous Settings page inferred "Supabase (live)" from the presence of
 * environment variables. No code read Supabase, so that label was false
 * whenever the variables happened to be set. This reports the adapter that is
 * genuinely serving requests, and separately notes whether Supabase is
 * configured but not yet wired.
 */
export function describeRuntime(): RuntimeDescriptor {
  const source = getRepository().name === "supabase" ? "supabase" : "in-memory";

  if (source === "supabase") {
    return {
      source,
      label: "Supabase (live)",
      detail: "Reads and writes are served by Postgres with row level security.",
    };
  }

  return {
    source,
    label: "In-memory demo data",
    detail: "Seeded workspace held in the server process. Changes persist until restart.",
  };
}
