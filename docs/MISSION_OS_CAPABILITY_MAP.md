# Mission OS — Capability Map

**Status:** Reference. What Mission OS can do today, what it half does, and what it cannot do — each judged against the working tree rather than against intent.
**Companions:** [`MISSION_GRAPH_ARCHITECTURE.md`](./MISSION_GRAPH_ARCHITECTURE.md), [`MISSION_OS_EXPANSION_PLAN.md`](./MISSION_OS_EXPANSION_PLAN.md), [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md)

> A feature is not complete because Mission OS now *has* it. The test is whether information entered there becomes useful somewhere else.

Legend: **●** shipped and connected · **◐** partial, gap named · **○** designed and unwired · **—** absent

---

## 1. Summary

Across 102 capabilities assessed below, before MG-1 and after MG-1 and MG-3:

| | Before MG-1 | After MG-1 |
|---|---|---|
| ● Shipped and connected | 57 | **75** |
| ◐ Partial, gap named | 10 | 9 |
| ○ Designed and tested, no product surface | 6 | 5 |
| — Absent | 24 | 13 |

Two cautions about that column.

**"Shipped" means different things in the two phases, and the difference matters.** MG-1 was scoped to schema, repository and tests and deliberately built no UI, so ten capabilities moved to ● without a page reading them. MG-3 built screens, so its capabilities are genuinely usable. Neither is persisted beyond a restart until MG-2.

**The unusual entry is still ○.** Mission OS holds 4,809 lines of unit-tested finance calculation, a complete Organisation Intelligence extraction pipeline and a report export engine, none of which any route reaches. MG-1 gave the finance engine inputs it had never had; it did not give it a surface. This remains the largest gap between what the repository contains and what a user can do.

---

## 2. Understand the organisation

| Capability | State | Where | Notes |
|---|---|---|---|
| Organisation profile, 21 attested fields | ● | `OrganisationProfile` | Every field carries a verification state and can project from a claim |
| Verification states on every field | ● | `VerificationState` | `verified · provided · ai_extracted · needs_review · outdated` |
| Team, roles, capabilities | ● | 7 roles, 28 capabilities, enforced in every mutating action | Guarded by a build-failing test |
| Public discovery and extraction | ● | `lib/organisation-intelligence/` + `server/onboarding/` | MG-3 wired it to customer onboarding. Real crawler with robots.txt and pacing; registry lookup by number behind a provider-independent port |
| Conflict detection and reconciliation | ● | `reconcile.ts`, `authority.ts` | Ordinal source authority: regulator > organisation > supporting > discovery |
| Prompt-injection sanitisation | ◐ | `sanitise.ts`, applied in the AI context builder and on every extracted candidate | A flagged source forces `needs_review` regardless of confidence. Full generalisation is MG-4 |
| Onboarding that persists | ● | `OnboardingRun`, `/onboarding`, `/onboarding/review`, `/onboarding/audit` | The 228-line facade is gone. Runs, sources, candidates and decisions are all persisted through the repository |
| **Strategy as an entity** | ● | `StrategicPriority`, `strategic_priorities` (`0020`) | Owns programmes through `pursues` relations. Added by MG-1 |
| Theory of change | — | | |
| **Registry lookup by number** | ● | `RegistryLookup` port; Charity Commission and Companies House implementations | Not-found returns null, unreachable throws. An outage must never read as evidence a charity is unregistered |
| **Identity discrepancy detection** | ● | `OrganisationDiscoveryService` | Register name, status and website compared against what was entered. Surfaced, never silently corrected |
| **Six-group review screen** | ● | `/onboarding/review` | Verified, provided, extracted, conflicts, needs review, missing. Approve, edit, reject, resolve |
| **Organisation audit** | ● | `lib/onboarding/audit.ts`, nine sections | Deterministic. Every observation names its evidence and every section states where it looked |
| **Grounded first-value recommendations** | ● | `lib/onboarding/recommendations.ts` | `grounds` is required and non-empty, so an ungrounded recommendation cannot be constructed. No model involved |

