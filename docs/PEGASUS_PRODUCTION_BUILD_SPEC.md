# Pegasus Mission OS — Production Build Spec

**Status:** Active. This document **supersedes** [`PEGASUS_IMPLEMENTATION_PLAN.md`](./PEGASUS_IMPLEMENTATION_PLAN.md) as the sequencing authority.
**Date:** 2026-08-17
**Companions:** [`PEGASUS_ARCHITECTURE_AUDIT.md`](./PEGASUS_ARCHITECTURE_AUDIT.md), [`PEGASUS_TARGET_ARCHITECTURE.md`](./PEGASUS_TARGET_ARCHITECTURE.md), [`FINANCE_INTELLIGENCE.md`](./FINANCE_INTELLIGENCE.md), [`ORGANISATION_INTELLIGENCE.md`](./ORGANISATION_INTELLIGENCE.md), [`RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md`](./RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md)
**Mission Graph Expansion Programme:** [`MISSION_GRAPH_ARCHITECTURE.md`](./MISSION_GRAPH_ARCHITECTURE.md) (semantic architecture and the §9 acceptance test), [`MISSION_OS_EXPANSION_PLAN.md`](./MISSION_OS_EXPANSION_PLAN.md) (MG-1…MG-12 reconciled with slices A–I; **corrects the Slice C status recorded in §7 below**), [`MISSION_OS_CAPABILITY_MAP.md`](./MISSION_OS_CAPABILITY_MAP.md)

> **Milestone:** turn Pegasus from a high-fidelity Mission OS *demonstration* into a production-capable Mission OS, while activating the Finance, Reporting and Intelligence architecture already designed.

---

# Pegasus Production Invariants

**These are non-negotiable acceptance criteria for every slice, prompt and pull request.** They are deliberately stated as prohibitions: each one names a way the product could become untrustworthy, and no feature, deadline or convenience overrides them. Any change that violates one is wrong even if it passes every test.

1. **No tenant-owned data is accessible without tenant scope.**
2. **No consequential mutation occurs without permission enforcement.**
3. **No AI-generated factual assertion is persisted without traceable grounding.**
4. **No derived figure loses its methodology or inputs.**
5. **No published report silently changes when its underlying knowledge changes.**
6. **No AI recommendation is presented as deterministic analysis.**
7. **No external action is executed without the required human approval.**
8. **No missing information is silently converted into an assumption.**
9. **No confidence score upgrades verification state.**
10. **No provider-specific implementation leaks into the core domain.**

To cite these in a build prompt:

> All Production Invariants in `docs/PEGASUS_PRODUCTION_BUILD_SPEC.md` are non-negotiable acceptance criteria.

## Current compliance

Stated honestly, because an invariant nobody has checked is a slogan. Several are violated today; the slice that closes each is named.

| # | Invariant | State today | Where it holds / fails | Closes in |
|---|---|---|---|---|
| 1 | Tenant scope | 🟢 Upheld | Enforced on every repository method and proven by a 33-test two-tenant suite. The `q`/`mutate` shim is deleted; `tests/unit/data-boundary.test.ts` fails the build if any file outside `src/server/data/` reaches the store. | ✅ **Slice A** |
| 2 | Permission enforcement | 🟢 Upheld | All 12 `mutations.ts` actions and all 4 `ai.ts` entry points authorise before mutating, returning a refusal rather than failing silently. `data-boundary.test.ts` fails the build if a new action ships without a gate; a deliberately public action must declare `@public-action` with a reason. | ✅ **Slice C** |
| 3 | Traceable AI grounding | 🟢 Upheld | `AIProvenance` is deleted. Generations return the references they drew on; one that was never offered throws `GroundingViolationError` and the output is discarded. | ✅ **Slice B** |
| 4 | Methodology travels with figures | 🟢 Upheld, unpersisted | `UnitCost` cannot be constructed without a `Methodology`; there is no code path producing a bare number. But no figure is persisted yet, so the invariant is untested against storage. | Holds; **Slice E** must preserve it |
| 5 | Published reports don't silently change | 🟡 Core upheld, migration incomplete | Report sections now pin immutable `claimIds`; readiness flags a superseded claim and conflicting current figures without replacing the cited value. Legacy free-text figures and database persistence still need the remainder of Slice D. | **Slice D** |
| 6 | Recommendations aren't dressed as analysis | 🟡 Partial | The five kinds are now global (`ClaimKind`) and `effectiveClaimKind()` applies to any claim; finance defers to that definition rather than keeping a copy. AI output still needs the UI treatment. | Model ✅ **Slice B**; UI **Slice F** |
| 7 | Human approval for external action | 🟢 Upheld by absence | No external action exists to execute. S5 (`askCommand` self-approving) was closed in 1A-i. | Must hold in **Slice I** |
| 8 | Missing ≠ assumed | 🟢 Upheld | Three independent implementations already refuse to smooth over gaps: `missing[]` on relationship briefs, withheld unit costs with a `requires` list, and `not_publicly_found ≠ missing` in `OrganisationGap`. | Holds; **Slice F** generalises it |
| 9 | Confidence never promotes verification | 🟢 Upheld | Now structural: `createClaim` runs `assertProducerMayAssign`, so an extractor or a model **cannot construct** a verified claim. Previously a convention any new call site could break. | ✅ **Slice B** |
| 10 | No provider leakage into the domain | 🟢 Upheld | AI sits behind `AiProvider`; communications behind declared interfaces with provider IDs confined to a separate map. | Must hold in **Slice C** and **Slice I** |

