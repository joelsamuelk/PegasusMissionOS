# Pegasus Mission OS — Implementation Plan

> ⚠️ **Superseded as the sequencing authority by [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md) (2026-08-17).**
>
> The phase ordering below (Phases 1–11) is **no longer the plan of record**. It is retained
> because its **verification records** — slices 1A-i, Finance Intelligence and R1 — are the
> historical account of what was built and how it was proven, and because its audit-finding
> analysis remains accurate.
>
> Read `PEGASUS_PRODUCTION_BUILD_SPEC.md` for what to build next and in what order. In particular, that
> document promotes `Claim` into the foundation, deletes the Phase 4 "observed provenance"
> fix as dissolved rather than rescheduled, pulls the reporting engine and the domain-event
> dispatcher forward, and parks donors, campaigns, portals, surveys and i18n.

**Companion documents:** [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md), [`PEGASUS_ARCHITECTURE_AUDIT.md`](./PEGASUS_ARCHITECTURE_AUDIT.md), [`PEGASUS_TARGET_ARCHITECTURE.md`](./PEGASUS_TARGET_ARCHITECTURE.md)

Every phase ends with: `npm run typecheck` → `npm run lint` → `npm test` → `npm run test:e2e` → `npm run build`, all green, plus an update to the target-architecture document. No phase is marked complete unless it works end to end.

---

## Sequencing rationale

The brief's Phase 1 is "Production Foundation (Supabase runtime)". Repository inspection shows one blocker that must be cleared *before* any database work:

> The entire application reads a **synchronous, process-global, single-tenant** store. 20 files depend on it directly. A Supabase adapter is necessarily asynchronous and tenant-scoped.

Attempting the Supabase adapter and the sync→async inversion in one change would mean a large, unverifiable refactor with a network dependency in the middle. Phase 1 is therefore split:

- **1A — Data boundary** (no database, fully verifiable today)
- **1B — Supabase adapter** (requires a provisioned project)

This ordering also lets tenant-isolation tests exist *before* the database arrives, so the Supabase adapter has an executable contract to satisfy on day one.

---

## Phase 1A — Data boundary and tenant isolation ← **FIRST SLICE**

**Objective:** Invert the storage dependency. Make organisation identity an explicit, enforced, testable parameter.

**Dependencies:** none.

### Files

| File | Change |
|---|---|
| `src/server/context/request-context.ts` | new — `RequestContext` (tenant, actor, role, injectable clock) |
| `src/server/data/types.ts` | new — async, tenant-scoped repository interfaces |
| `src/server/data/in-memory/adapter.ts` | new — adapter over the existing store, filtering by `organisationId` |
| `src/server/data/index.ts` | new — adapter selection + honest runtime descriptor |
| `src/features/store/seed.ts` | extend — **second organisation fixture** (isolation is untestable with one tenant) |
| `src/features/store/index.ts` | tenant-aware state; real clock; collision-free IDs |
| `src/server/services/context.ts` | migrate onto the repository |
| `src/server/actions/*.ts` | migrate onto the repository |
| `src/features/dashboard/selectors.ts` | migrate onto the repository |
| `src/app/(dashboard)/settings/page.tsx` | stop claiming "Supabase (live)" when nothing reads Supabase |

### Tests

- `tests/unit/tenant-isolation.test.ts` — org A cannot read, list, search or mutate org B across **every** repository method.
- `tests/unit/repository-contract.ts` — a shared contract suite any adapter must satisfy; run against in-memory now, Supabase in 1B.
- `tests/unit/request-context.test.ts` — clock injection and actor resolution.

### Acceptance criteria

| # | Criterion | State |
|---|---|---|
| 1 | Every repository method requires a `RequestContext` and filters by its `organisationId` | ✅ Done |
| 2 | Two-tenant fixture exists; isolation holds for reads *and* writes | ✅ Done |
| 3 | AI grounding cannot reach another tenant's data | ✅ Done |
| 4 | Settings reports the true runtime | ✅ Done |
| 5 | Audit records use a real, injectable clock | ✅ Done |
| 6 | Existing 40 unit + 8 e2e tests still pass | ✅ Done (61 unit, 8 e2e) |
| 7 | **No file outside `src/server/data/` imports `@/features/store`** | ⏳ **Deferred to 1A-ii** |

**On criterion 7 — split, deliberately.** 126 call sites across 21 files read the store. This slice migrated the surface where a tenant leak would be most dangerous and where correctness is hardest to retrofit:

- `server/services/context.ts` — AI grounding (all 4 context builders)
- `server/actions/ai.ts`, `server/actions/mutations.ts` — every mutation
- `app/(dashboard)/settings/page.tsx`

The remaining consumers are **read-only dashboard server components** in a single-tenant demo. Migrating them is mechanical and carries regression risk disproportionate to its security value, so it is its own slice rather than padding this one.

`q` / `mutate` remain exported as a **legacy compatibility shim** for those pages. They are single-tenant by construction (they resolve the demo organisation) and must not be used in new code.