---

## 3. Fund the mission

| Capability | State | Where | Notes |
|---|---|---|---|
| Funder records | ● | `Funder`, bridged to `ExternalOrganisation` | "Funder" is a role a body plays, not a separate contact universe |
| Opportunity pipeline, 11 stages | ● | `FundingOpportunity` | |
| Eligibility criteria and questions | ● | `opportunity_eligibility_criteria`, `opportunity_questions` | |
| **Deterministic fit assessment** | ● | `lib/logic/fit.ts` | 8 weighted factors; eligibility is a hard gate that overrides score; every factor emits rationale, evidence used and assumptions |
| Application drafting with AI | ● | `generateAnswer()` | Draft, improve, make specific, strengthen with evidence, shorten, review against criteria |
| Answer versioning and review | ● | `AnswerVersion`, `ApplicationReview` | |
| Convert application → grant | ● | Confirmed, irreversible-feeling action (D11) | |
| Funding discovery from real sources | — | Seeded opportunities only | The Control Plane has a live discovery pipeline; the customer product does not |
| **Funding need as a match input** | ○ | `funding-need.ts`, `need-matching.ts` — 687 lines | Designed so discovery can ask "what closes *this* gap?" rather than "what fits us?". MG-1 gave finance its inputs; needs themselves are MG-8 |

---

## 4. Manage the money

| Capability | State | Where | Notes |
|---|---|---|---|
| Grant record, payments, deliverables, reports | ● | `Grant` + 4 child tables | |
| **Deterministic grant health** | ● | `lib/logic/grant-health.ts` | Scores overdue deliverables, overdue reports, spend ahead/behind timeline, missing evidence, imminent reports. Returns `reasons[]`, never a bare score |
| Money as integer minor units | ● | `Money { minorUnits, currency }` | Currency is data, not a constant |
| Runway, cliffs, concentration | ○ | `runway.ts`, `cliffs.ts`, `concentration.ts` | Tested. Data now exists to feed them; no surface reaches them until MG-8 |
| Cost rollup, unit economics, subsidy | ○ | `cost-rollup.ts`, `unit-economics.ts`, `subsidy.ts` | `UnitCost` **cannot be constructed without a `Methodology`** — there is no code path producing a bare number |
| Forecast and trends | ○ | `forecast.ts`, `trends.ts` | |
| **Transactions** | ● | `financial_transactions` (`0018`) | Integer minor units, never a float. `Grant.spentToDate` is superseded by summing allocations that each name their transaction |
| **Funds (restricted / unrestricted ledger)** | ● | `funds` (`0018`) | `restriction` separates funder-imposed from trustee-designated. A restricted fund without a stated purpose is refused by the schema |
| **Financial allocation** | ● | `financial_allocations` (`0018`) | `allocation_method` is `not null`: there is no way to record an attribution without saying how it was made |
| **Budgets** | ● | `budgets`, `budget_lines` (`0018`) | Lines target graph entities, so a budget can be compared against actual allocations |
| Bank / accounting integration | — | | MG-11 |

**The shape of this section is the finding.** Six capabilities are fully calculated and tested; five entities they depend on do not exist. Mission OS can compute a defensible cost per outcome and cannot record that £4,000 was spent.

---

## 5. Deliver the work

| Capability | State | Where | Notes |
|---|---|---|---|
| Programme records | ● | `Programme` | |
| Programme ↔ grant links | ● | `programme_grants` | |
| Activities | ● | `Activity` entity; `activities` extended in `0017` | Can now receive an allocation and contribute to an output. The string array is deprecated in place |
| Outputs | ● | `Output` entity; `outputs` extended in `0017` | Carries unit, target and current value |
| **Activity → Output → Outcome chain** | ● | `Relation { kind: "contributes_to" }` (`0017`) | Weighted where a contribution is partial, so a roll-up cannot silently claim the whole outcome |
| Delivery partners | ◐ | `Programme.deliveryPartners: string[]` **and** `RelationshipLink` | Two representations of the same fact; the second is correct and the first should retire |
| Risks | ◐ | `Programme.risks: string[]` | Free text, no owner, no review date |