One of ten remains violated, closing in Slice D.

**Invariant 1 closed in Slice A. Invariant 3 closed in Slice B** (9 hardened from convention to constraint). **Invariant 2 closed in Slice C.** Only invariant 5 remains violated; it closes in Slice D.

---

## 0. Why this document exists

The repository has enough domain surface to prove the thesis. Verified state at the time of writing: 259 unit tests across 17 files, 11 Playwright journeys, typecheck/lint/build clean, ~32,000 lines.

The risk is no longer missing features. It is **twenty beautifully modelled modules sitting on an in-memory store.** Breadth is done; the next competitive advantage is depth and connectivity.

Accordingly, module expansion stops. The build reorients around **five layers** delivered as **eight sequenced slices**, and around one architectural evolution that has been latent in the codebase for three slices without being named: the **Knowledge / Claims layer**.

### What this changes in the old plan

| Old plan | Now |
|---|---|
| Phase 2 — `Claim` entity, mid-roadmap | **Promoted into the foundation.** Claims reshape the schema; they cannot land after the Supabase adapter without migrating twice. |
| Phase 4 — "observed provenance" fix for S2 | **Deleted, not rescheduled.** S2 dissolves when `AIProvenance` is replaced by claim references. Building structured source-observation against a type that is about to be removed is throwaway work. |
| Phase 3 — Reporting foundation | **Pulled forward**, and generalised from Impact Reports to a report engine over claims. |
| Phase 8 — Pegasus Intelligence | Becomes an **orchestrator over deterministic tools**, not a fifth AI entry point. |
| Phase 9 — Mission Control | Becomes the **attention system**, and pulls the Phase 10 domain-event dispatcher forward with it. |
| Phase 10–11 — donors, campaigns, portals, surveys, forms, calendars, i18n | **Parked.** Legitimate, not the bottleneck. |
| Phase numbering 1–11 | Replaced by lettered slices A–H below. |

---

## 1. Six foundational systems

The product is defined by six systems, not twenty modules.

```text
                     PEGASUS MISSION OS

┌───────────────────────────────────────────────────────────┐
│                  INTELLIGENCE SYSTEM                      │
│        Understand • Anticipate • Recommend • Act          │
├───────────────────────────────────────────────────────────┤
│                    MISSION SYSTEM                         │
│  Strategy • Funding • Grants • Programmes • Impact        │
│                     MONEY SYSTEM                          │
│  Finance • Budgets • Funding Needs • Impact Economics     │
│                 RELATIONSHIP SYSTEM                       │
│  People • Organisations • Interactions • Commitments      │
│                   KNOWLEDGE SYSTEM                        │
│  Claims • Evidence • Documents • Reports • Search         │
│                     WORK SYSTEM                           │
│  Tasks • Approvals • Decisions • Deadlines • Activity     │
├───────────────────────────────────────────────────────────┤
│                       TRUST                               │
│  Provenance • Attestation • Permissions • Audit • RLS     │
├───────────────────────────────────────────────────────────┤
│                      PLATFORM                             │
│  Auth • Postgres • Storage • Jobs • Integrations • API    │
└───────────────────────────────────────────────────────────┘
```

**North star:** Pegasus knows your organisation, understands your mission, connects your money, relationships, evidence and work, and helps your team decide what matters and get it done.

---

## 2. The Knowledge / Claims layer

### 2.1 Four systems have independently invented the same concept

