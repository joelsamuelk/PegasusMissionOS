# Mission OS — Mission Graph Architecture

**Status:** Living document. The semantic architecture of Mission OS.
**Sequencing authority:** [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md). This document does not reorder the build; it names what the build is converging on. Expansion sequencing lives in [`MISSION_OS_EXPANSION_PLAN.md`](./MISSION_OS_EXPANSION_PLAN.md).
**Companions:** [`PEGASUS_TARGET_ARCHITECTURE.md`](./PEGASUS_TARGET_ARCHITECTURE.md) §4, [`PEGASUS_ARCHITECTURE_AUDIT.md`](./PEGASUS_ARCHITECTURE_AUDIT.md), [`FINANCE_INTELLIGENCE.md`](./FINANCE_INTELLIGENCE.md), [`RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md`](./RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md), [`ORGANISATION_INTELLIGENCE.md`](./ORGANISATION_INTELLIGENCE.md), [`MISSION_OS_CAPABILITY_MAP.md`](./MISSION_OS_CAPABILITY_MAP.md)

> The Mission Graph is not a database choice. It is the claim that one connected domain model, carrying evidence, trust and provenance on every edge worth trusting, answers questions that twenty well-built modules cannot.

---

## 0. Verified starting point

Recorded because an architecture document that describes intentions rather than the working tree is worthless.

| Gate | Before MG-1 | After MG-1 and MG-3 |
|---|---|---|
| `npm run typecheck` | clean | clean |
| `npm run lint` | **2 errors** (pre-existing) | clean |
| `npm test` | 581 passed, 66 files | **710 passed**, 69 files |
| `npm run test:e2e` | 9/26 (config, not regression) | **23/23** in mock mode |
| `npm run build` | succeeds | succeeds |
| Domain model | `src/types/domain.ts`, 1,257 lines | 1,257 → ~1,700 lines |
| Data boundary | 11 repositories, all async, all tenant-scoped | **15** repositories |
| Adapters | `in-memory` only | `in-memory` only. **Still no Supabase adapter for the customer product.** |
| Migrations | 16 files | 21 files. 9 tenant-facing (`0001`–`0004`, `0017`–`0021`), 12 Control Plane. |
| Tenant tables | 56, RLS enabled in reviewed SQL. Finance tables: **0**. | **72**. Finance tables: **5**. Document and onboarding tables: **8**. |

MG-1 is complete and is schema, repository and tests only: **no page reads any of it yet**, by design.

The single most consequential fact below is unchanged by that work: `getRepository()` in [`src/server/data/index.ts`](../src/server/data/index.ts) returns the in-memory adapter unconditionally. Authentication resolves a genuine Supabase session and membership ([`src/server/context/supabase-context.ts`](../src/server/context/supabase-context.ts)), and then that authenticated context reads seeded demonstration data. Every statement about tenant isolation in this document is a statement about application-layer scoping, proven by a two-tenant test suite, and **not yet** about Postgres row level security, which no code has ever exercised. Migrations `0017`–`0020` are written and reviewed; they have never been applied to a database.

---

## 1. Why a graph, and why not a graph database

Postgres remains the system of record. This was settled in [`PEGASUS_TARGET_ARCHITECTURE.md`](./PEGASUS_TARGET_ARCHITECTURE.md) §4 and nothing found in this inspection disturbs it. The traversals the product needs are shallow — the longest, the results chain in §5 below, is seven hops — and expressible as indexed joins and recursive CTEs. A second store would fragment the trust boundary, which is the one thing Mission OS cannot afford to fragment.

"Mission Graph" therefore describes **how the relational model is shaped**, and imposes three obligations that ordinary relational modelling does not:

1. **Every entity worth citing is addressable.** `EntityReference { type, id }` is a single pointer type usable from anywhere. It already exists and is used by claims, groundings, interactions, commitments, relationship links and finance statements.
2. **Cross-domain edges are first-class records, not implied by a foreign key.** An edge that carries meaning — *this output contributes to that outcome*, *this evidence supports that measurement* — must be able to carry attestation, a role and a provenance of its own.
3. **No module owns a concept.** A donation is not a fundraising record. It is money, a relationship event, a fund movement, a programme input and a reportable fact, and it must be reachable from all five.