### Slice 1A-ii — complete the call-site migration

Migrate the remaining 17 page/component files onto the repository, then delete `q` and `mutate`. Acceptance: criterion 7 above; `grep -rl '@/features/store' src` returns only `src/server/data/`.

### Risks

| Risk | Mitigation |
|---|---|
| Sync→async breaks server components | Next server components are natively async; e2e journeys are the safety net |
| Large mechanical diff | Adapter preserves existing behaviour exactly; no logic changes in this slice |

---

## Phase 1B — Supabase adapter, auth, RLS hardening

**Objective:** Make Postgres the system of record.

**Depends on:** 1A.

- Add `@supabase/supabase-js` + `@supabase/ssr`; server-side clients only.
- Implement `server/data/supabase/` against the Phase 1A interfaces; run the shared contract suite against it.
- **Fix audit finding S1: `alter table users enable row level security`.** Policies are currently inert.
- Migration `0003_fixes.sql`: enable RLS on `users`; add missing `activity_events` table (audit §6); add `updated_at` triggers; soft-delete columns.
- Supabase Auth integration; `RequestContext` resolved from session + membership.
- Enforce `can()` in every mutating server action.
- UUID fixtures replacing slug IDs.
- Integration tests proving RLS blocks cross-tenant access **at the database level**, independent of adapter filtering.

**Acceptance:** the app runs end to end against a real Postgres; the same contract suite passes on both adapters; cross-tenant access fails at both layers; "Supabase (live)" is true when shown.

---

## Phase 2 — Mission Graph and Trust

- `Relation` primitive + `EntityReference`.
- Expanded `Attested<T>` (confidence, sources, validity window, `derivedFrom`).
- **`Claim` entity** + deterministic evidence strength.
- Normalise TypeScript toward the schema: `activities`, `outputs`, `grant_conditions` become entities.
- Evidence expansion: consent, expiry/review date, geography, cohort.
- Trust UI: click a figure, inspect its evidence chain.

**Acceptance:** any report or answer figure traces to evidence in ≤5 hops via a single query.

---

## Phase 3 — Reporting foundation

- `ReportDefinition` / `Report` / typed `ReportSection`; migrate `ImpactReport` onto it without data loss.
- 9-state lifecycle; owner/contributors/reviewers/approvers; trustees approve without editing.
- Deterministic report readiness.
- Report Builder; provider-independent export.

**Acceptance:** a grant report can be built, reviewed, approved and exported, with every figure traceable.

---

## Phase 4 — Funding intelligence

Normalised opportunity model with source verification and extraction provenance. Separate discovery / eligibility / fit / **pursuit assessment**. Deterministic fit preserved unchanged; AI restricted to extraction, summarisation, ambiguity and risk identification.

---

## Phase 5 — Application intelligence

Document ingestion (PDF/DOCX) → question, criteria, limit and attachment extraction with per-extraction provenance and a `needs_review` gate. Answer intelligence panel: criteria coverage, evidence strength, unsupported claims, word count. **AI must never fabricate missing evidence.**

*Security gate:* introduces untrusted document text. Injection defences (S4) must land with this phase, not after.

---

## Phase 6 — Grants and finance

Grant lifecycle depth; extended deterministic grant health (payments, variance, conditions, indicator performance) — every state still explainable. Budget → actual → forecast → variance, restricted/unrestricted, burn rate. Accounting integrations behind a boundary; the domain stays provider-agnostic.

### Finance Intelligence sequencing

Design and calculation core: [`FINANCE_INTELLIGENCE.md`](./FINANCE_INTELLIGENCE.md). The ordering below is a correctness constraint, not a preference — impact economics computed on untrustworthy allocations produces confident wrong numbers, which is worse than none.

| Stage | Scope | State |
|---|---|---|
| Foundation | Transactions, classification, accounts, grants, programmes, budgets | ⏳ Model defined; ingestion and persistence not built |
| Financial Intelligence | Cash, income, expenditure, runway, restrictions, commitments, forecasting | 🟡 Runway and forecasting built; the rest needs the foundation |
| Allocation | Transactions → grants → programmes → activities | ✅ Calculation core complete |
| Funding Need Intelligence | Programme runway, grant expiry, future gaps, Funding Intelligence integration | ✅ Calculation core complete |
| Impact Economics | Programme costs, output/outcome economics, shared cost allocation, trend analysis | ✅ Calculation core complete |
| Strategic Intelligence | Funding by strategic priority, investment by outcome, underfunded strategy, portfolio planning | ✅ Calculation core complete |

The calculation core lands before the foundation it consumes, in the same shape as the Organisation Intelligence slice: pure functions over injected data, so the rules — especially the refusals — are settled and tested before real ledgers arrive. Persistence, ingestion, UI and report rendering follow with the foundation stage.

**Cross-phase dependencies this creates:** `FundingNeed` becomes a first-class input to Phase 4 (Funding Intelligence) matching; `FinancialAllocation` becomes an edge the Phase 2 Mission Graph must carry; the five statement kinds (fact / calculation / forecast / assumption / recommendation) belong in the Phase 8 provenance model, not only in finance views.