| Where | Shape today | File |
|---|---|---|
| Organisation profile | `Attested<T> { value, verification, source?: string, lastVerifiedAt? }` on ~25 fields | `types/domain.ts:32` |
| Finance | `Statement { kind, text, derivedFrom: EntityReference[], supportedBy, workings, confidence, caveats }` with five kinds and `effectiveKind()` | `lib/finance-intelligence/statements.ts` |
| Organisation Intelligence | `ResearchSource` + `SourceAuthority` + `ProfileCandidate` + `CandidateConflict` | `lib/organisation-intelligence/types.ts` |
| Relationships | `sources: EntityReference[]`, `missing[]`, `signals[]`, `healthOverride` | `lib/logic/relationship-brief.ts`, `relationship-health.ts` |
| AI | `AIProvenance { profileFieldsUsed, documentsUsed, programmeDataUsed, assumptions, couldNotVerify }` — all bare `string[]` | `types/domain.ts:960` |

These are five projections of one idea. The finance `Statement` is already 80% of the target shape; the org-intelligence candidate model already has the authority and conflict semantics; `Attested<T>` already has the verification vocabulary. **The work is unification, not invention.**

Two weaknesses are visible in the current shapes and are fixed by unifying:

- `Attested<T>.source` is a **free string**. It cannot be joined, traversed or counted, so "where did this come from?" is unanswerable beyond display.
- `AIProvenance` is five arrays of strings listing what was *offered* to a model as though it were *used*. This is audit finding **S2**, and it is not a bug in a function — it is a bug in a type.

### 2.2 The model

```text
SOURCE  →  CLAIM  →  VERIFICATION  →  DERIVATION  →  KNOWLEDGE  →  DECISION / ACTION
```

```ts
interface Claim<T = ClaimValue> {
  id: UUID;
  organisationId: UUID;

  /** What this claim is about. */
  subject: EntityReference;
  /** Which aspect of the subject: "participants_supported", "mission_statement". */
  predicate: string;
  value: T;

  /** Epistemic distance from a record. From finance; now global. */
  kind: StatementKind;              // fact | calculation | forecast | assumption | recommendation
  /** Organisational trust status. Orthogonal to `kind` and to `confidence`. */
  verification: VerificationState;
  /** 0..1. How sure the *producer* is. NEVER promotes `verification`. */
  confidence?: number;

  /** External grounding, ordered by authority. */
  sources: ClaimSource[];
  /** Internal grounding: records and other claims. */
  derivedFrom: EntityReference[];
  supportedBy: UUID[];              // other claim ids

  /** How this claim came to exist. */
  producedBy: ClaimProducer;
  /** For calculations: arithmetic a human can check. */
  workings?: string;
  assumptions: string[];
  caveats: string[];

  validFrom?: ISODate;
  validUntil?: ISODate;
  period?: Period;

  /** Claims are immutable. Correction supersedes; it never edits. */
  supersedes?: UUID;
  supersededBy?: UUID;
  conflictsWith: UUID[];

  audit: AuditStamp;
}

interface ClaimSource {
  ref: EntityReference;             // evidence item, document, research source, record
  authority: SourceAuthority;       // regulator | organisation | supporting | discovery
  locator?: string;                 // "page 14", "json-ld:Organization.name", "row 402"
  retrievedAt?: ISODate;
}

type ClaimProducer =
  | { method: "human"; actorId: UUID }
  | { method: "extraction"; extractionMethod: ExtractionMethod; sourceId: UUID }
  | { method: "calculation"; function: string; version: string }
  | { method: "model"; provider: string; model: string; promptVersion: string };
```

Worked example — the fact:

```text
"Northstar supported 1,284 young people in 2025."

value          1284
predicate      participants_supported
kind           FACT
subject        programme:youth-futures
source         evidence:2025-programme-evaluation · page 14 · authority: supporting
verification   verified   (by user:amara, 2026-03-02)
valid period   2025-01-01 → 2025-12-31
used by        application:comic-relief-2026
               impact_report:2025-annual
               report:board-pack-q1-2026
```

And the forecast, which stands on it:

```text
"Youth Futures has a £310k funding gap from April 2027."

kind           FORECAST
producedBy     calculation · deriveFundingNeed · v1
derivedFrom    programme:youth-futures (budget)
               grant:henderson (end date)
               grant:city-fund (confirmed future income)
supportedBy    claim:programme-continues-at-scale  (ASSUMPTION)
confidence     0.62 — moderate
calculated     17 Aug 2026
```

### 2.3 The rules that make it load-bearing