---

## 2. Node catalogue

The concepts named in the expansion brief, against the working tree. `EntityType` in [`src/types/domain.ts`](../src/types/domain.ts) is the registry — it already reserves several kinds deliberately, so that an edge recorded today does not need a migration when the entity on the other end arrives.

Legend: **●** implemented and persisted · **◐** modelled but incomplete · **○** reserved in `EntityType`, no implementation · **—** absent entirely

### Organisation and strategy

| Concept | State | Where |
|---|---|---|
| Organisation | ● | `Organisation`, `organisations` |
| Organisation profile | ● | `OrganisationProfile`, 21 `Attested<T>` fields |
| Membership and role | ● | `OrganisationMember`, 7 roles, `organisation_members` |
| Internal user | ● | `User`, `users` |
| **Strategy / strategic priority** | ● | `StrategicPriority`, `strategic_priorities` (`0020`). Owns programmes through `pursues` relations. The profile field is retained as the `Attested<T>` projection so the migration is priority-by-priority. |
| Theory of change | — | |

### Relationships

| Concept | State | Where |
|---|---|---|
| External organisation | ● | `ExternalOrganisation`, `external_organisations` |
| Person | ● | `Person` with `ContactPoint[]`, consent, communication preferences |
| Relationship | ● | `Relationship` with open `roles[]` taxonomy, `relationships` + `relationship_roles` |
| Interaction | ● | `Interaction`, `interactions` + participants + links |
| Commitment | ● | `Commitment`, `commitments` |
| Relationship → graph edge | ● | `RelationshipLink`, `relationship_links` |
| Supporter / funder / partner / volunteer | ● | Contextual **roles** on a relationship, never separate tables. This is correct and must survive expansion. |
| Beneficiary | — | Deliberately absent. See §8. |

### Funding and grants

| Concept | State | Where |
|---|---|---|
| Funder | ● | `Funder`, bridged to `ExternalOrganisation` via `externalOrganisationId` |
| Funding opportunity | ● | `FundingOpportunity`, eligibility criteria, questions |
| Fit assessment | ● | `FitAssessment` + 8 weighted factors, deterministic (`lib/logic/fit.ts`) |
| Application | ● | `Application`, answers, versions, reviews |
| Grant | ● | `Grant`, payments, deliverables, reports, conditions |
| **Fund** | ● | `Fund`, `funds` (`0018`). `restriction` distinguishes funder-imposed from trustee-designated, which is a legal distinction rather than a cosmetic one. |
| **Funder reporting requirement** | ● | `ReportingRequirement`, `reporting_requirements` (`0019`), pointing at outcomes and indicators through `requires` relations. The free-text fields are retained and deprecated. |

### Money

| Concept | State | Where |
|---|---|---|
| Transaction | ● | `FinancialTransaction`, promoted to `types/domain.ts` and persisted in `financial_transactions` (`0018`). |
| Financial allocation | ● | `financial_allocations` (`0018`). `allocation_method` is `not null` at the schema level: there is no way to record an attribution without saying how it was made. |
| Budget / budget line | ● | `budgets`, `budget_lines` (`0018`). |
| Calculation engine | ● | 4,809 lines across 19 modules, unit-tested: runway, cliffs, concentration, forecast, cost rollup, unit economics, subsidy, funding need, need matching, recommendations. |
| **Consumers of that engine** | ◐ | The data boundary now carries its inputs (`FinanceRepository`). **No route or server action reaches it yet** — that is MG-8. |
| Donation | ○ | Reserved. Not implemented. |

### Delivery and impact

