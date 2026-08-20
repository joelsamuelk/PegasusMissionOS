# Mission OS — Expansion Plan

**Status:** Active planning document for the Mission Graph Expansion Programme.
**Relationship to the build spec:** [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md) remains the sequencing authority for slices A–I and its ten Production Invariants remain non-negotiable. This document maps the MG programme onto those slices, adds the phases the slices do not cover, and reconciles the two orderings where they disagree.
**Companions:** [`MISSION_GRAPH_ARCHITECTURE.md`](./MISSION_GRAPH_ARCHITECTURE.md), [`MISSION_OS_CAPABILITY_MAP.md`](./MISSION_OS_CAPABILITY_MAP.md)

---

## 1. Where the build actually is

Verified, not asserted. `npm run typecheck` clean; `npm test` **633 passed** across 67 files; `npm run lint` clean; `npm run build` succeeds.

**MG-1 and MG-3 are complete.** See the verification records in §4 below. The table that follows describes the slices they did *not* change.

**MG-3 ran ahead of MG-2 and MG-8, reversing the order recommended in §2.** That was a deliberate call by the user, and §2 named the condition for it: first-run experience taking priority. The consequences are real and are recorded in the MG-3 verification record rather than glossed: discovered facts live in the in-memory store until MG-2, and the audit's financial visibility section reports published annual figures while saying plainly that they cannot answer a question about this month.

| Slice | Build spec says | Working tree says |
|---|---|---|
| A — Legacy data path removal | ✅ Complete | ✅ Confirmed. `getRepository()` is the only path; `data-boundary.test.ts` fails the build if anything outside `src/server/data/` imports the store. |
| B — Knowledge / Claims + `0004` | ✅ Complete | ✅ Confirmed. Claims, sources, supports, usages, conflicts, all persisted in schema and implemented in-memory. |
| C — Supabase adapter + auth | ⏳ "Next" | 🟡 **Split.** Auth is **done** — `resolveSupabaseRequestContext` validates session and membership properly. Permission enforcement is **done**. **The data adapter does not exist.** `src/server/data/supabase/` contains a client, a mapping helper and middleware, and no repository. |
| D — Reporting engine | 🟡 In progress | ✅ Matches. Generic types, 12 templates, 9-state lifecycle, deterministic readiness, claim-pinned sections, neutral export. Creation, format adapters and legacy migration outstanding. |
| E — Finance vertical | ⏳ Planned | Confirmed. 4,809 lines of tested calculation, **zero product consumers**, zero tables. |
| F — Intelligence orchestrator | ⏳ Planned | Confirmed. Four AI entry points call `runAi` directly; no router, no policy layer. |
| G — Attention + events | ⏳ Planned | Confirmed. No dispatcher, no job table. Signals recomputed per render. |
| H — Onboarding → first result | ⏳ Planned | Confirmed. `OnboardingFlow.tsx` is a 228-line client facade that persists nothing. |
| I — Integrations | ⏳ Planned | Confirmed. Communication provider ports declared; nothing implemented. |

**The correction that matters:** the build spec's status table implies Slice C is a single unstarted unit. It is not. Its authentication and authorisation halves shipped, and its **storage half did not**. The runtime descriptor in `src/server/data/index.ts` is already honest about this and should stay that way until it is false.

Two facts govern everything below:

1. **The customer product has never read from Postgres.** RLS is reviewed SQL, not executed code. Invariant 1 holds in the application layer only, so defence in depth is currently defence in one layer.
2. **Seven of the twelve links in the brief's §9 acceptance chain are not representable.** See [`MISSION_GRAPH_ARCHITECTURE.md`](./MISSION_GRAPH_ARCHITECTURE.md) §5. The brief's instruction on that outcome is explicit: fix the architecture before adding more UI.

---

## 2. Reconciling MG-1…MG-12 with slices A–I

| MG phase | Maps to | State | Blocked by |
|---|---|---|---|
| **MG-1** Mission Graph | **New.** Structural changes SC1–SC6. | ✅ **Complete and verified** | — |
| **MG-2** Production foundation | Slice C, storage half (SC8) | Not started | External: no provisioned Supabase project |
| **MG-3** Onboarding Intelligence | Slice H + Organisation Intelligence Phases 2-5 | ✅ **Complete and verified** | Ran ahead of MG-2 by decision; see below |
| **MG-4** Mission Intelligence | Slice F | ✅ **Complete and verified** | Ran ahead of MG-8 and MG-6 by decision; see the record below for what that costs |
| **MG-5** Reporting Engine | Slice D | ✅ **Complete and verified** | Persistence still waits on MG-2 |
| **MG-6** Mission Automations | Slice G + automation beyond attention | ✅ **Complete and verified** | Persistence still waits on MG-2 |
| **MG-7** Mission Forms | Parked in build spec | ✅ **Complete and verified** | Persistence still waits on MG-2 |
| **MG-8** Finance Runtime | Slice E | Not started | **MG-1 SC2** — it has no tables |
| **MG-9** Mission Portals | Parked | Not started | MG-2, MG-12 |
| **MG-10** Fundraising | Parked | Not started | MG-1 SC2, MG-8 |
| **MG-11** Integrations | Slice I | Not started | MG-2 |
| **MG-12** Production hardening | New, continuous | Ongoing | — |

### Deviations from the brief's recommended sequence, and why

The brief presents its order as a recommendation. Three changes are proposed.

**1. MG-5 Reporting moves ahead of MG-3 and MG-4.** It is already 70% built and is the surface that makes the claims layer pay off. Leaving it 70% done while starting two new phases is the most expensive option available.

**2. MG-8 Finance Runtime moves ahead of MG-4 Mission Intelligence and MG-6.** The orchestrator's entire value is the deterministic tools it can call. Building it while the largest tool set — 19 finance modules — has no data to run on produces an orchestrator that routes to four features and has to be revisited. Finance also unblocks the majority of the north-star questions in the brief's §1: runway, underspend, funding cliffs, "what happened to the £250,000 grant".

**3. MG-3 Onboarding Intelligence moves after MG-2 and MG-8.** Slice H's own specification requires persistence: an onboarding run that discovers eighty facts into an in-memory store loses them on restart. Its completion screen also promises a readiness assessment across *financial visibility*, which cannot be produced before MG-8.

This is the deviation most worth arguing about, because ease of onboarding is one of the five competitive principles and an empty graph is not compelling. **Reverse it if** a design partner is waiting on first-run experience — in that case run MG-3 immediately after MG-2, accept a completion screen without the finance readiness section, and say so on the screen rather than filling the gap.