1. **Claims are immutable.** A correction creates a new claim with `supersedes` set. This is what makes the "used by" index honest: a report published in March cites the claim as it stood in March, and the drill-down shows both the cited claim and its successor.
2. **Confidence never promotes verification.** Already the rule in Organisation Intelligence (`ORGANISATION_INTELLIGENCE.md` §4); now global. A JSON-LD extraction at 0.98 confidence is still `ai_extracted` until a human confirms.
3. **`effectiveKind()` generalises.** A calculation resting on a forecast is not a calculation. The existing finance implementation walks `supportedBy` cycle-safely and returns the weakest kind in the chain; it moves to `lib/knowledge/` unchanged in behaviour.
4. **A human edit yields `provided`, not `verified`.** The value became the human's, not the source's, and the original source reference is retained.
5. **Provenance is observed, not assumed.** Generation returns the claim IDs it actually used via structured output, validated before persistence. A claim ID that was not offered is a validation failure, not a warning. **This is how S2 dies** — there is no code path left that can assert use without a reference.
6. **`claim_usages` is a first-class reverse index** — `(claimId, usedIn: EntityReference, usedAt, context)`. "Where did this £420,000 come from?" and "what breaks if this number is wrong?" are the same query in opposite directions.

### 2.4 Migration approach — additive, reversible, no big bang

`Attested<T>` is **retained as the read projection of a claim**:

```ts
interface Attested<T> {
  value: T;
  verification: VerificationState;
  source?: string;      // legacy display fallback; deprecated, not dropped
  lastVerifiedAt?: ISODate;
  claimId?: UUID;       // new — when present, the claim is the source of truth
}
```

Read paths prefer the claim and fall back to the inline value. This is precisely the pattern the relationships slice used to bridge `Funder` → `ExternalOrganisation` without rewriting the funding module, and it worked. The ~25 profile fields migrate individually rather than in one commit, and each step is reversible.

Legacy columns are dropped only once every read path is migrated and a full cycle has passed.

---

## 3. Sequence

Ordering rationale, stated once: **schema-shaping work happens before the storage adapter is written, and call-site migration happens before both.** Writing the Supabase adapter against today's shape and reshaping afterwards means writing the adapter twice and migrating live data on the second pass.

```text
A  Legacy path removal          no DB, mechanical, unblocks adapter swap
B  Knowledge/Claims + 0004      schema settled in-memory; S1, S2 closed
C  Supabase adapter + auth      written once, against the final shape; S3 closed
D  Reporting engine             reports reference knowledge, not copied numbers
E  Finance vertical             the designed engine gets a product surface
F  Intelligence orchestrator    AI calls deterministic tools; does not re-derive them
G  Attention system + events    Command Centre becomes triage, not a KPI wall
H  Onboarding → first result    the pipeline earns the right to exist on day one
```

---

### Slice A — Remove the legacy data path

**Objective:** no file outside `src/server/data/` reads the store. Completes deferred criterion 7 of Phase 1A.

**Scope, measured:** 18 files import `@/features/store`; 2 are the data layer itself and legitimate. **16 files migrate** — 15 dashboard pages plus `features/dashboard/selectors.ts`. Then `q` and `mutate` are deleted.

| Why first | Because |
|---|---|
| The adapter swap is unsafe otherwise | 15 pages bypassing the repository will not follow the adapter when it changes |
| It is mechanical and verifiable today | No database, no new concepts, e2e journeys are the safety net |
| It is the last blocker on Slice C | Slice C's contract suite is meaningless if pages don't use the contract |

**Acceptance:** `grep -rl '@/features/store' src` returns only `src/server/data/`. All 259 unit + 11 e2e tests green. No behaviour change.

**Risk:** sync → async in server components. Next server components are natively async; the e2e journeys catch regressions.

### Verification record — Slice A ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **262 passed** (was 259; +3 data-boundary guards) |
| `npm run test:e2e` | 11/11 passed |
| `npm run build` | succeeds, 18/18 static pages |
| Mutation test | Disabling `scoped()`/`scopedFind()` fails **27** tests — up from 14 at slice 1A-i, because the migrated surface is now covered. The rewritten `store.test.ts` is among the failures, so it is not vacuous. Restoring returns 262/262. |

**What changed:** 16 files migrated off `q`/`mutate` (15 dashboard pages plus `features/dashboard/selectors.ts`); `q`, `mutate`, `recordAudit`, `recordAiGeneration`, `DEMO_ORG_ID` and `CURRENT_USER_ID` deleted. `src/features/store/index.ts` went from 437 lines to 132 and is now **state only** — it has no query or mutation surface at all. `FundingRepository.opportunityQuestions()` was added, the one accessor the repository lacked. `tests/unit/store.test.ts` was rewritten against the repository, preserving its five assertions.

**Invariant 1 is now upheld**, and the acceptance criterion is executable rather than documentary: `tests/unit/data-boundary.test.ts` fails the build if any file outside `src/server/data/` imports the store.