| Concept | State | Where |
|---|---|---|
| Programme | ● | `Programme`, `programmes` |
| Activity | ● | `Activity` entity; `activities` extended in `0017`. The string array is deprecated in place. |
| Output | ● | `Output` entity; `outputs` extended in `0017`. |
| Outcome | ● | `Outcome` with `level: output \| outcome \| impact`, keyed to `programmeId` |
| Indicator | ● | `Indicator` with baseline, target, current, confidence |
| Measurement | ● | `IndicatorMeasurement`. Now actually stored: `updateIndicator` appends a reading rather than only overwriting `currentValue`, so a trend exists and a published report can still resolve what it cited. |
| **Results chain** | ● | `Relation { kind: "contributes_to" }`, weighted where a contribution is partial. See §5. |

### Knowledge, evidence and reporting

| Concept | State | Where |
|---|---|---|
| Claim | ● | `Claim` — immutable, superseding, with sources, producer, workings, assumptions, caveats, conflicts. `claims` + `claim_sources` + `claim_supports` + `claim_usages` + `claim_conflicts`. |
| Claim usage (reverse index) | ● | `ClaimUsage`. "Where did this figure come from?" and "what breaks if it is wrong?" are one query in two directions. |
| Evidence item | ● | `EvidenceItem`, 11 types |
| Evidence link | ● | `Relation { kind: "evidences" }` reaches any addressable entity, including an indicator and a measurement. `EvidenceLink` is retained for shipped call sites and deprecated. |
| Evidence strength | ● | Deterministic, from count, recency, verification state and independence (`lib/knowledge/evidence-strength.ts`). Never a model. |
| Report | ● | Generic `Report`/`ImpactReport`, 12 types, 9-state lifecycle, typed sections, claim-pinned figures, deterministic readiness, neutral export payload |
| Document | ● | `Document`, `DocumentVersion`, `DocumentSource`, `ExtractedClaim` (`0021`). Parsed for PDF, DOCX, XLSX, CSV and TXT with no third-party dependency |
| Extracted claim | ● | `ExtractedClaim`. Deliberately distinct from `Claim`: one is what a machine thinks a document says, the other is what the organisation asserts. `claimId` being null is the boundary |
| Onboarding run | ● | `OnboardingRun` (`0021`). Persisted so research is not repeated against someone else's website |

### Work, events and automation

| Concept | State | Where |
|---|---|---|
| Task | ● | `Task` |
| Comment / notification / activity | ● | `Comment`, `Notification`, `ActivityEvent` |
| Audit | ● | `AuditEvent`, append-only RLS |
| AI generation record | ● | `AIGeneration` + `GroundingRecord` |
| **Domain event** | — | No dispatcher, no job table, no scheduler. Attention signals are recomputed per render. |
| **Automation (event → condition → action)** | — | Designed in target architecture §9. Not built. |
| **Form / submission** | — | Parked in the build spec. |
| **Portal** | — | Parked. |

---

## 3. Edge model

Two kinds of edge, and the rule for choosing.

**Typed foreign keys** carry strong, high-traffic, single-meaning edges: `indicator.outcome_id`, `grant.application_id`, `application.opportunity_id`. They keep referential integrity and query performance, and there is no reason to generalise them.

**The `Relation` primitive** carries the many-to-many, cross-domain, semantically varied edges — the ones that would otherwise become a sprawl of one-purpose join tables, each needing its own migration, its own repository method and its own traversal code.

```ts
interface Relation {
  id: UUID;
  organisationId: UUID;
  from: EntityReference;
  to: EntityReference;
  kind: RelationKind;      // contributes_to | evidences | funds | measures |
                           // requires | allocated_to | derived_from | supersedes
  attested?: Attested<null>;
  audit: AuditStamp;
}
```

**Current state:** implemented in MG-1 — `Relation` in [`src/types/domain.ts`](../src/types/domain.ts), `relations` in migration `0017`, and `GraphRepository` at the data boundary. `RelationKind` is an open taxonomy for the same reason `RelationshipRole` is: a tenant-specific edge should not require a migration. Known kinds carry structural meaning and are the only ones traversal follows, so an unrecognised kind records a connection without asserting one.