---

## 6. Measure the change

| Capability | State | Where | Notes |
|---|---|---|---|
| Outcomes with framework level | ● | `Outcome.level: output \| outcome \| impact` | Level is a label; there is no parent link between levels |
| Indicators with baseline / target / current | ● | `Indicator` | Carries a confidence level |
| Measurements over time | ● | `IndicatorMeasurement` | Now actually stored. `updateIndicator` appends a reading instead of only overwriting `currentValue`, so a trend exists and a published report can still resolve what it cited |
| Deterministic progress | ● | `lib/logic/progress.ts` | |
| Evidence library, 11 types | ● | `EvidenceItem` | |
| **Deterministic evidence strength** | ● | `lib/knowledge/evidence-strength.ts` | From count, recency, verification state and independence. Never a model |
| Evidence → programme / grant / outcome / answer / report | ● | `EvidenceLink` | |
| **Evidence → indicator or measurement** | ● | `Relation { kind: "evidences" }` (`0019`) | `EvidenceLink` is retained for shipped call sites and deprecated in favour of this |
| Surveys and data collection | — | | MG-7 |

---

## 7. Prove the impact

| Capability | State | Where | Notes |
|---|---|---|---|
| **Claims as first-class assertions** | ● | `Claim` + 5 tables | Immutable; correction supersedes rather than edits |
| Sources with ordinal authority | ● | `ClaimSource`, `SourceAuthority` | With `locator`: "page 14", "row 402" |
| Producers as a discriminated union | ● | `ClaimProducer` | human · extraction · calculation · model — because each affords different proof |
| **Confidence never promotes verification** | ● | `assertProducerMayAssign` | Structural: an extractor or model **cannot construct** a verified claim |
| **Weakest-link kind** | ● | `effectiveClaimKind()` | A calculation resting on a forecast is not a calculation |
| Claim usage reverse index | ● | `ClaimUsage` | "Where did this come from?" and "what breaks if it's wrong?" are one query in two directions |
| Conflict records | ● | `ClaimConflict` | Recommends by authority then recency. **Never auto-applies** |
| Report engine, 12 types, 9 states | ● | `lib/reporting/` | |
| Claim-pinned report figures | ● | `ImpactReportSection.claimIds` | Never a copied number |
| Deterministic report readiness | ● | `assessReportReadiness()` | Every deduction names the record that caused it |
| Report export | ○ | `buildReportExport()` produces a neutral payload | No PDF or DOCX adapter consumes it |
| Report creation from a definition | — | | MG-5 |
| `inference` / `hypothesis` kinds | ● | `ClaimKind`, `CLAIM_KIND_DISTANCE` | Added by MG-1. `assertKindMayNotStrengthen` also closes the supersede route around the weakest-link rule |
| Statement vocabulary for absence | ◐ | 6 of 8 states expressible | `cannot calculate` exists only in finance; `not applicable` exists nowhere and is routinely faked by a zero |

**This is the strongest area of the product and the clearest competitive separation.** No mission-sector CRM traces a published figure back through its support chain to the source, refuses to promote a kind, and flags a superseded claim on a published report without altering it.

---

## 8. Strengthen the relationships