---

## 3. Sequence

```text
MG-1   Mission Graph completion      schema only, no UI, closes §9 links 3–6, 8, 9, 11
MG-2   Production foundation         Supabase adapter; RLS becomes executed code
MG-5   Reporting engine              finish Slice D on real persistence
MG-8   Finance runtime               the tested engine gets inputs and a surface
MG-6   Mission automations           events; §9 link 12; scale precondition
MG-4   Mission Intelligence          orchestrator over a tool set worth orchestrating
MG-3   Onboarding intelligence       first run ends in value, and the value persists
MG-7   Forms · MG-10 Fundraising · MG-9 Portals · MG-11 Integrations
MG-12  Production hardening          gates each of the above, continuously
```

**MG-1 and MG-2 are one commitment.** The build spec's rule — schema-shaping before the adapter — is correct and is retained. It has also now deferred the adapter through four slices, and MG-1 defers it once more. The condition attached: MG-1 is the **last** schema-shaping phase before the adapter, it is timeboxed to schema, repository and tests, **no UI is built during it**, and MG-2 follows immediately without any capability inserted in front of it.

---

## 4. Phase definitions

Every phase carries the same definition of done, from the build spec §5, and none is complete without all of it:

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
```

plus, per phase:

- **A mutation test.** Disable the mechanism the phase exists to provide; named tests must fail. Restore; green. A suite that passes with the safety removed is decoration.
- **Isolation coverage** in the two-tenant suite for every new tenant-owned table, in the same change that creates the table.
- **A security review** against §13 of the brief, recorded.
- **An honest verification record** naming what was *not* verified and why.

---

### MG-1 — Mission Graph completion

**Objective:** make the brief's §9 acceptance chain representable. Nothing else.

**Entry:** none. Startable today.

**Explicitly out of scope:** every screen. This phase ships schema, repository methods, pure logic and tests. If a page changes, the phase has lost its boundary.

| # | Work | Migration |
|---|---|---|
| SC5 | Generalise `Relation` — `from`, `to`, `kind`, optional attestation. `RelationshipLink` becomes a view over it and its call sites are unchanged. Doing this first stops SC1, SC3 and SC4 each inventing a join table. | `0017` |
| SC1 | Promote `Activity` and `Output` to entities in TypeScript, matching the tables that already exist. Add `contributes_to` relations Activity → Output → Outcome and Outcome → Outcome. Deprecate `Programme.activities` / `Programme.outputs` string arrays using the established `Funder.contactName` pattern: keep as display fallback, migrate behind it. | `0017` |
| SC3 | Extend the evidence plane to `indicator` and `indicator_measurement` as `Relation { kind: "evidences" }` rather than widening `EvidenceLink.targetType` a second time. | `0019` |
| SC4 | `ReportingRequirement`, owned by a grant or opportunity, pointing at outcomes, indicators and evidence types. Turns "what did we promise this funder?" into a traversal and report readiness into a real answer. | `0019` |
| SC2 | Money **schema only**: `Fund`, `FinancialTransaction`, `FinancialAllocation`, `Budget`, `BudgetLine`, plus repository interfaces. Types come from `lib/finance-intelligence/types.ts` unchanged. No parsing, no classification, no UI — that is MG-8. | `0018` |
| SC6 | `StrategicPriority` as a node owning programmes and funding needs. Migrate `OrganisationProfile.strategicPriorities` onto it behind the `Attested<T>` claim projection. | `0020` |
| — | Add `inference` and `hypothesis` to `ClaimKind` with the revised ordinal scale ([`MISSION_GRAPH_ARCHITECTURE.md`](./MISSION_GRAPH_ARCHITECTURE.md) §7). Behavioural change to `effectiveClaimKind`; requires tests pinning the new ordering, not just the new labels. | `0020` |

**Permissions:** `Relation` writes inherit the capability of the entity on the `from` side. No new capability is introduced for edges — an edge nobody may create is a capability bug, and an edge anybody may create is a security bug.

**Tests:**
- Traversal tests for the full §9 chain, asserted end to end as one test rather than six.
- Two-tenant isolation for every new table.
- **Mutation test:** remove the `contributes_to` edge type; the §9 traversal test must fail.
- Property test that `Relation` cannot join entities from two organisations.

**Security review:** `Relation` is the first table where an edge can point anywhere. Confirm `organisationId` is enforced on **both** endpoints, not just the row.

**Acceptance:** the §9 chain is constructible in the in-memory adapter and traversable in one query path, and `MISSION_GRAPH_ARCHITECTURE.md` §5 is rewritten with twelve holds.

**Exit:** all twelve links representable. No UI changed.

### Verification record — MG-1 ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean — **after fixing two pre-existing errors** unrelated to MG-1 (see below) |
| `npm test` | **633 passed**, 67 files (was 581 across 66) |
| `npm run test:e2e` | **20/20 journeys and marketing pass** in mock mode. 6 Control Plane specs fail; see below. |
| `npm run build` | succeeds |

**Mutation tests.** Two, both required by the protocol, both restored afterwards.

1. Force `entityExists()` to return true — the endpoint check that makes a polymorphic edge table tenant-safe. **4 named tests fail**, all in `relations cannot cross the tenant boundary`. Restored: green.
2. Make `scoped()` return rows unfiltered. **25 tests fail across 6 files.** Restored: green. This is the pre-existing isolation guard, re-run to confirm the new tables joined it rather than sitting outside it.

**What was built.** Migrations `0017`–`0020`; `Relation`, `Activity`, `Output`, `StrategicPriority`, `ReportingRequirement`, `Fund`, `Budget`, `BudgetLine` in the domain model; `Money`, `FinancialTransaction` and `FinancialAllocation` **promoted** from `lib/finance-intelligence/types.ts` into `types/domain.ts` on the same reasoning that promoted `ClaimKind` — the data boundary should not import a calculation library to describe a row. The finance library re-exports them, so its nineteen modules are untouched. Four new repositories (`graph`, `strategy`, `finance`, `requirements`), taking the boundary from 11 to 15. `inference` and `hypothesis` added to `ClaimKind`.

**Beyond the stated scope, and why.**

- **`assertKindMayNotStrengthen`.** Writing the kind extension surfaced a route around the brief's own prohibition. `effectiveClaimKind` computes the weakest link over a *support chain*, so the cheapest way to launder a hypothesis into a fact was never to argue with the chain but to supersede the weak link with a strong successor — which preserved immutability and defeated the rule. A non-human producer may no longer strengthen a kind by superseding. Enforced on the storage path, asserted in the shared contract.
- **`IndicatorMeasurement` actually stored.** The type existed with no state behind it, so `updateIndicator` overwrote `currentValue` and the previous reading was lost. §9 link 8 requires evidence to support *a measurement*, which cannot exist if measurements do not. Readings are now appended.
- **Two pre-existing lint errors fixed.** `MarketingFooter.tsx` used `<a href="/">` where `Link` was already imported, and `control/intelligence/growth/page.tsx` was missing a `key` in an iterator. Neither is in a file MG-1 touched; both blocked the mandated `npm run lint` gate, so the protocol was already failing before this phase began.

**On the e2e suite, which needed diagnosis before it could be reported.** A first run showed 17 of 26 failing, which looked like a regression and was not.

- `.env` now configures Supabase, so `appConfig.isMockData` is false and every request resolves through `resolveSupabaseRequestContext`, which requires a real session and membership. There is none, so no dashboard journey can run. The suite is written for mock mode. Forcing mock mode took the result from 9 passed to 19.
- One further failure was **pre-existing drift**: journey 1 asserted a link named "continue to workspace", while commit `3c7b133` (*Add magic link authentication*) renamed it to "Continue to demonstration". The test had never been updated. Corrected, and all 20 journey and marketing specs now pass.
- The remaining 6 are the Control Plane specs, which need a provisioned Supabase project with `internal_users`. They fail with Supabase absent (no backend) and with it present (no internal session). Neither state is caused by MG-1, and both are the standing constraint in §6.

**A note this run surfaced, worth keeping.** With Supabase configured, the customer app already behaves as though it were live — it demands a session — while `getRepository()` still serves the in-memory store. `describeRuntime()` reports this honestly rather than claiming "Supabase (live)". It is a sharper illustration of the MG-2 gap than the documentation was: the product is half-migrated in exactly the direction that produces a confusing failure, and the half that is missing is the storage half.

**What was *not* verified, and why.**

- **Nothing has been applied to a database.** Migrations `0017`–`0020` are written and reviewed SQL. RLS on the eight new tables is unexecuted code, exactly as it is for the fifty-six that preceded them. This is the standing constraint in §6 and is what MG-2 exists to close.
- **`alter type claim_kind add value`** cannot be followed by a use of the new value in the same transaction. Nothing in `0020` uses them, so it is safe; a later migration inserting rows with these kinds must run separately. Unverifiable without a database.
- **No UI reads any of this.** By design — MG-1 was scoped to schema, repository and tests. The e2e journeys therefore prove that nothing *broke*, not that anything new works.
- **`RelationshipLink` was not migrated onto `Relation`.** Two edge tables remain, so "what connects to this entity?" still unions two sources. Deferred deliberately: folding it in touches the relationships UI. Scheduled with MG-6.
- **No backfill.** `Programme.activities`, `outputs` and `deliveryPartners` are deprecated in place, following the `Funder.contactName` precedent, and still hold the demo workspace's strings alongside the new entities.

---

### MG-2 — Production foundation

**Objective:** Postgres becomes the system of record for the customer product.

**Entry:** MG-1 complete. **A provisioned Supabase project** — this is the standing external constraint in build spec §6 and the phase cannot honestly complete without it.

**Scope:** `src/server/data/supabase/` implementing all 11 repositories against the MG-1 interfaces; the existing shared contract suite (`tests/contract/repository-contract.ts`) run against **both** adapters; `getRepository()` selecting on configuration; Supabase Storage for documents; rate limiting; structured error and latency observability that never logs beneficiary or claim content.

The Control Plane already runs on Supabase (`src/server/control-plane/supabase.ts`), so the adapter shape is proven in-repo. This is not novel work; it is deferred work.

**Tests:**
- Contract suite green on Postgres, not only in-memory. This is the row in the build spec's Slice C table that has never been ticked.
- **Cross-tenant RLS test executed against a live database.** Not reviewed SQL. An authenticated session for org A issuing a direct query for org B's rows must return nothing with the adapter's own filter removed.
- **Mutation test:** disable adapter-level `organisationId` filtering. Isolation tests must still pass, because RLS is the second layer. If they fail, defence in depth does not exist and the phase is not done.

**Security review:** the full §13 list. Particularly: migration `0004` enabled RLS on `users`, closing audit finding S1 — verify it against the live database, since that finding was a live data-exposure bug and has only ever been verified by reading SQL.

**Acceptance:** a real user signs in, is scoped to their organisation by membership, and every page renders from Postgres. `describeRuntime()` reports "Supabase (live)" truthfully.

---

### MG-5 — Reporting engine completion

**Objective:** finish Slice D on real persistence.

**Entry:** MG-2.

**Scope:** report creation from `ReportDefinition`; format adapters (PDF, DOCX, print, secure web view) behind the provider-independent interface already designed; full migration of legacy free-text figures onto `claimIds`, which is the remaining half of Invariant 5 — **the last of the ten Production Invariants still violated**; the finance sections deferred until MG-8 supplies figures.

**Acceptance (from the build spec, unchanged):** a grant report is built, reviewed, approved and exported with every figure traceable; a claim superseded after publication surfaces as a flagged change rather than silently altering the published report.

**Exit:** Invariant 5 upheld. All ten invariants green for the first time.

### Verification record — MG-5 ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean — four pre-existing warnings in Control Plane files, untouched by this phase |
| `npm test` | **799 passed**, 71 files (was 753 across 70) |
| `npm run test:e2e` | **32 passed, 2 failed.** Both failures are pre-existing and were reproduced at the base commit before any MG-5 change; see below |
| `npm run build` | succeeds |

**What was built.** Migration `0022`, six new tables. `ReportVersion`, `ReportSnapshot`, `ReportApproval`, `ReportContributor`, `ReportRequirement` and `ReportTemplateIngestion` in the domain model, with `ReportDefinition` extended to carry a template's origin. Seven new modules under `src/lib/reporting/`: versions and drift, completeness, report intelligence, creation, rendering, funder-template ingestion and board packs. Fifteen new repository methods. Server actions and a report workspace on `/impact/[id]`.

**Four of the brief's ten entity names were deliberately not created.** `ReportSection` is `ImpactReportSection`; `ReportTemplate` is `ReportDefinition`; `ReportClaim` is `claimIds` plus `ClaimUsage`, which is already the reverse index; `ReportEvidenceLink` is `Relation { kind: "evidences" }`, which MG-1 built precisely so evidence links would stop being a per-module enum. A second representation of an edge has to be kept consistent with the first, and the architecture's own rule is that no module owns a concept. Adding them would have been the phase's largest mistake and the easiest one to make.

**Invariant 5, and why it stayed amber through four slices.** The invariant is *published reports do not silently change*. Half of it was upheld the day `claimIds` shipped — a cited figure points at an immutable claim. The other half was never enforced: **a number typed into prose is not a citation**, and nothing stopped one being typed. `detectUncitedFigures` finds them, and an uncited money or percentage figure is now a blocker on approval. Bare counts are warnings, because the pattern cannot reliably tell "we ran 24 workshops" from "24 Bradford Road", and a warning list that fires on every street number is a list nobody reads.

**The design decision most worth recording: snapshots pin values, not only ids.** There are three ways to fail this invariant and only one way to keep it. Copying numbers into the document loses the link back. Re-rendering from live data makes a published report a moving target. Storing claim ids alone *looks* rigorous and is not — once a claim is superseded, the id resolves to a chain and the report can no longer say which link it meant. The snapshot therefore holds the claim id **and** the value as rendered. That pair is what makes drift computable, and drift is what turns a silent change into a flagged one.

**Mutation tests.** Three, all restored. The third is the one worth reading.

1. Make `buildReportVersion` share the report's sections array instead of cloning it. **Two named tests fail**, one unit and one contract. This is the failure that compiles, satisfies the type, and passes every assertion until somebody edits the report.
2. Stop `assessReportReadiness` checking prose figures. **The Invariant 5 approval test fails.**
3. Make the snapshot store an empty `renderedValue`. **It passed.** The snapshot test was vacuous: it ran against the seeded report, whose sections cite nothing, so it only ever exercised the indicator path. The test was rewritten to cite claims explicitly and now fails under the same mutation. A mutation test that passes is not a reassurance, it is a defect report about the test.

**Security review, against §13.**

- **Untrusted text in an export.** The HTML renderer escapes section content. Report prose is tenant-supplied and a report is the one artefact in the product designed to be sent to a third party, so an unescaped `<script>` in a section reaches a funder's browser. Asserted.
- **Refusal rather than substitution.** `renderReport` throws `RendererUnavailableError` for PDF and DOCX rather than returning HTML under a `.pdf` name. That substitution is discovered by a funder rather than by a test, which makes it the worst class of defect available here.
- **Extraction is never authority.** An ingested requirement is `needs_review` until a person accepts it, and acceptance promotes it to `provided`, never to `verified` — nobody has checked the reading against the funder. This is `assertProducerMayAssign`'s rule applied to a new producer.
- **Contributors must be members.** `addContributor` refuses a user who holds no membership of the organisation, which would otherwise be a route to naming an outsider on a tenant record.
- **Approvals are append-only** at the RLS layer, for the same reason audit events are: an approval that can be edited is not evidence anyone approved anything. A refusal without a reason is refused by both the schema and the adapter, independently.

**On the two e2e failures.** `control-plane.spec.ts` specs 1 and 4 fail on a heading that is no longer rendered — `/control` and `/control/outreach` show empty states instead. **They were reproduced at the base commit**, before any MG-5 change, by stashing the work and rebuilding: identical failures, same two specs. MG-5 touches no Control Plane file. The cause is commit `1f7a2c7` (*Run discovery for real, and keep demo data off real accounts*), which changed what the Control Plane shows when there is no data; the specs were not updated with it. It belongs to whoever owns that change, and is recorded here rather than fixed, because silently repairing another phase's tests hides the regression.

**What was *not* verified, and why.**

- **Nothing is persisted.** `0022` is written and reviewed SQL and has never been applied. Every guarantee above holds against the in-memory adapter. This is the standing constraint in §6 and it is now the blocker on two invariants rather than one.
- **PDF and DOCX do not exist.** Declared as ports, refused clearly. An organisation that needs a PDF today prints the HTML.
- **Ingestion is tested against synthetic blocks**, not against a real funder's PDF. The pattern set will meet layouts it cannot read; that is why the extraction reports how many questions it recognised and says plainly when it recognised none.
- **The board pack has no surface.** `buildBoardPack` assembles seven sections from the MG-4 intelligence layer and is unit-tested, and no page renders it. Assembling it correctly was the part that needed the graph; rendering it is a screen.
- **Legacy free-text figures were not migrated, because there are none.** The seeded report's sections are empty. What shipped is the mechanism that finds them, which is what a real migration needs first.

---

---

### MG-8 — Finance runtime

**Objective:** give the calculation core inputs and a surface.

**Entry:** MG-1 SC2 (tables), MG-2 (persistence).

```text
Upload → Statement → Transactions → Normalisation → Classification → Review
   → Financial position → Grant / Programme allocation → Funding needs → Impact economics