`RelationshipLink` predates it and still has its own table. It is a `Relation` whose `from` is always a relationship:

```ts
interface RelationshipLink {
  relationshipId: UUID;      // the constrained `from`
  entity: EntityReference;   // the general `to`
  role?: RelationshipRole;   // the constrained `kind`
}
```

It was the right first move — it proved the shape against a real feature — and it was deliberately **not migrated** in MG-1. Folding it into `relations` means touching the relationships UI, actions and services, which MG-1 excluded by scope. The cost of leaving it is real and should not be forgotten: "what connects to this entity?" currently unions two tables. Folding it in belongs with MG-6, when the attention system reads across both.

**One limitation belongs in the model rather than in a review comment.** `from_id` and `to_id` cannot be foreign keys, because they are polymorphic. RLS therefore confines the *row* to the tenant but cannot confine what the row points at. The endpoint check lives in the repository (`entityExists`), is asserted in the shared contract suite so a second adapter cannot omit it, and is recorded in `0017` as a known limitation of the design rather than assumed away.

A caution that belongs in the model rather than in review comments: a general edge table invites recording everything as an edge. It should not. If an edge is single-meaning, always present and queried on every page load, it is a foreign key. `Relation` is for edges whose *existence is itself information*.

---

## 4. The three cross-cutting planes

Evidence, trust and provenance are not three columns. They are three questions, and the codebase already answers each in one place. The expansion must reuse these, never parallel them.

### Provenance — where did it come from?

```text
ClaimSource { ref, authority, locator, retrievedAt }
ClaimProducer = human | extraction | calculation | model
GroundingRecord { used[], unused[], model, promptVersion, usedFallback, ... }
```

`SourceAuthority` is ordinal — `regulator > organisation > supporting > discovery` — because reconciliation is impossible without being able to say that audited accounts outrank a webpage.

`GroundingRecord` replaced `AIProvenance`, which listed everything *offered* to a model as though it had been *used*. That was a defect in a type, not in a function: five arrays of bare strings gave a returned source nothing to be validated against. Now a generation returns references, and one that was never offered raises `GroundingViolationError` and the output is discarded.

### Trust — how confident are we?

```text
VerificationState  verified | provided | ai_extracted | needs_review | outdated
confidence         0..1, the producer's certainty
```

These are orthogonal and must stay so. **Confidence never promotes verification.** This is structural rather than conventional: `createClaim` runs `assertProducerMayAssign`, so an extractor or a model cannot construct a verified claim (`lib/knowledge/verify.ts`).

`Attested<T>` is the read projection of a claim. Where `claimId` is set the claim is authoritative and the inline value is a denormalised copy; where it is absent the inline value is all there is. That fallback is what lets the profile fields migrate onto claims one at a time.

### Evidence — what supports this?

Evidence strength is computed deterministically from count, recency, verification state and independence of supporting items. A model is never asked whether evidence is strong.

**The gap:** the evidence plane reaches programmes, grants, outcomes, answers and reports. It does not reach indicators or measurements — the two places where a number actually enters the product. Structural change **SC3**.

---

## 5. The architectural acceptance test

The brief's §9 chain, walked link by link against the working tree. This is the test that decides whether more UI is warranted.

> A donor gives £25,000 restricted to Programme A. That money enters Fund X. Programme A uses £4,000 of it for Activity Y. Activity Y contributes to Output Z. Output Z contributes to Outcome Q. Outcome Q is measured through Indicator R. Evidence E supports the measurement. Funder F requires Outcome Q in its report. The report cites Evidence E and the financial utilisation of the grant. The relationship owner is reminded 30 days before reporting.

