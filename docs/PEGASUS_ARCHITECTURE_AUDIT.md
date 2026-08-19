# Pegasus Mission OS — Architecture Audit

**Date:** 2026-08-17
**Scope:** Full repository inspection prior to the platform evolution described in the Mission OS architecture brief.
**Baseline:** `claude/pegasus-mission-os-3tcebc`, ~10,060 lines of TypeScript across `src/`, 846 lines of SQL across `supabase/`.

**Verification state at audit time:** `npm run typecheck` clean, `npm run lint` clean, `npm test` 40/40 passing, `npm run test:e2e` 8/8 passing, `npm run build` succeeds.

---

## 1. What exists

### Application shell

Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind 3. Two route groups: `(auth)` and `(dashboard)`. Ten navigation destinations: Command Centre, Funding, Applications, Grants, Programmes, Impact, Evidence, Organisation, Team, Settings. A marketing landing page sits at the root.

### Domain model

`src/types/domain.ts` (585 lines) defines ~40 interfaces covering organisations, profiles, evidence, funding, fit assessment, applications, grants, programmes, outcomes, indicators, impact reports, tasks, notifications, activity, audit and AI provenance. This is a genuinely comprehensive model and is the strongest asset in the repository.

### Deterministic logic

Three pure, unit-tested modules — the product's real differentiator:

| Module | Behaviour |
|---|---|
| `lib/logic/fit.ts` | 8 weighted factors (eligibility ×3, strategic ×2.5, beneficiary ×2, geographic/financial/readiness/evidence ×1.5, capacity ×1). Eligibility is a hard gate: failing it returns `not_eligible` regardless of score. Thresholds ≥75 strong, ≥55 potential. Each factor emits status, rationale, `evidenceUsed`, `assumptions`. |
| `lib/logic/grant-health.ts` | Scores overdue deliverables (2–3), overdue reports (3), spend >25pp ahead of timeline (2), underspend >35pp (1), no linked evidence past 40% elapsed (1), report due ≤14 days (1). ≥4 at risk, ≥2 attention. Returns `reasons[]`. |
| `lib/logic/progress.ts` | Indicator progress-to-target. |

Both scoring systems return *reasons*, not bare numbers. This satisfies the brief's explainability requirement and must be preserved.

### Permissions

`lib/permissions/index.ts`: 7 roles → 19 capabilities. `trustee_reviewer` is correctly read-plus-approve only. The model is complete and pure; it is currently **advisory only** — no server action consults it.

### AI layer

- Provider abstraction (`AiProvider`), mock + Anthropic implementations.
- Prompts centralised and versioned in `lib/ai/prompts.ts` (`PROMPT_VERSION = "2026-07-01"`), with a `SHARED_POLICY` prefixed to every request forbidding fabrication of funders, statistics, quotes and figures.
- 9 features; 4 server-side entry points, all in `server/actions/ai.ts`.
- Context is **constructed server-side** in `server/services/context.ts` from the store. Models never query the database. This is the correct architecture and must be preserved.
- `runAi()` falls back to the deterministic mock on provider failure, annotating the returned model string.

### Trust primitives

`Attested<T>` and `VerificationState` (`verified | provided | ai_extracted | needs_review | outdated`) exist and are applied across all ~25 organisation-profile fields. `AIProvenance` is attached to application answers and impact report sections.

### Persistence

- `features/store/` — in-memory seeded store (Northstar Community Foundation), 416 lines of accessors + 870 lines of seed.
- `supabase/migrations/0001_schema.sql` — 38 tables, UUID PKs, FKs, 34 indexes, 9 enum types, RLS enabled on 37.
- `supabase/migrations/0002_rls.sql` — `is_org_member()` / `org_has_role()` security-definer helpers, plus a `DO` block generating `_member_all` policies across 34 tables. Policy coverage is better than a naive `grep` suggests: all 38 tables have policies.

### Tests

40 unit tests (fit, grant health, progress, permissions, store, AI mock, status badge) and 8 Playwright e2e journeys. All green.

---

## 2. What works well — preserve these

1. **Deterministic-first intelligence.** Fit and grant health are pure functions with explicit reasons. The brief's §7 and §9 warnings against AI silently replacing them are already honoured. Keep it that way.
2. **Server-side context construction.** `context.ts` assembles authorised facts and hands them to the model. The model has no database access.
3. **Centralised, versioned prompts** with an anti-fabrication policy. Directly satisfies §42.
4. **`Attested<T>`** already generalises cleanly to §4's expanded interface.
5. **Narrow, typed store surface.** The store header explicitly anticipates the swap. The seam is real and usable.
6. **Explainability in the UI.** Health states and fit scores surface their reasons rather than a mystery number.

