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
| **MG-4** Mission Intelligence | Slice F | Not started | Value depends on MG-8, MG-6 |
| **MG-5** Reporting Engine | Slice D | 🟡 ~70% | MG-2 for persistence |
| **MG-6** Mission Automations | Slice G + automation beyond attention | Not started | MG-2 |
| **MG-7** Mission Forms | Parked in build spec | Not started | MG-1 (submissions must land as claims) |
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

- **Nothing had been applied to a database at the time of the phase.** Closed on 2026-08-20: migrations `0017`–`0021` were applied to the live project and verified. RLS blocks anonymous callers on all 16 new tables, and eight check constraints were probed and all enforce.
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

---

### MG-4 — Mission Intelligence

**Objective:** one orchestrator over deterministic tools, replacing four isolated AI entry points.

**Entry:** MG-8 and MG-6, so the tool registry is worth building.

**The governing rule, unchanged from the build spec:** the model calls deterministic Pegasus capabilities; it never recreates their reasoning. "Can we afford to expand Youth Futures?" resolves to `getFinancialPosition()`, `getProgrammeEconomics()`, `getFundingRunway()`, `getForecast()`, `getFundingNeeds()`, and the model explains the results. It does not compute a runway.

**Scope:** tool registry with typed schemas over the existing pure functions; context assembly from authorised claims only; the policy layer (permissions, PII minimisation, injection defence, approval gates); routing across the six intelligence kinds; structured output validated before persistence; execution records capturing feature, prompt version, provider, model, claim IDs used, validation result, fallback state and human review state.

**Security review:** this is the phase where a model gets closest to the graph. Confirm: the tool registry cannot expose a repository method directly; every tool applies the caller's capabilities, not the orchestrator's; untrusted document and transaction text never enters an instruction channel (audit finding S4, still only partly closed).

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

- **Nothing had been applied to a database at the time of the phase.** Closed on 2026-08-20. The constraint that holds the review boundary was then probed against the live database directly: `verified` and `provided` are both rejected on `profile_candidates`, and only `ai_extracted` is accepted.
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
| ~~No provisioned Supabase project~~ | **Resolved 2026-08-20.** A project exists, migrations `0001`–`0021` are applied, and RLS and check constraints are verified as executing against it. MG-2's remaining work is the adapter itself. | Resolved |
| **No direct Postgres credential in the environment** | `.env` holds the service role key, which reaches PostgREST but not `psql`. DDL therefore goes through the dashboard by hand. Fine for occasional migrations; it will not scale to a deploy pipeline. | User |
| **Cross-tenant RLS unproven** | Anonymous access is blocked and verified. The stronger claim, that an authenticated member of tenant A cannot read tenant B, needs two real auth users and lands with MG-2. | MG-2 |
| `AI_PROVIDER=mock` by default | Structured-output validation is tested against the mock provider. Live-provider schema conformance is unverified. | User |
| No live ledger data | MG-8 classification is exercised against fixtures. Real bank exports will surface format variance. | MG-8 |
| `docs/ROADMAP.md` is stale | It predates slices A–D and still lists the Supabase data layer as priority 1 alongside items long since built. Rewrite it or delete it; a stale roadmap in a repository with five current planning documents is a liability. | MG-1 |