| # | Link | Before MG-1 | After MG-1 | Where |
|---|---|---|---|---|
| 1 | Donor gives £25,000 | ◐ | ◐ | The donor is representable — `Person`/`ExternalOrganisation` with a `donor` role. **The gift still is not**: `donation` remains reserved and unimplemented, and `Grant` requires a `funderId`. Institutional awards work; individual gifts wait for MG-10. |
| 2 | Restricted to Programme A | ◐ | ● | `Fund.restrictionPurpose` states what the money is restricted *to*, and the schema refuses a restricted fund without one (`funds_restricted_needs_purpose`). |
| 3 | Money enters Fund X | ✗ | ● | `Fund`, with `restriction` distinguishing restricted from trustee-designated. |
| 4 | Programme A uses £4,000 for Activity Y | ✗ | ● | `FinancialTransaction` → `FinancialAllocation` → `Activity`. The allocation cannot be recorded without its method (`allocation_method not null`). |
| 5 | Activity Y → Output Z | ✗ | ● | `Activity` and `Output` are entities; the edge is `Relation { kind: "contributes_to" }`. |
| 6 | Output Z → Outcome Q | ✗ | ● | Same edge kind, and it carries a `weight` so a partial contribution is not silently reported as the whole. |
| 7 | Outcome Q → Indicator R → measurement | ● | ● | Unchanged foreign keys, plus `measurements()` — `updateIndicator` now appends a reading instead of only overwriting `currentValue`. |
| 8 | Evidence E supports the measurement | ✗ | ● | `Relation { kind: "evidences" }` reaches `indicator_measurement`. `EvidenceLink` is retained for shipped call sites and deprecated in favour of this. |
| 9 | Funder F requires Outcome Q | ✗ | ● | `ReportingRequirement` with `requires` edges into outcomes and indicators. "What did we promise this funder?" is a traversal. |
| 10 | Report cites Evidence E | ● | ● | `ImpactReportSection.claimIds` pins immutable claims; `claim_usages` is the reverse index. |
| 11 | Report cites financial utilisation | ✗ | ● | `allocationsFor({ type: "grant" })` sums allocations that each name their transaction, rather than reading the unverifiable `Grant.spentToDate` scalar. |
| 12 | Owner reminded 30 days before | ◐ | ◐ | The data a scheduler needs now exists: a dated obligation (`ReportingRequirement.dueDate`) with an accountable owner. **The scheduler does not** — no dispatcher, no job table. MG-6. |

### Verdict

**Ten of twelve links hold. Two remain partial, and both are scheduled rather than unresolved:** individual donations are MG-10, and the reminder engine is MG-6. Neither is a modelling gap; both are capabilities not yet built on a model that can now carry them.

The chain is asserted end to end in [`tests/unit/mission-graph.test.ts`](../tests/unit/mission-graph.test.ts), link by link, against the seeded demo workspace rather than against purpose-built fixtures — a chain that only holds for data invented to make it hold has not been demonstrated.

### What MG-1 changed, and what it deliberately did not

Two failure clusters accounted for all seven broken links, and both are closed:

- **The results chain was a vocabulary, not a graph.** `Activity` and `Output` are now entities with `contributes_to` edges. The `activities` and `outputs` tables had existed since migration `0001` with no consumer while the TypeScript model carried string arrays; this was the model catching up with the schema more than it was new design.
- **Money had no entities.** `Fund`, `FinancialTransaction`, `FinancialAllocation`, `Budget` and `BudgetLine` now exist. **No arithmetic in `lib/finance-intelligence` changed** — 4,809 lines of tested calculation gained inputs, not a rewrite.

Deliberately not done, because MG-1 was scoped to schema, repository and tests:

- **No UI.** Not one page reads any of this yet. That is MG-5 and MG-8.
- **No Supabase adapter.** Migrations `0017`–`0020` are written and reviewed; they have never been applied. Everything above is proven against the in-memory adapter only.
- **No backfill.** `Programme.activities` / `outputs` / `deliveryPartners` string arrays are deprecated in place, not removed, following the `Funder.contactName` precedent.

---

## 6. Required structural changes, ordered

Derived from §5. Each is scoped to a schema and a boundary, not to a screen.