---

## 3. What is incomplete

| Area | State |
|---|---|
| Supabase runtime | Schema and RLS exist. **No client dependency, no runtime code.** Nothing reads Postgres. |
| Authentication | None. Every visitor is the hardcoded owner. |
| Multi-tenancy | One hardcoded organisation. |
| Reports | Only `ImpactReport`. One type, 3 statuses, no lifecycle, no builder, no export. |
| Claims | Not modelled. |
| Strategy | Profile fields only; no strategic goals, theories of change, or graph participation. |
| Finance | No budget, expenditure, forecast or variance. |
| Workflow/events | None; reminders are computed ad hoc in selectors. |
| Search | None. |
| Document ingestion | None. |
| i18n | GBP and en-GB assumed throughout. |
| Observability | None. |

---

## 4. Architectural weaknesses

### 4.1 The store is a process-global mutable singleton (P0)

```ts
const globalRef = globalThis as unknown as { __pegasusStore?: StoreState };
export const store: StoreState = (globalRef.__pegasusStore ??= initState());
export const DEMO_ORG_ID = "org-northstar";
export const CURRENT_USER_ID = "user-amara";
```

Consequences:

- **All requests from all users share one mutable object.** Any future second tenant would read and write the first tenant's data.
- **Identity is a module constant.** There is no notion of "the organisation for this request".
- **The entire query surface is synchronous.** `q.grants()` returns an array, not a promise. Every consumer is written against sync access.

**This is the single largest migration risk in the repository.** 20 files import `@/features/store` directly. A Supabase implementation is necessarily async, so the sync→async inversion must happen before any database work — not alongside it.

### 4.2 No tenant scoping exists at all

No accessor takes an `organisationId`. `q.opportunities()` returns every opportunity in the process. Tenant isolation (§37, "non-negotiable") cannot currently be tested, because **the seed contains only one organisation** — a single-tenant fixture cannot prove isolation.

### 4.3 Frozen clock breaks the audit ledger

```ts
const NOW = "2026-07-21T10:00:00Z";
```

Every audit event, activity entry and update stamp receives the identical timestamp. The §38 audit ledger — which is explicitly ordered by time — cannot order anything. `recordAudit` also relies on `store.auditEvents.length` for IDs.

### 4.4 Identifier strategy is incompatible with the schema

IDs are generated from array length (`` `ev-${store.evidenceItems.length + 1}` ``). This collides after any deletion, and the slug format (`org-northstar`, `user-amara`) is incompatible with the schema's `uuid` primary keys. The seed data cannot be loaded into Postgres as-is.

### 4.5 Permissions are never enforced

`can()` is exported and unit-tested but no server action calls it. Authorisation is currently decorative.

---

## 5. Security risks

| # | Severity | Finding |
|---|---|---|
| S1 | **Critical** | **RLS is never enabled on `users`.** `0001_schema.sql` issues `enable row level security` for 37 of 38 tables; `users` is omitted. The `users_self_select` / `users_self_update` policies in `0002` are therefore **inert**, and the table is readable and updatable by any authenticated client. This is a live data-exposure bug the moment Supabase is connected. |
| S2 | **High** | **AI provenance is fabricated.** `buildProvenance(context)` in both providers lists everything *offered* to the model as though it were *used*. If the model ignores an evidence item, provenance still claims it. The product promise "click a claim and inspect its evidence chain" (§5, §14) rests on provenance being observed, not assumed. |
| S3 | **High** | **No authentication.** Every visitor is `user-amara`, an organisation owner. |
| S4 | Medium | **Prompt-injection surface.** `renderContext()` interpolates evidence and profile text into the user message. Evidence is human-entered today, but §31 document ingestion will introduce untrusted content into the same channel. |
| S5 | Medium | `askCommand` records `approvalStatus: "approved"` without any human approval, contradicting §23. |
| S6 | Low | The Anthropic `fetch` has no timeout, no retry and `max_tokens: 1024` — too low for report sections. |
| S7 | Low | Fallback to mock is signalled only by a suffix on the model string. §40 requires explicit execution metadata. |

---

## 6. Data-model gaps: TypeScript vs Postgres