**Beyond the stated scope, and why.** The frozen demo clock (audit §4.3) survived slice 1A-i in the view layer as **eight** independent `new Date("2026-07-21T10:00:00Z")` constants across pages and components, which `ctx.now()` could not override. Since every one of those files was being migrated onto the context anyway, they now take the clock from `ctx.now()` — threaded as a `now` prop into the three client components that need it (`FundingPipeline`, `ShellChrome`, and their children). The boundary test guards this too; it is what found the eighth instance, inlined in a `timeAgo()` call in `ShellChrome`, which manual review had missed.

---

### Slice B — Knowledge / Claims layer + migration 0004

**Objective:** one epistemic foundation; close S1 and S2; settle the schema before any adapter is written.

**Build:**

| Area | Work |
|---|---|
| `lib/knowledge/` | `Claim`, `ClaimSource`, `ClaimProducer`, `claim value` union; `effectiveKind()` and `traceClaim()` moved from `finance-intelligence/statements.ts` with behaviour preserved; evidence strength computed deterministically from count, recency, verification state and independence |
| `types/domain.ts` | `Attested<T>` gains `claimId?`; `AIProvenance` marked deprecated; `EntityType` gains `claim`, `document`, `report`, `research_source` |
| Repository | `ClaimRepository` on `MissionRepository` — tenant-scoped, `RequestContext`-first like every other repository |
| Adapters | in-memory implementation + claim seeding in the two-tenant fixture |
| Migration `0004` | `claims`, `claim_sources`, `claim_usages`, `claim_conflicts`; **`alter table users enable row level security`** (S1); the missing `activity_events` table (audit §6); `updated_at` triggers; soft-delete columns; UUID fixtures replacing slug IDs |
| Finance | `Statement` becomes a `Claim` projection. No calculation changes; the 80 finance tests must pass untouched. |
| Org Intelligence | `ProfileCandidate` approval produces a `Claim`, not a bare `Attested<T>` |
| AI | generation returns used claim IDs via structured output, validated before persistence |

**Acceptance:**

1. Any figure in a report or application answer traces to evidence in ≤5 hops via one query.
2. `AIProvenance` has no remaining writer; every provenance record names claim IDs that were demonstrably offered.
3. `users` has RLS enabled; the two policies in `0002` are live rather than inert.
4. Claims are tenant-isolated — the two-tenant suite covers claims, sources, usages and conflicts.
5. The 80 finance and 41 organisation-intelligence tests pass **unmodified**.
6. Seed IDs are UUIDs and load into Postgres as-is.

**Mutation test:** removing the claim-ID validation in the generation path must fail a test asserting fabricated provenance is rejected.

### Verification record — Slice B ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **313 passed** (was 262; +27 knowledge, +13 claim isolation, +7 schema invariants, +4 observed provenance) |
| `npm run test:e2e` | 11/11 passed |
| `npm run build` | succeeds |

**Mutation tests — three, one per rule the slice exists to enforce:**

| Mutation | Result |
|---|---|
| Tolerate fabricated references in `observeGrounding` (i.e. revert to S2) | 2 tests fail |
| Disable `assertProducerMayAssign` (let confidence promote verification) | 2 tests fail |
| Remove `alter table users enable row level security` from 0004 | 2 tests fail |

Each restores to 313/313.

**Acceptance criteria:**

| # | Criterion | State |
|---|---|---|
| 1 | Any figure traces to evidence in ≤5 hops via one query | ✅ `traceDepth` measures it; asserted against the seeded chain, not a synthetic one |
| 2 | `AIProvenance` has no remaining writer | ✅ The type is **deleted**, and `data-boundary.test.ts` fails the build if it returns in a code position |
| 3 | `users` has RLS enabled | ✅ Migration 0004; `schema-invariants.test.ts` would have caught the original omission |
| 4 | Claims are tenant-isolated | ✅ 13 tests, including the derivation traversal — the leak route unique to this layer |
| 5 | The 80 finance and 41 organisation-intelligence tests pass **unmodified** | ✅ Both suites untouched |
| 6 | Seed IDs are UUIDs and load into Postgres as-is | ⏳ **Deferred to Slice C** — see below |

**On criterion 6 — deferred deliberately.** Converting the seed from slugs (`prog-youth`, `ans-h2`) to UUIDs breaks every test and e2e journey that addresses a record by id, for a benefit that is purely Supabase-loading. With no project provisioned, that is churn with real regression risk and no verifiable payoff. It moves to Slice C, where the adapter that needs it is written and the conversion can be proven end to end.