```

**Scope:** CSV/OFX statement parsing behind a port that a bank feed can later implement; deterministic classification with a **review queue** — classification is suggested, never silently applied; the allocation review UI, which is the record that makes cost-per-outcome defensible; Programme Economics view; forecast; funding-need approval; the finance report sections held back from MG-5.

**The governing constraint:** nothing in `lib/finance-intelligence/` changes. Every existing refusal — withheld unit costs with a `requires` list, the SROI refusal, comparability gates, `needs_review` on calculated needs — must survive contact with real data. Where a refusal fires, the UI shows the reason. It never shows a blank, and it never shows a zero.

Figures are persisted as claims with `producedBy: { method: "calculation" }` and `workings`, so methodology travels with the number into every report that cites it.

**Mutation test:** replace largest-remainder splitting with naïve rounding; four existing finance tests must fail. This precedent already exists and should be re-run against the persisted path.

**Security review:** transaction narratives routinely contain personal data — names of individuals paid, beneficiary references in payment descriptions. They must be excluded from AI context by default, not by remembering to redact.

---

### MG-6 — Mission automations

**Objective:** `EVENT → CONDITION → ACTION`, and a Command Centre that triages rather than reports.

**Entry:** MG-2.

**Scope:** domain events emitted by the data layer on state transitions (`GrantAtRisk`, `DeliverableOverdue`, `EvidenceOutdated`, `ReportDueSoon`, `RunwayChanged`, `OpportunityDiscovered`); an in-process dispatcher plus a Postgres job table — **no queue infrastructure**; the rules engine; role-aware attention items each carrying the claims behind them and one clear action; scheduled reminders, which is what closes §9 link 12.

**Why it cannot wait:** evaluating every deterministic engine on every page render is acceptable at demo scale and is not acceptable at tenant scale. This is a performance precondition, not only a feature.

**Security review:** an automation is an action taken without a human present. Every action type declares whether it requires approval, and anything external — email, a status change a funder can see — requires it unconditionally (Invariant 7).

### Verification record — MG-6 ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean — four pre-existing warnings in Control Plane files, untouched by this phase |
| `npm test` | **848 passed**, 72 files (was 799 across 71) |
| `npm run test:e2e` | **31/31** journeys and marketing. The two Control Plane failures recorded under MG-5 are unchanged and still pre-existing |
| `npm run build` | succeeds |

**What was built.** Migration `0023`, six tables. A condition language, an action catalogue, a rules engine and a simulator in `src/lib/automation/`; an event dispatcher, a scheduler, a bounded-action executor and a simulation service in `src/server/automation/`. One repository (`automation`), taking the boundary from 17 to 18. A page at `/automations`.

**The decision the whole phase rests on: evaluation is three-valued.** `true`, `false` and **`unknown`**. Two-valued logic must answer the brief's own example — `report.evidenceCompleteness < 0.7`, on a report nobody has assessed — as either true or false, and both are lies. One fires an automation on data that does not exist; the other never fires while the organisation believes it is covered. `unknown` propagates, an automation whose condition is undecidable **does not fire and records why**, and `undecidable` is a distinct run outcome from `not_matched` so the two are never confused in a log. This is Invariant 8 — *missing ≠ assumed* — applied to machinery that runs when nobody is watching.

**Invariant 7 is a data shape, not a code path.** Every action declares `externallyVisible` and `requiresApproval` in one catalogue, and a test asserts that no externally visible action can be declared as not requiring approval. The engine recomputes approval from the actions rather than trusting the automation's stored flag, so a mistake in a form cannot produce a rule that sends. The executor then checks *again*, independently, because the cost of the single check being wrong is an email a funder receives that nobody sent. `draft_communication` drafts and never sends; nothing in the product can send it.

**Conditions are data, not code.** A typed tree that serialises to jsonb. No expression string, no interpreter, no sandbox to get wrong. That matters because rules are exactly the kind of feature that grows a scripting language by accident, and a tenant-authored scripting language is a different security posture from the one this product has.

**Two design points the brief did not ask for and the work required.**

- **A simulation must report what it could not answer.** Simulating a `changed` trigger against current records is impossible: there is no "before". Reporting "would trigger on 0 records" reads as *this rule is safe* and means *this question was not asked* — opposite conclusions. The simulator returns a caveat instead. Getting this right also required fixing the condition evaluator: an event with no recorded previous value now returns `unknown`, where the first implementation compared `undefined !== "at_risk"` and cheerfully reported a change.
- **`assign_owner` is declared and refused.** Ownership is a different field on six record types, and an executor that guessed would eventually set the wrong one. It throws a named refusal so a rule author finds out at once, rather than being approximated.

**Mutation tests.** Four, all restored.

1. Make a `changed` condition assume a change when no previous value was recorded. **Two tests fail**, including the simulation caveat — which is the whole reason that branch exists.
2. Remove the executor's approval check. **The "refuses even if the dispatcher were bypassed" test fails**, which is the point of having two.
3. Make the engine trust the automation's stored `requiresApproval` flag. **The externally-visible hold test fails.**
4. Remove the scheduler's deduplication. **The idempotence test fails**, which is what makes an in-process scheduler safe to run from a request and a cron entry at once.

**§9 link 12 is closed.** *The relationship owner is reminded 30 days before reporting* has been partial since MG-1: the data a scheduler needs existed, and the scheduler did not. `scanDates` reads horizons from the automations themselves — a scanner with hard-coded horizons either misses a rule or fills the job table with reminders nobody asked for — schedules deduplicated jobs, and `runDueJobs` turns each into a `date.approaching` event dispatched through the same engine a mutation-driven event uses. A reminder whose obligation has since been met is cancelled rather than fired, which is the difference between a reminder system people trust and one they mute.

**SC5's read half, and a real defect it surfaced.** `graph.connectionsFor` unions `relations` with `relationship_links`, so "what connects to this entity?" is one call. Writing it exposed a gap: `Relation` verifies both endpoints on write because a correctly-scoped row can still point at another tenant's record, and **`relationship_links` predates that rule and never had the check**. The two-tenant fixture has had a planted cross-tenant pointer since it was written, and the first version of `connectionsFor` followed it. The projection now applies the same endpoint check, and two tests pin it in both directions. The write path still has two tables; folding those in means migrating the relationships UI, actions and services, which is regression risk with no capability attached and is now a migration rather than a design question.

**What was *not* verified, and why.**

- **Nothing is persisted.** `0023` is written and reviewed SQL, never applied. The dedupe guarantee in particular is enforced by a `unique` constraint that has never run; in-memory it is a `find`, which is the same rule and not the same proof.
- **There is no worker.** The scheduler is in-process and something must tick it, exposed as a button on `/automations` and as a server action a cron entry can call. That is honest rather than pretending a background service exists, and it is the standing consequence of the no-queue decision.
- **No rule builder.** Automations are seeded and can be saved through a server action; there is no form. The condition tree is designed to be built by a UI — flat fields so the set is enumerable, `fieldsUsed` so a rule can be checked against a schema — and that UI is not built.
- **Events are emitted explicitly, not by the data layer.** `emit` is called by callers who should, not from inside `saveSection`. Emitting from the data layer would make it depend on the intelligence layer, which is the wrong direction, and would mean a broken automation could make it impossible to save a grant. The consequence is real: a mutation whose caller does not emit produces no event, and the scheduler only catches the dated cases.
- **MG-4's engines still run on every render.** This phase was supposed to be the performance precondition for that and is not: the attention board is still recomputed per page load. What now exists is the machinery that could cache it — an event stream and a job table — and nothing uses it that way yet.

---

---

### MG-4 — Mission Intelligence

**Objective:** one orchestrator over deterministic tools, replacing four isolated AI entry points.

**Entry:** MG-8 and MG-6, so the tool registry is worth building.

**The governing rule, unchanged from the build spec:** the model calls deterministic Pegasus capabilities; it never recreates their reasoning. "Can we afford to expand Youth Futures?" resolves to `getFinancialPosition()`, `getProgrammeEconomics()`, `getFundingRunway()`, `getForecast()`, `getFundingNeeds()`, and the model explains the results. It does not compute a runway.

**Scope:** tool registry with typed schemas over the existing pure functions; context assembly from authorised claims only; the policy layer (permissions, PII minimisation, injection defence, approval gates); routing across the six intelligence kinds; structured output validated before persistence; execution records capturing feature, prompt version, provider, model, claim IDs used, validation result, fallback state and human review state.

**Security review:** this is the phase where a model gets closest to the graph. Confirm: the tool registry cannot expose a repository method directly; every tool applies the caller's capabilities, not the orchestrator's; untrusted document and transaction text never enters an instruction channel (audit finding S4, still only partly closed).

### Verification record — MG-4 ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean — three pre-existing warnings in `control-plane/supabase.ts`, untouched by this phase |
| `npm test` | **753 passed**, 70 files (was 712 across 69) |
| `npm run test:e2e` | **26/26** in mock mode, including three new Mission Intelligence journeys |
| `npm run build` | succeeds |

**What was built.** A deterministic intelligence layer in `src/lib/intelligence/` — nine single-domain detectors, four cross-domain rules, a brief assembler and ten question handlers, all pure functions over a `MissionSnapshot`. A scoped context assembler in `src/server/intelligence/mission-context.ts`. A service and server actions over both. One page, `/intelligence`, plus a nav entry.

**The ordering deviation, and what it cost.** §2 argued MG-4 should follow MG-8 and MG-6 so the orchestrator has a tool set worth orchestrating. It ran ahead of both, and the cost is real and is visible in the output rather than hidden:

- **The finance detectors have almost nothing to read.** The seeded workspace has two funds and two transactions, so `unrestricted_runway` never fires and `grant_ending_programme_dependency_low_runway` currently fires on its two-leg branch — the grant is the programme's sole funder — rather than on the three-leg branch the brief describes. The rule is written for both and the branch it took is stated in its own `detail` text. When MG-8 supplies a ledger, the third leg starts firing without a code change.
- **There is no scheduler**, so the Morning Brief is a page a person opens rather than something that arrives. §9 link 12 remains MG-6's.
- **There is no tool registry.** What was built instead is narrower and, on reflection, is the right first half: the model is handed *findings*, never callable capabilities. A registry is worth building when there are enough deterministic tools that routing between them is a real decision. There are currently nine detectors and four rules, and they all run every time.

**The design decision most worth recording.** The brief asks for answers separated into FACTS, CALCULATIONS, INFERENCES, ASSUMPTIONS, RECOMMENDATIONS and UNKNOWNS. The first five are `ClaimKind`, which already exists — reusing it means `effectiveClaimKind`'s weakest-link rule still governs, where a parallel enum would have routed around it. **UNKNOWNS are not a kind.** An unknown has no producer, no workings and no confidence; it has a reason, and `UnknownReason` is the eight-value vocabulary §8 of the architecture document said the product must be able to say and could only say six of. `cannot_calculate` and `not_applicable` now exist outside finance for the first time, and the second is specifically the one a zero impersonates: *this organisation holds no unrestricted fund* and *this organisation has nought months of runway* are different statements and no longer render identically.

**Mutation tests.** Four, all required, all restored.

1. Close the ending WYCA grant. **Two composites disappear** — the programme-dependency rule and the major-funder rule both lose their grant leg. If either had survived, it was never a conjunction.
2. Evidence every Digital Bridge outcome. **The report-readiness composite disappears** while the single-domain "report is due" finding survives, which is the assertion that a due report is not on its own the cross-domain finding.
3. Delete the `requires` edges. **`promised_outcome_not_currently_provable` goes silent**, proving it traverses the graph rather than pattern-matching free text. This rule could not have been written before MG-1.
4. Request transaction narratives as a `programme_lead`. **They are withheld and the withholding is recorded**, rather than the request silently succeeding.

**Security review, against §13.** Three findings, all closed in this phase.

- **AI context exposure.** `assembleMissionContext` has no method that fetches everything. A context is a set of named scopes, each gated on a capability, and a scope the acting role cannot read is not fetched at all — it is recorded in `withheld` with the capability that was missing. The smallest unit anything can request is a scope; the largest is the set the caller personally holds.
- **Transaction narratives.** The expansion plan flagged these as MG-8's security item. They are honoured now, at the moment the field first becomes reachable by a model: excluded from grounding by default, and gated on `finance:manage` even when explicitly requested. The deterministic engine still reads them — computing an unallocated total requires the ledger — so the gap between *what the engine reasons over* and *what the model is shown* is where the sensitivity lives, and it is enforced by two different functions rather than by remembering to redact.
- **Untrusted text (S4).** Evidence, programme summaries, fund restriction purposes and priority descriptions all pass through `sanitiseSourceText` before reaching grounding. Where injection is suspected the passage is replaced *and said so in the channel the model reads*, because a silently stripped passage invites the model to fill the gap.

**A routing bug the tests caught, worth keeping.** "What should I worry about this month?" routed to the *what changed* handler, because that handler matched on the word "month". A question about the present was being answered with a change log. Period words no longer route; change words do. The suggestion order and the routing order are now separate lists over the same handlers — routing is ordered by specificity so a broad matcher cannot swallow a narrow question, and suggestion is ordered by usefulness so the acceptance question is offered first.

**What was *not* verified, and why.**

- **No live provider.** Narration is exercised against the deterministic mock. Live-provider conformance to the grounding contract is unverified, which is the standing constraint in §6.
- **Nothing is persisted.** A `MissionBrief` is computed per request and thrown away. The brief specification names `MissionBrief` as reusable and it is reusable as a *type*; there is no `mission_briefs` table, so "show me the brief you gave the board in March" is not answerable. That needs MG-2, and adding a table before the adapter exists would be the fifth deferral of the thing that most needs doing.
- **Every engine still runs on every page render.** This is the performance precondition §MG-6 names, and it is now measurably worse than before because there are thirteen more engines. At demo scale it is 6ms. At tenant scale it is MG-6's problem and it did not get smaller.
- **`RelationshipLink` is still a second edge table.** The context assembler unions it with `evidences` relations so that no detector has to know, which is the right containment but is not the fix. Still scheduled with MG-6.

---

### MG-3 — Onboarding intelligence

**Objective:** onboarding ends in value, and the value persists.

**Entry:** MG-2. Benefits from MG-4 and MG-8.

**Scope:** Organisation Intelligence Phase 2 — a real crawler behind the existing `PageFetcher` port with robots.txt compliance, rate limiting and link discovery at depth. The extraction core, sanitisation, reconciliation, authority model and approval logic already exist and are tested; they are reused, not rewritten. The 228-line `OnboardingFlow.tsx` facade is replaced; its visual shell is well-built and is kept.

**The rule for the completion screen:** every number on it is a claim. *Could not be established* is reported as its own state, and the `not_publicly_found ≠ missing` distinction must not collapse into a blank when it reaches the UI.

### Verification record — MG-3 ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **710 passed**, 69 files (was 633 across 67) |
| `npm run test:e2e` | 23/23 journeys and marketing pass in mock mode |
| `npm run build` | succeeds; `/onboarding`, `/onboarding/review`, `/onboarding/audit` all render |

**Mutation tests.** Two, both restored afterwards.

1. Bypass the review boundary in `onboarding.decide` and auto-approve every candidate. **4 named tests fail**, all in `human review is the boundary`.
2. Let `candidateToClaim` mint `verified` instead of `ai_extracted`. **3 tests fail**, one of them by `createClaim` throwing `ClaimPromotionError` — the Slice B structural guard catching the MG-3 code path without being told about it.

**What was built.** `OrganisationDiscoveryService`, `DocumentDiscoveryService`, `OrganisationResearchService` and `OnboardingContextBuilder`, as the brief names them. A `PolitePageFetcher` that obeys robots.txt, paces itself, caps response size and refuses off-origin redirects. A `RegistryLookup` port with Charity Commission and Companies House implementations, looked up **by number** rather than by name. A zero-dependency document parser (`src/lib/documents`) covering PDF, DOCX, XLSX, CSV and TXT. `Document` / `DocumentVersion` / `DocumentSource` / `ExtractedClaim` in the model and in migration `0021`. Persistence for runs, sources, candidates and decisions. The six-group review screen, the nine-section audit, and grounded recommendations.

**Two decisions worth flagging.**

- **Document parsing is hand-written rather than a dependency.** A charity's annual report is exactly the kind of file that should not be handed to a third-party library, and the parsing libraries for these formats are large. The cost is that a hand-written binary parser fails by returning *plausible rubbish* rather than by throwing, so `assessTextQuality` gates every result: a file whose recovered text is mostly unreadable, or has fewer than twenty words, is recorded `unreadable` with a reason rather than passed to extraction. No optical character recognition, no encrypted PDFs, no image-only scans, all stated to the user.
- **All extraction is still deterministic.** No model is called anywhere in MG-3. Label-driven extraction produces fewer candidates than a model would, and every one of them can be checked against a locator. The provenance contract should hold for extraction whose reasoning can be verified before it is extended to extraction whose reasoning cannot.

**What was *not* verified, and why.**

- **Nothing has been applied to a database.** Migration `0021` is reviewed SQL, like `0017`-`0020` before it. The constraints that hold the review boundary at the database level are asserted by grepping the SQL, not by executing it.
- **The live registry implementations have never run against a live register.** They are typed against the published API shapes and exercised against a fixture port. The first real call will surface field-name variance.
- **The crawler has never crawled a real site.** `PolitePageFetcher` is unit-tested for robots.txt parsing only; its pacing, redirect and size behaviour is reviewed code.
- **No e2e covers a research run**, deliberately: it would make outbound calls to a real website and a real register. The pipeline is covered hermetically against fixtures instead.
- **Findings do not survive a restart.** They are held in the in-memory store. This is the MG-2 dependency the original sequencing existed to avoid, and it is the main cost of running MG-3 first.

---

### MG-7 · MG-9 · MG-10 · MG-11 — the breadth tier

Deliberately specified at lower resolution. Detailed design now would be speculation, and the build spec's judgement that these are legitimate but are not the bottleneck is correct.

Each must answer the §10 question before it is scheduled: **how does this strengthen the Mission Graph?**

| Phase | The graph answer it must give |
|---|---|
| **MG-7 Forms** | A submission is not a form record. It is evidence, a claim about a beneficiary cohort, an indicator measurement and a relationship interaction. If a submission does not become a claim, the phase has built a form builder. |

### Verification record — MG-7 ✅

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean — four pre-existing warnings in Control Plane files |
| `npm test` | **890 passed**, 73 files (was 848 across 72) |
| `npm run test:e2e` | **33/33** journeys and marketing. The two Control Plane failures recorded under MG-5 are unchanged and still pre-existing |
| `npm run build` | succeeds |

**Did it build a form builder?** No, and the test above is the one that decides it. `form_mappings` says what each answer becomes; `projectSubmission` proposes; `applyProjection` acts only on what a reviewer accepted. The acceptance test walks six survey responses through to an interaction, an evidence item, a person record and two indicator measurements, and asserts each of them exists afterwards.

**The design decision that changed the shape of the phase: one response is not a measurement.** The obvious implementation writes a survey answer onto `Indicator.currentValue`, which makes the progression rate whatever the most recent respondent said and lets the next response overwrite it. A measurement derived from a survey is an **aggregate over accepted responses, carrying its denominator**. That is why indicator mappings are handled separately from every other target: they are inherently cross-submission and a per-submission projection cannot see the others. Below five responses no percentage is produced at all — the count is reported instead, because publishing "75% progression" from three people is the most common way a survey becomes a misleading impact claim.

**On beneficiaries, and what was deliberately not built.** §8 records the absence of a beneficiary entity as a decision, and §MG-12 names this phase as the one most likely to reverse it by accident. Beneficiary intake is in the brief's own list of purposes.

What ships: the ability to *collect* intake answers, with a required sensitivity classification on every field, an enforced lawful basis, an enforced retention period, an AI exclusion and a separate capability to read them. What does not ship: any `beneficiaries` table, and any projection from a `special_category` answer into anything at all — not a person, not a claim, not an interaction summary. Those answers stay in `submission_answers` and are erased on schedule. **The seeded demo collects none**, because shipping seeded health or ethnicity data to demonstrate a control would be a strange way to demonstrate restraint; the refusals are proven in tests instead.

**Sensitivity is a field property with no default.** Not nullable, no fallback. Classifying an answer after it exists is already too late: it has been unclassified for however long it sat there, and everything that read it in the meantime read it unclassified. The classification decides three things — whether the answer can ever reach a model, whether the form needs a retention period to be publishable, and which capability reads it.

**Reuse, deliberately.** Form conditional logic is the MG-6 condition language over a bag of answers, not a second one. MG-6's own first instruction was not to build module-specific automation systems, and a form conditional language is exactly that in disguise. The reuse also pays: three-valued evaluation means a condition on a field the respondent has not reached is `unknown`, and unknown **hides** the field rather than showing it — a form that flickered open as somebody scrolled would be the alternative.

**The one unauthenticated surface, and how it is bounded.** A public form has no session; a slug is what identifies the organisation, so resolving it is necessarily unscoped. Rather than weaken `MissionRepository`, that exception is a separate `PublicFormRepository` with three methods that can only see published, open, `public` forms, can read only that form's fields, and can reach no other table. The two public server actions live in their own file so the data-boundary test's `@public-action` exemption covers exactly them, rather than silently covering the six authorised actions beside them. A public submission always lands `awaiting_review`, so it changes nothing until a person decides what it becomes.

**Mutation tests.** Four, all restored.

1. Make `mayReachModel` return true for everything. **Two tests fail** — the AI exclusion is the control MG-12 conditioned this phase on.
2. Remove the projection's sensitivity ceiling. **Two tests fail**: special category data would project into the knowledge layer, which report generation and AI grounding both read.
3. Stop an overwrite forcing review. **The silent-overwrite test fails.** *Never mutate trusted data silently* is the brief's phrase; a form answer is an assertion, not a correction.
4. Remove the minimum-responses floor on percentages. **Two tests fail**, including the acceptance test's companion.

**Security review, against §13.**

- **AI context exposure.** `partitionForModel` returns both halves. A context quietly containing one of three answers invites a model to reason as though it saw everything, so the withheld count travels with the visible set.
- **Field-level sensitivity.** Implemented, required, and enforced at three separate points: publication, projection and read.
- **Retention and deletion.** `redactExpired` blanks the answers and keeps the submission. "Somebody submitted this and the answers were deleted under our retention policy" is a true and useful statement; deleting the row would make the erasure itself unprovable.
- **Consent.** Recorded verbatim from the version answered, so the wording somebody agreed to can always be recovered. Withdrawal is recorded and never deletes the grant — it was granted, and then withdrawn, and rewriting the first loses the second.
- **Untrusted input.** Tenant-supplied validation patterns are length-bounded and anchored, so a pattern cannot be a denial of service and cannot pass a substring the designer meant to reject. An answer to a hidden field is refused rather than stored.
- **Spam.** A honeypot, a timing check and content heuristics, scored rather than absolute, and a suspected submission is stored and flagged rather than discarded. No CAPTCHA: sending every respondent's browser fingerprint to a provider the organisation did not choose is a bad trade on a beneficiary-facing form. **A false positive is worse than a false negative** here — a missed spam costs somebody thirty seconds, a rejected genuine submission from a person who needed help is a failure nobody finds out about.

**What was *not* verified, and why.**

- **Nothing is persisted.** `0024` is written and reviewed SQL, never applied. In particular the `forms_public_needs_slug` and consent-purpose constraints are enforced twice in the application and once in SQL that has never run.
- **No form builder UI.** Forms are seeded and can be saved through a repository method; there is no editor. The field model is designed for one — enumerable types, declarative validation, a condition tree — and it is not built.
- **No public form page.** The `PublicFormRepository` and `submitPublicForm` exist and are tested; there is no `/f/[slug]` route rendering them. That is a screen rather than a design question.
- **No attachments.** `SubmissionAttachment` is modelled and no upload path exists, because file storage is MG-2's Supabase Storage and there is nowhere to put bytes.
- **`external_organisation` and `relationship` mappings refuse.** Both need matching against existing records, which is a decision rather than a projection. Declared and refused clearly, as `assign_owner` is in MG-6.
- **Retention runs when somebody presses a button.** Same standing consequence as MG-6's scheduler: no worker exists, and pretending otherwise would mean a retention policy that quietly never runs.

---

| **MG-10 Fundraising** | A donation touches supporter, fund, finance, programme, campaign, reporting, impact and stewardship. If it lives in a fundraising table, §11 of the brief has been violated. Requires MG-1 SC2 and MG-8. |
| **MG-9 Portals** | External parties reading tenant data is the highest-risk surface in the product. It requires MG-12 to have run first, plus field-level sensitivity, and a separate identity model of the kind the Control Plane already demonstrates. |
| **MG-11 Integrations** | Provider independence (§12). Stripe, Xero, Gmail, Mailchimp, GoCardless and banking providers sit behind ports. No provider identifier ever enters a core entity. The `server/communications/provider.ts` boundary is the precedent. |

---

### MG-12 — Production hardening

Continuous, not final. It gates each phase above rather than following them.

Per the brief's §13, reviewed before each phase and recorded: tenant isolation · RLS · authentication · authorisation · field-level sensitivity · audit · retention · deletion · consent · data export · data minimisation · encryption · provider credentials · **AI context exposure**.

Two items deserve standing attention because the expansion increases them most:

- **AI context exposure.** Every phase adds data a model might see. The default is exclusion; inclusion is a decision recorded in the context builder, not an accident of a `select *`.
- **Beneficiary and case data.** Currently absent by design ([`MISSION_GRAPH_ARCHITECTURE.md`](./MISSION_GRAPH_ARCHITECTURE.md) §8). It must not arrive as a side effect of MG-7 or MG-9. If it is introduced, sensitivity, retention, deletion and redaction are designed in the same change, never after.

---

## 5. What stays parked

Unchanged from build spec §4, minus the items now scheduled as MG-7, MG-9, MG-10 and MG-11: mass email, WhatsApp, events management, full governance, sophisticated calendars, the visual relationship network, formal SROI, and internationalisation.

Internationalisation is worth one note: currency is already data rather than a constant in the finance model (`CurrencyCode` on every `Money`), so MG-8 must not undo that by hardcoding GBP in a UI formatter. Parking i18n is not permission to re-introduce the assumption.

---

## 6. Standing constraints

| Constraint | Effect | Owner |
|---|---|---|
| **No provisioned Supabase project** | MG-2 cannot complete. RLS remains unexecuted code and defence in depth remains one layer. **This is the critical path for the entire programme.** | User |
| `AI_PROVIDER=mock` by default | Structured-output validation is tested against the mock provider. Live-provider schema conformance is unverified. | User |
| No live ledger data | MG-8 classification is exercised against fixtures. Real bank exports will surface format variance. | MG-8 |
| `docs/ROADMAP.md` is stale | It predates slices A–D and still lists the Supabase data layer as priority 1 alongside items long since built. Rewrite it or delete it; a stale roadmap in a repository with five current planning documents is a liability. | MG-1 |