The two models diverge in three ways.

**Entities in TypeScript with no table:**

- `ActivityEvent` — used by the dashboard activity feed and written by `recordActivity()`, but there is **no `activity_events` table**. This data would be silently lost on migration.

**Tables with no TypeScript representation** (denormalised into arrays/booleans in TS):

| Table | TypeScript equivalent |
|---|---|
| `activities`, `outputs` | `Programme.activities: string[]`, `Programme.outputs: string[]` |
| `grant_conditions` | `Grant.conditions: string[]` |
| `saved_opportunities` | `FundingOpportunity.saved: boolean` |
| `fit_assessment_factors` | nested `FitAssessment.factors[]` |
| `opportunity_eligibility_criteria` | `eligibleOrgTypes[]` / `eligibleLocations[]` |
| `application_questions` | folded into `ApplicationAnswer` |
| `organisation_documents` | absent from TS entirely |

The relational schema is closer to the Mission Graph target than the TypeScript model is. §11 (activities/outputs as first-class) and §5 (claims) both argue for normalising TypeScript **towards** the schema, not the reverse.

**Type mismatch:** `type UUID = string` is nominal; the seed uses slugs while Postgres expects `uuid`.

---

## 7. AI gaps against the brief

| Brief | Gap |
|---|---|
| §41 structured output | All AI output is unvalidated prose. No schemas, no validation before persistence. |
| §14 report provenance | Sections store `AIProvenance` but not model, prompt version, timestamp, human edits, reviewer or approval state. |
| §22 trust state | No user-facing grounding indicator. |
| §21 context builders | 4 exist (answer, report section, command, pipeline). Missing: grant, programme, impact, executive. |
| §20 specialist capabilities | Single flat feature list; no routing layer. |
| §18 intelligence service | Server actions call `runAi` directly; no policy/guardrail or router layer between. |

---

## 8. Reporting gaps

The current implementation is one entity (`ImpactReport`) with a fixed 14-key section union and a 3-value status. Against §13–§17 this is missing: a general report engine, report types beyond impact, section *types* (KPI, chart, table, testimonial…) as distinct from section *keys*, the 9-state lifecycle, contributors/reviewers/approvers, readiness scoring, export, and the Report Builder.

`ReportBuilder.tsx` (222 lines) generates and edits sections of a single impact report. It is a reasonable seed for §16 but is not a general engine.

---

## 9. Migration risks

| Risk | Mitigation |
|---|---|
| **Sync → async inversion** across 20 files | Do it first, in isolation, behind an unchanged in-memory implementation, with e2e tests as the safety net. |
| Seed IDs incompatible with `uuid` PKs | Move to UUIDs in the fixture layer before any Postgres work. |
| Single-tenant seed cannot prove isolation | Add a second organisation fixture as part of the same slice. |
| `ActivityEvent` has no table | Add the table, or fold into `audit_events`, before migrating. |
| Frozen `NOW` | Introduce an injectable clock; deterministic tests keep a fixed clock explicitly. |
| Big-bang refactor | Phase strictly; typecheck + lint + unit + e2e + build after every phase. |

---

## 10. Proposed changes (ordered)

1. **Slice 1 (this change): request context + repository boundary + tenant isolation tests.** Invert the sync/global dependency, introduce `RequestContext`, enforce organisation scoping in the data layer, add a second tenant fixture, and stop the Settings page claiming Supabase is live when it is not.
2. **Slice 2:** migrate remaining page-level call sites onto the repository; enforce `can()` in server actions.
3. **Slice 3:** Supabase adapter behind the same interface + auth + fix S1 (`users` RLS) + UUID fixtures.
4. **Slice 4:** observed (not assumed) AI provenance + execution metadata — fixes S2/S7.
5. **Slice 5:** Claims + evidence strength.
6. **Slice 6:** Reports engine + lifecycle.

Rationale for ordering: 1–3 are prerequisites for everything else in the brief; 4 is a trust-correctness fix that should not wait for Phase 8, because every day it runs it produces provenance records that are not true.

---

## 11. Honest statement of current production readiness

Mission OS today is a **high-fidelity, single-tenant demonstration** with genuinely strong deterministic logic, a comprehensive domain model and a disciplined AI architecture. It is **not** production software: there is no database, no authentication, no tenant isolation and no authorisation enforcement. The Settings page's "Supabase (live)" indicator is driven purely by the presence of environment variables and is corrected in Slice 1.