**What changed beyond the stated scope, and why.** Two things, both because the slice made them cheap and leaving them would have meant a second migration:

- **Finance's `EntityReference` collapsed into the shared one.** `finance-intelligence/types.ts` carried its own `FinanceEntityType`, with a comment saying it should collapse into the domain reference "rather than compete with it" once that existed. It now does: `EntityType` absorbed the finance kinds, `FinanceEntityType` is an `Extract<>` over it, and a finance statement and a knowledge claim point at entities identically. `statementToClaim()` is the projection between them. All 80 finance tests pass untouched.
- **S6 and S7 closed early.** The Anthropic provider needed rewriting anyway for structured output, so it gained a 30s timeout, bounded retry that does not retry unretryable 4xx, and `max_tokens` raised from 1024 (too low for a report section) to 4096. Fallback is now structured metadata — `usedFallback` plus `fallbackReason`, surfaced in the provenance drawer — rather than a suffix appended to the model string, which no UI could reliably branch on.

---

### Slice C — Supabase adapter, auth, RLS hardening

**Objective:** Postgres becomes the system of record; every visitor is no longer a hardcoded owner (S3).

**Build:** `@supabase/supabase-js` + `@supabase/ssr`, server-side clients only; `server/data/supabase/` against the Slice B interfaces; a **shared contract suite** (`tests/contract/repository-contract.ts`) run against both adapters; Supabase Auth with `RequestContext` resolved from session + membership; **`can()` enforced in every mutating server action** — the relationship actions are the existing precedent, the rest follow; storage for documents; rate limiting; structured error/latency observability that never logs beneficiary data.

**⚠ Verification constraint — no Supabase project is provisioned.**

| Verifiable now | Not verifiable without a project |
|---|---|
| Adapter compiles against the interface | Migrations apply cleanly |
| Contract suite passes on in-memory | Contract suite passes on Postgres |
| Auth wiring, session → `RequestContext` | Real session round-trip |
| `can()` enforcement, unit-tested | — |
| SQL reviewed for RLS coverage | **RLS blocks cross-tenant access at the database level** |

The last row is the point of the exercise. Until a project exists, the slice ships with that gap **stated in the verification record**, and the "Supabase (live)" runtime descriptor keeps telling the truth. Adapter-level filtering is not a substitute for RLS; the design is defence in depth and only one layer will have been proven.

---

### Slice D — Reporting engine

**Objective:** one engine, twelve report types, no copied numbers.

```text
                    REPORT
            ┌─────────┴─────────┐
        TEMPLATE             SECTIONS
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                 CLAIMS      METRICS    NARRATIVE
                    └───────────┼───────────┘
                                ▼
                             SOURCES
```

**Types:** impact, funder, grant, programme, trustee, board pack, annual, finance, management, donor update, partner, custom.

**Build:** `ReportDefinition` / `Report` / typed `ReportSection` replacing the fixed 14-key `ReportSectionKey` union; the 9-state lifecycle (`draft → collecting_evidence → drafting → internal_review → changes_requested → ready_for_approval → approved → submitted → archived`); owner / contributors / reviewers / approvers, with trustees able to approve without editing; **deterministic report readiness** from indicator currency, evidence availability and staleness, unsupported claims, figure consistency and deliverable completion; provider-independent export.

`ImpactReport` migrates onto it **without data loss** — existing reports become `type: "impact"` with their 14 keys mapped to section types.

**The differentiating rule:** a report section referencing a figure holds a `claimId`, never a copied number. Asking "where did this £420,000 come from?" is a traversal, not a search.

**Acceptance:** a grant report can be built, reviewed, approved and exported with every figure traceable; a claim superseded after publication surfaces on the report as a flagged change rather than silently altering it.

---

### Slice E — Finance vertical

**Objective:** give the calculation core a product surface. The mathematics is built and tested; the foundation beneath it is not.

```text
Upload → Statement → Transactions → Normalisation → Classification → Review
   → Financial position → Grant / Programme allocation → Funding needs
   → Impact economics
```

**Build:** document upload and statement parsing (CSV/OFX first, bank feeds behind the same port later); transaction normalisation and deterministic classification with a **review queue** — classification is suggested, never silently applied; persistence for `FinancialTransaction`, `FinancialAllocation`, `Budget`, `FundingNeed` through `MissionRepository`; the allocation review UI; Programme Economics view; forecast chart; funding-need approval flow; report section rendering for the finance sections in Slice D.

**Nothing in `lib/finance-intelligence/` changes.** Every existing refusal — withheld unit costs, the SROI refusal, comparability gates, `needs_review` on calculated needs — must survive contact with real data. Where it fires, the UI shows the reason, not a blank.