| Capability | State | Where | Notes |
|---|---|---|---|
| Canonical people and external organisations | ● | `Person`, `ExternalOrganisation` | One record, not one per module |
| Relationships with **contextual roles** | ● | Open taxonomy, 17 known roles + tenant strings | A university can be funder, delivery partner and evaluator at once. **No role is ever a boolean column** |
| Interactions across all channels | ● | `Interaction` | One generic entity, so the timeline never needs unioning |
| Commitments | ● | `Commitment` | Promises made and received. AI-extracted candidates require human confirmation |
| **Explainable relationship health** | ● | `lib/logic/relationship-health.ts` | Named rules with the signals that fired. Not a score. Human override requires a reason |
| Relationship brief | ● | `relationship-brief.ts` | **Assembled, not generated**, with an explicit `missing[]` |
| Identity resolution | ● | `relationship-identity.ts` | |
| Consent and communication preferences | ● | `ConsentState`, `CommunicationPreferences` | `not_recorded` is the honest default and is deliberately not a synonym for consent |
| Relationship → graph edges | ● | `RelationshipLink` | The first concrete `Relation` |
| Email / calendar sync | — | Ports declared in `server/communications/provider.ts` | MG-11 |
| Donations and stewardship | — | | MG-10 |
| Beneficiaries | — | **Deliberately absent** | See [`MISSION_GRAPH_ARCHITECTURE.md`](./MISSION_GRAPH_ARCHITECTURE.md) §8 |

---

## 9. Learn and act

| Capability | State | Where | Notes |
|---|---|---|---|
| Tasks, comments, notifications, activity | ● | | |
| Append-only audit ledger | ● | `AuditEvent`, insert-only RLS | |
| AI generation records | ● | `AIGeneration` + `GroundingRecord` | Model, prompt version, fallback state and reason all travel with the output |
| **Observed grounding** | ● | `GroundingViolationError` | A reference that was never offered discards the output. Closed audit finding S2 by replacing the type, not patching the check |
| Deterministic weekly priorities | ● | `features/dashboard/selectors.ts` | Computed from live data, never generated |
| Command bar Q&A | ● | `askCommand()` | Recorded as `pending`, never self-approved |
| **Domain events** | — | | No dispatcher, no job table. Signals recomputed per page render |
| **Scheduled reminders** | ◐ | `ReportingRequirement.dueDate` + an accountable owner | The data a scheduler needs now exists. The scheduler does not — MG-6 |
| Attention system | ◐ | Priorities exist; triage does not | MG-6 |
| Intelligence orchestrator | — | Four entry points call `runAi` directly | No router, no policy layer. MG-4 |
| Search | — | | |
| Document ingestion | ● | `lib/documents` + `Document` / `DocumentVersion` / `DocumentSource` / `ExtractedClaim` (`0021`) | PDF, DOCX, XLSX, CSV, TXT, zero dependencies. A text-quality gate refuses rather than emitting plausible rubbish. No OCR, no encrypted files, stated plainly |

---

## 10. Platform

| Capability | State | Notes |
|---|---|---|
| Data boundary, 17 async tenant-scoped repositories | ● | Nothing outside `server/data/` may import a storage adapter, enforced by a build-failing test. MG-1 added `graph`, `strategy`, `finance` and `requirements` |
| In-memory adapter | ● | Permanent. It is what makes 710 tests run in seven seconds |
| **Supabase adapter (customer product)** | — | **`getRepository()` returns in-memory unconditionally.** The critical gap |
| Supabase adapter (Control Plane) | ● | Proves the pattern in-repo |
| Authentication | ● | Session validated with `getUser()`; membership grants access; role comes from the membership row, never a client claim |
| Permission enforcement | ● | Every mutating action; a new action without a gate fails the build unless it declares `@public-action` with a reason |
| Tenant isolation (application layer) | ● | Two-tenant suite; disabling `scoped()` fails 27 tests |
| **Tenant isolation (RLS)** | ◐ | All 72 tenant tables covered, and **now executing**: migrations `0001`-`0021` are applied to a live project, and anonymous callers are blocked on every table tested. The stronger claim, that an authenticated member of one tenant cannot read another, still needs MG-2 |
| Multi-surface hosting | ● | Marketing / customer app / Control Plane, resolved in middleware. Host is never an authentication factor |
| Provider independence | ● | AI and communications behind ports; provider ids confined to a separate map |
| Rate limiting | ◐ | Implemented and tested for the Control Plane |
| Observability | — | |
| Internationalisation | ◐ | Currency is data in the finance model; GBP and en-GB assumed in the UI |
| Accessibility | ● | Status never relies on colour alone |