---

## Phase 7 — Programmes and impact

Operational programme model (objective → workstream → activity → milestone → output → outcome → indicator). Indicator methodology, disaggregation, measurement history. **Impact Explorer.** Lightweight, mobile-friendly evidence capture. No causal claims beyond what evidence supports.

---

## Phase 8 — Pegasus Intelligence

Intelligence service, guardrails, router. Context builders for grant, programme, impact, executive. Retrieval over authorised graph entities. **Structured output with schema validation.** Observed provenance. Copilot with permission-aware context. Trust state UI.

> Existing AI features keep working throughout Phases 1–7 and migrate onto this architecture incrementally. They are not paused.

**Exception — pulled forward:** observed provenance (audit S2) and explicit fallback metadata (S7) are scheduled in **Phase 4**, not Phase 8. Every day the current code runs it writes provenance records asserting sources were used when that was never checked. That is a trust-correctness defect, not a feature.

---

## Phase 9 — Mission Control

Attention engine, role-aware home surfaces (CEO, fundraiser, programme manager, MEL lead, finance, trustee), shared task/approval primitives, notification preferences.

---

## Phase 10 — Automation and learning

Domain events, workflow rules, organisational memory (bids won and lost, funder feedback, lessons), structured learning loop feeding back into strategy.

---

## Phase 11 — Integrations and internationalisation

Integration framework; multi-currency, multi-locale, timezone-aware dates, multilingual evidence retaining source text.

---

## Cross-phase, continuous

- **Security:** authorisation enforced server-side on every mutation; AI retrieval obeys the same model.
- **Testing:** deterministic fixtures; no live provider calls in tests.
- **Observability:** errors, AI failures, latency, job failures — without logging beneficiary data.
- **Accessibility:** WCAG 2.2 AA maintained per phase.

---

## Status

| Phase | State |
|---|---|
| 0 — Audit | ✅ Complete |
| 1A-i — Data boundary, tenant scoping, isolation tests | ✅ Complete and verified |
| 1A-ii — Remaining call-site migration | ⏳ Next |
| 1B — Supabase adapter | ⏳ Blocked on a provisioned Supabase project |
| 6 — Finance Intelligence calculation core | ✅ Complete and verified (pure lib; no persistence or UI) |
| R1 — Relationship foundation | ✅ Complete and verified — see [`RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md`](./RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md) |
| 2–11 | ⏳ Planned |

### Verification record — Slice R1 (relationship foundation)

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 259 passed (+62: health, timeline, identity, isolation, assembled views) |
| `npm run test:e2e` | 11/11 passed (+3 relationship journeys) |
| `npm run build` | succeeds |
| Mutation test — isolation | Disabling `scoped()`/`scopedFind()` fails **12 of 15** relationship isolation tests, including every assembled-view case; restoring returns green. |
| Mutation test — e2e | Changing the asserted funding total on the relationship page to a value no record produces fails the journey. The e2e assertions read real data. |

**Precedent set:** the relationship server actions are the first in the codebase to **enforce** `can(ctx.role, capability)` rather than treat the permission model as advisory (audit §4.5). Existing actions are unchanged; migrating them is its own slice.

### Verification record — Slice 1A-i

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 61 passed (was 40; +18 tenant isolation, +3 runtime descriptor) |
| `npm run test:e2e` | 8/8 passed |
| `npm run build` | succeeds |
| Mutation test | Disabling `scoped()`/`scopedFind()` in the adapter fails **14** isolation tests across all four leak categories; restoring returns 61/61. The suite is not vacuous. |

### Audit findings addressed in this slice

| Finding | Resolution |
|---|---|
| §4.1 process-global, synchronous, single-tenant store | Repository boundary: async, context-scoped |
| §4.2 no tenant scoping | Enforced on every read and write; proven by mutation test |
| §4.3 frozen clock | `ctx.now()`; audit entries now order correctly |
| §4.4 array-length IDs | `crypto.randomUUID()` |
| S5 `askCommand` self-approving AI output | Now recorded as `pending` |
| False "Supabase (live)" label | Derived from the running adapter; regression-tested |

Still open from the audit: **S1** (`users` RLS never enabled), **S2** (fabricated AI provenance), **S3** (no auth) — all scheduled, S1 in Phase 1B and S2 pulled forward to Phase 4.

### Verification record — Finance Intelligence calculation core

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **228 passed**, of which **80 are Finance Intelligence** |
| `npm run test:e2e` | 8/8 passed |
| `npm run build` | succeeds |
| Mutation test | Replacing exact largest-remainder money splitting with naïve rounding, and disabling the delivery-quality withholding gate, fails **4** tests across both suites; restoring returns 80/80. |

Full detail, including the refusal rules and what is deliberately not built, in [`FINANCE_INTELLIGENCE.md`](./FINANCE_INTELLIGENCE.md).