| # | Change | Closes | Migration | State |
|---|---|---|---|---|
| **SC1** | **Results chain.** Promote `Activity` and `Output` to entities in the TypeScript model to match the tables that already exist. Add `contributes_to` edges Activity → Output → Outcome, and Outcome → Outcome for nested levels. Retire `Programme.activities: string[]` and `Programme.outputs: string[]` behind the same deprecation pattern used for `Funder.contactName`. | 5, 6 | `0017` | ✅ **Done (MG-1)** |
| **SC2** | **Money entities.** `Fund`, `FinancialTransaction`, `FinancialAllocation`, `Budget`, `BudgetLine` tables, repository and writers. The 4,809-line calculation engine is reused unchanged — this slice gives it inputs, it does not redesign it. Money stays integer minor units with an explicit currency. | 3, 4, 11 | `0018` | ✅ **Done (MG-1)** |
| **SC3** | **Evidence reach.** Extend the evidence plane to `indicator` and `indicator_measurement`. Preferably by expressing evidence links as `Relation { kind: "evidences" }` rather than widening a bespoke enum a second time. | 8 | `0019` | ✅ **Done (MG-1)** |
| **SC4** | **Reporting requirement entity.** A `ReportingRequirement` owned by a grant or opportunity, pointing at the outcomes, indicators and evidence types the funder asked for. This is what turns "what did we promise this funder?" into a traversal and report readiness into a real answer. | 9 | `0019` | ✅ **Done (MG-1)** |
| **SC5** | **Generalise `Relation`.** Without this, SC1, SC3 and SC4 each invent their own join table. | edges for 5, 6, 8, 9 | `0017` | 🟡 **Primitive done (MG-1).** `RelationshipLink` is **not** migrated onto it — that touches the relationships UI, which MG-1 excluded. Two edge tables remain; see §3. |
| **SC6** | **Strategy entity.** `StrategicPriority` as a node owning programmes and funding needs, replacing the `Attested<string[]>` profile field. Completes the target architecture's longest traversal. | product north star | `0020` | ✅ **Done (MG-1)** |
| **SC7** | **Domain events and scheduling.** In-process dispatcher plus a Postgres job table. No queue infrastructure. Emission on state transition in the data layer, consumption by a rules engine. This is build spec Slice G and is unchanged by this document. | 12 | `0021` | ⏳ MG-6 |
| **SC8** | **Supabase adapter for the customer product.** | everything's proof | — | ⏳ **MG-2 — the critical path** |

SC1–SC6 landed together in MG-1 as migrations `0017`–`0020`, with `Relation` first so that the other four did not each invent a join table. Neither SC7 nor SC8 is started.

### The ordering tension, stated plainly

The build spec's rule is *schema-shaping work happens before the storage adapter is written*, and it is a good rule: writing the adapter against today's shape and reshaping afterwards means writing it twice and migrating live data on the second pass.

But that rule has now deferred the adapter through four slices, and SC1–SC6 would defer it through six more. There is a real risk of a product that is beautifully modelled and has never once read from Postgres — where RLS, the second half of defence in depth, remains unexecuted code, and every isolation guarantee rests on the application layer alone.

**Recommendation:** keep the rule, but bound it. SC1–SC6 are the *last* schema-shaping work before the adapter, they are timeboxed to schema, repository and tests, and **no UI is built during them**. SC8 follows immediately and is not deferred behind any further capability. The Control Plane already runs on Supabase (`src/server/control-plane/supabase.ts`), so the adapter pattern is proven in-repo and this is not novel work.

The alternative — adapter first, then reshape — is defensible and should be taken if SC1–SC6 slip. What is not defensible is a third path where new capabilities are added and the adapter recedes again.

---

## 7. Statement semantics

The five kinds are global, in `ClaimKind`, with the weakest-link rule implemented in `lib/knowledge/kind.ts`:

```text
fact 0 · calculation 1 · assumption 2 · forecast 3 · recommendation 4
effectiveClaimKind(root) = weakest kind anywhere in the support chain
```

A calculation resting on a forecast is not a calculation. `kindIsHonest()` returns rather than throws, so the caller may relabel or withhold — both legitimate, depending on the surface.