---

## 11. How each area strengthens the graph

The §10 test, applied. A capability that cannot fill the third column is a module, not a Mission OS capability.

| Area | Information entered here becomes | Mission Intelligence uses it for | Downstream work that disappears |
|---|---|---|---|
| Organisation profile | Claims cited by applications, reports and briefs | Fit assessment, eligibility, readiness | Re-answering "tell us about your organisation" in every application |
| Fit assessment | A traceable recommendation with factor-level rationale | Pipeline triage, funding need matching | Manually reading eligibility criteria against the profile |
| Grant record | Health signals, deliverable deadlines, report obligations | Attention items, report readiness | Reconstructing what a funder expects from an email thread |
| **Transactions and allocations** *(absent)* | Programme cost, unit economics, subsidy, runway | Affordability, underspend, funding cliffs | Rebuilding the finance picture in a spreadsheet each quarter |
| **Results chain** *(absent)* | Attribution from money to outcome | "What did this achieve?", cost per outcome | Manually reconstructing the chain for every funder report |
| Indicators and measurements | Claims with provenance | Progress, report readiness, evidence gaps | Chasing numbers the week a report is due |
| Evidence | Evidence strength, claim support | Report readiness, application strengthening | Searching folders for the case study that proves a point |
| Claims | Everything above, traceably | Every figure the product asserts | Archaeology when a funder asks where a number came from |
| Relationships | Health, briefs, commitments, timeline | Stewardship prompts, relationship context in fit | Preparing for a meeting by reading old emails |
| **Events** *(absent)* | Attention items and reminders | Triage | Noticing a deadline by remembering it |

---

## 12. The competitive position, honestly

Mature mission-sector CRMs win on breadth. Mission OS is not close on breadth and should not try to be: no donations, no campaigns, no forms, no portals, no email marketing, no events.

Where it is genuinely ahead, and where the investment should stay:

1. **Provenance that survives publication.** A figure in a report points at an immutable claim. Supersede the claim and the report flags a change rather than silently altering. Nothing else in the sector does this.
2. **Deterministic before generative, as architecture rather than policy.** Eleven engines are pure, tested functions. AI explains them; it cannot replace them, because it is never asked to.
3. **Refusals that are structural.** A model cannot construct a verified claim. A unit cost cannot exist without a methodology. A calculation resting on a forecast cannot be labelled a calculation. These are type-level, not review-level.
4. **Missing information as a first-class value.** `not_publicly_found ≠ missing`; unit costs withheld with a `requires` list rather than published with a caveat.
5. **Roles rather than record types.** One person, one external organisation, contextual roles — the modelling decision that stops the product becoming a CRM with a charity vocabulary.

Where it is behind, and honestly so:

1. **The application has still never read from Postgres.** The schema is live and its constraints are verified, but `getRepository()` returns the in-memory adapter unconditionally, so not one page reads the database. That adapter is what remains of MG-2, and it is the single largest gap.
2. **The strongest capabilities are the least reachable.** Finance and Organisation Intelligence still have no customer-facing surface. MG-1 gave the finance engine the inputs it had never had; MG-8 gives it a screen.
3. **Nothing MG-1 built is visible.** Ten capabilities moved to ● without a page reading them. A model that can represent something is not the same as a product that lets you do it, and this map should not be read as though it were.
4. **All extraction is deterministic.** MG-3 calls no model anywhere. Label-driven extraction finds less than a model would, and every value it finds carries a locator a person can check. That is the right order to build in, and it is still less than the brief's field list implies.

Three items have come off this list: the results chain is now modelled, money is now recorded as well as calculated, and onboarding now produces something rather than collecting the same information twice and persisting none of it.