Figures produced here are **claims** with `producedBy: { method: "calculation" }`, so the methodology travels with the number into reports.

---

### Slice F — Intelligence orchestrator

**Objective:** replace four isolated entry points with an orchestrator over deterministic tools.

Today: `generateAnswer()`, `generateReportSection()`, `askCommand()`, `summarisePipeline()`.

```text
                    USER INTENT
                         ▼
                 INTELLIGENCE ORCHESTRATOR
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
   KNOWLEDGE           TOOLS            POLICY
   Claims              Funding          Permissions
   Evidence            Finance          Approval
   Documents           Programmes       Privacy
   Relationships       Impact           AI policy
   Mission Graph       Reports
       └─────────────────┼─────────────────┘
                         ▼
                     RESPONSE
                 ┌───────┴───────┐
                 ▼               ▼
            EXPLANATION       ACTION → human approval
```

**The governing rule: the model calls deterministic Pegasus capabilities; it never recreates their reasoning.**

> "Can we afford to expand Youth Futures?"

resolves to `getFinancialPosition()`, `getProgrammeEconomics()`, `getFundingRunway()`, `getCommittedFunding()`, `getForecast()`, `getFundingNeeds()` — and the model explains the results. It does not compute a runway.

> "Should we apply for this grant?"

invokes the unchanged deterministic `assessFit()`, then augments it with relationship context, capacity, finance position, funding need and evidence readiness.

**Build:** tool registry with typed schemas over the existing pure functions; context assembly from authorised claims only; the policy layer (permissions, PII minimisation, injection defence, approval gates); routing across the six intelligence kinds; structured output validated before persistence; execution records capturing feature, prompt version, provider, model, claim IDs used, validation result, fallback state and human review state. Mock fallback is surfaced explicitly in the UI (closes **S7**), never disguised as live generation.

Existing AI features keep working throughout and migrate onto this incrementally.

---

### Slice G — Attention system and domain events

**Objective:** Command Centre answers *"what needs my attention today?"* — not another analytics dashboard.

```text
GOOD AFTERNOON, SARAH          3 things need attention

01 FUNDING   Youth Futures projected £310k gap from April 2027.
             3 potentially strong opportunities. Earliest deadline 28 September.
02 GRANT     Henderson Trust interim report due in 12 days.
             4/5 indicators ready. 1 evidence gap.
03 FINANCE   Unrestricted runway 4.2 months, down from 5.1 last quarter.
             Main driver: £42k increase in programme commitments.

COMING UP    Today Comic Relief meeting · Thu Trustee pack · 28 Aug Henderson report
```

**Why events come with it:** evaluating every deterministic engine on every page render is acceptable at demo scale and not at tenant scale. `EVENT → CONDITION → ACTION` is pulled forward from the old Phase 10. Domain events (`OpportunityDiscovered`, `GrantAtRisk`, `DeliverableOverdue`, `EvidenceOutdated`, `ReportDueSoon`, `RunwayChanged`) are emitted by the data layer on state transitions and consumed by a rules engine. Implementation stays pragmatic — an in-process dispatcher plus a Postgres-backed job table. **No queue infrastructure until measurement demands it.**

Attention items are role-aware (CEO, fundraiser, programme manager, MEL lead, finance, trustee), each carries the claims behind it, and each has one clear action.

---

### Slice H — Onboarding to first useful result

**Objective:** onboarding ends with value, not "your account is ready".

```text
name · website · country · registration number
   → PUBLIC DISCOVERY (website, regulator, annual reports, accounts, policies)
   → CLAIM EXTRACTION → conflict detection → authority → verification
   → HUMAN REVIEW → ORGANISATION KNOWLEDGE → INITIAL INTELLIGENCE
```

Replaces the hardcoded 8-step facade in `OnboardingFlow.tsx` (which persists nothing and hardcodes "82% complete"). The visual shell is well-built and is reused.

Requires Organisation Intelligence Phase 2: a real crawler behind the existing `PageFetcher` port with robots.txt, rate limiting and link discovery at depth — the extraction core, sanitisation, reconciliation and approval logic already exist and are tested.

**Completion screen:** *N facts discovered / verified from authoritative sources / need confirmation / could not be established*, a readiness assessment across funding profile, evidence, impact measurement, financial visibility, governance and digital presence, and concrete findings — relevant opportunities, funding expiring within 12 months, missing evidence that commonly appears in applications, outdated public statistics.

Every number on that screen is a claim. `could not be established` is reported as its own state — the `not_publicly_found ≠ missing` distinction already modelled in `OrganisationGap` must not collapse in the UI.