**Extended in MG-1.** `inference` and `hypothesis` are added, and the scale renumbered. The *relative* order of the original five is unchanged, which is why the finance suite that asserts weakest-link behaviour needed no amendment:

```text
fact 0 · calculation 1 · inference 2 · assumption 3 · hypothesis 4 · forecast 5 · recommendation 6
```

`inference` sits above calculation because it is derived by reasoning rather than by arithmetic that can be shown. `hypothesis` sits above assumption because an assumption is something we had to adopt to proceed, whereas a hypothesis is something we are proposing to test. Placement is a behavioural change to `effectiveClaimKind` and must land with tests that pin the new ordering, not merely with the new labels.

The prohibition the brief states — never allow AI to silently transform hypothesis into fact, or calculation into verified source fact — was structural in two places, and MG-1 found a third route around it and closed that too.

The two that existed: `assertProducerMayAssign` makes a model-verified claim unconstructable, and claims are immutable so a correction supersedes rather than edits.

The gap: `effectiveClaimKind` computes the weakest link across a *support chain*, so the cheapest way to defeat it was never to argue with the chain but to **replace the weak link with a strong successor**. Superseding preserved immutability and produced a laundered chain. `assertKindMayNotStrengthen` now refuses a non-human producer superseding a claim with a stronger kind, enforced on the storage path and asserted in the shared repository contract. A human may still establish something a machine could not — that is the act the rule exists to require, not to prevent.

---

## 8. Missing information is a value

Three independent implementations already refuse to manufacture completeness, and they are the pattern to copy rather than reinvent:

- `missing[]` on relationship briefs — assembled, never generated
- Unit costs **withheld with a `requires` list** rather than published with a caveat
- `not_publicly_found ≠ missing` in `OrganisationGap` — "we could not find it" is a different statement from "they do not have it"

The vocabulary the product must be able to say: *unknown · not measured · no evidence · needs verification · insufficient data · conflicting sources · cannot calculate · not applicable*. Only the first six have a representation today. `cannot calculate` exists in finance and nowhere else; `not applicable` exists nowhere and is the one most often faked by a zero.

**On beneficiaries.** The absence of a beneficiary entity is a decision, not an oversight, and the expansion must not casually reverse it. `Person` carries no date of birth, address, household or wealth field by design: adding personal data requires a lawful basis first, not an available column. Beneficiary and case data is the most sensitive category Mission OS could hold, it is the category most likely to be exposed to an AI provider by accident, and it should not be introduced until field-level sensitivity, retention, deletion and AI-context redaction are designed together with it. Until then, impact is measured through indicators and evidence, which is both safer and sufficient.

---

## 9. Intelligence over the graph

Unchanged from the target architecture, restated because the expansion must not route around it:

```text
MISSION GRAPH → CONTEXT → DETERMINISTIC INTELLIGENCE → AI REASONING
              → PROVENANCE → HUMAN DECISION
```

Context is assembled server-side from authorised facts. There is no agent with database access. AI receives an explicitly constructed context and returns structured output validated before persistence.

**Deterministic before generative** is already load-bearing: fit, grant health, progress, relationship health, evidence strength, report readiness, runway, cliffs, concentration, unit economics and funding need are all pure functions with unit tests. Every capability the expansion adds must answer where its deterministic core is before any prompt is written. A capability whose only implementation is a prompt is a capability that cannot be trusted, explained or tested.

The one architectural gap here is that there is still no orchestrator: server actions call `runAi` directly, with no router and no policy layer between. That is build spec Slice F and is unchanged.

---

## 10. What this architecture must never become

- A generic CRM with a charity vocabulary. Roles on relationships, not tables per constituency type.
- A module list. A donation that lives only in Fundraising is a modelling failure, not a feature.
- An omnipotent agent. Context is constructed; it is never queried freely by a model.
- A system that is confident because it is quiet. Missing data must remain visible.
- A schema that grows faster than its proofs. Every new tenant-owned table joins the two-tenant isolation suite in the same change that creates it.