---

### Slice I — Integrations (after the above)

Email, calendar, accounting, banking, document stores and external funding sources feed the same model through the boundaries already declared in `server/communications/provider.ts`. No provider identifier ever enters a core entity.

---

## 4. Deliberately parked

Donations, campaigns, mass email, WhatsApp, partner/trustee/funder portals, forms and surveys, events, full governance, sophisticated calendars, the visual relationship network, formal SROI, and internationalisation.

All are legitimate Mission OS capabilities. None is the bottleneck. Breadth is not the constraint.

---

## 5. Verification protocol

Every slice ends with all of the following green, plus an update to this document and the relevant architecture doc:

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
```

Additionally, per slice:

- **A mutation test.** Disable the mechanism the slice exists to provide and demonstrate that named tests fail; restore and demonstrate green. A suite that passes when the safety is removed is decoration. Precedents: disabling `scoped()` fails 14 isolation tests; naïve rounding in place of largest-remainder splitting fails 4 finance tests.
- **Isolation coverage** for every new tenant-owned table, in the two-tenant suite.
- **An honest verification record** naming what was *not* verified and why.

No slice is complete unless it works end to end.

---

## 6. Open constraints

| Constraint | Effect | Owner |
|---|---|---|
| **No provisioned Supabase project** | Slice C ships with database-level RLS unproven. Adapter filtering will be tested; the second layer of defence in depth will not. | User |
| `AI_PROVIDER=mock` by default | Structured-output validation in Slices B and F is tested against the mock provider. Live-provider schema conformance is unverified until a key is configured. | User |
| No live ledger data | Slice E's classification and normalisation are exercised against fixtures. Real bank exports will surface format variance. | Slice E |

## 7. Status

> **Amended by the Mission Graph Expansion Programme.** [`MISSION_OS_EXPANSION_PLAN.md`](./MISSION_OS_EXPANSION_PLAN.md) §1 verifies this table against the working tree and corrects two entries. **MG-1 (Mission Graph completion) is complete and verified** — migrations `0017`–`0020`, the `Relation` primitive, the results chain, money entities, reporting requirements and strategy — and precedes the remainder of Slice C. Ten of the twelve links in the architectural acceptance test now hold.

| Slice | State |
|---|---|
| A — Legacy data path removal | ✅ **Complete and verified** |
| B — Knowledge / Claims + migration 0004 | ✅ **Complete and verified** |
| **MG-1 — Mission Graph completion** | ✅ **Complete and verified** (migrations `0017`–`0020`) |
| C — Supabase adapter + auth | 🟡 **Split, and the split matters.** Auth and permission enforcement **shipped**; `resolveSupabaseRequestContext` validates session and membership. **The data adapter does not exist** — `src/server/data/supabase/` holds a client, a mapping helper and middleware, and no repository. `getRepository()` returns in-memory unconditionally. The storage half is **MG-2** and is the critical path. |
| D — Reporting engine | 🟡 **In progress** — generic types, 12 templates, nine-state lifecycle, deterministic readiness, claim-pinned sections, neutral export payload and the impact-report UI are built and verified. Report creation, format adapters and full legacy-content migration remain. |
| E — Finance vertical | ⏳ Planned |
| F — Intelligence orchestrator | ⏳ Planned |
| G — Attention system + events | ⏳ Planned |
| H — Onboarding to first result | ⏳ Planned |
| I — Integrations | ⏳ Planned |

### Audit findings, tracked to closure

| Finding | Closes in |
|---|---|
| S1 — `users` RLS never enabled (37 of 38 tables) | ✅ **Closed in Slice B** (migration 0004; unverifiable against a live DB until Slice C) |
| S2 — fabricated AI provenance | ✅ **Closed in Slice B** (type deleted, not patched) |
| S3 — no authentication | **Slice C** |
| S4 — prompt-injection surface | 🟡 **Partly closed in Slice C** — evidence text is now sanitised in the AI context builder, reusing the tested Organisation Intelligence module that previously had no consumers. Full generalisation still lands with Slice F. |
| S5 — `askCommand` self-approving | ✅ Closed in 1A-i (recorded as `pending`) |
| S6 — no timeout/retry, `max_tokens: 1024` | ✅ **Closed early in Slice B** (the provider was being rewritten anyway) |
| S7 — fallback signalled only by a model-string suffix | ✅ **Closed early in Slice B** (`usedFallback` + `fallbackReason`, surfaced in the UI) |
| §4.5 — permissions advisory, not enforced | ✅ **Closed in Slice C** (all actions; guarded by a build-failing test) |
