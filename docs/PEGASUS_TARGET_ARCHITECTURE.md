# Pegasus Mission OS — Target Architecture

**Status:** Living document. Updated at the end of every implementation slice.
**Sequencing authority:** [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md) — the target below is unchanged, but the *order* it is reached in is now defined there, organised around six foundational systems and a unified Knowledge / Claims layer.
**Companion documents:** [`PEGASUS_ARCHITECTURE_AUDIT.md`](./PEGASUS_ARCHITECTURE_AUDIT.md), [`PEGASUS_IMPLEMENTATION_PLAN.md`](./PEGASUS_IMPLEMENTATION_PLAN.md) (superseded), [`RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md`](./RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md)

> **Product promise:** Enter knowledge once. Use it everywhere. Prove everything. Learn continuously.

---

## 1. Platform layers

```text
┌─────────────────────────────────────────────────────────┐
│                   PEGASUS COPILOT                       │
│ Ask • Create • Analyse • Review • Recommend • Act       │
├─────────────────────────────────────────────────────────┤
│                MISSION INTELLIGENCE                     │
│ Rules • AI • Retrieval • Agents • Automation • Signals  │
├─────────────────────────────────────────────────────────┤
│                    MISSION GRAPH                        │
│ Strategy • Funding • Grants • Programmes • Evidence     │
│ Outcomes • People • Money • Partners • Reports          │
├─────────────────────────────────────────────────────────┤
│                     TRUST LAYER                         │
│ Provenance • Verification • Audit • Consent • Security  │
│ Permissions • Tenant Isolation • Human Approval         │
└─────────────────────────────────────────────────────────┘
```

The Trust Layer is the **bottom** layer deliberately: provenance, permissions and tenant isolation are preconditions for everything above, not decorations on top. Every layer above may only reach data through it.

---

## 2. Source-tree target

```text
src/
  app/                      Routes (thin; no data access logic)
  components/               UI, design system, module components
  features/                 Client-side feature composition
  lib/
    logic/                  Deterministic intelligence (pure, unit-tested)
    permissions/            Capability model
    trust/                  Attested<T>, verification, evidence strength
  server/
    context/                RequestContext: tenant + actor + role resolution
    data/                   ← THE DATA BOUNDARY
      types.ts              Repository interfaces (async, tenant-scoped)
      in-memory/            Deterministic adapter (demo, tests, storybook)
      supabase/             Production adapter
      index.ts              Adapter selection
    intelligence/           Intelligence service, routers, guardrails
      context/              Context builders (one per domain)
      policy/               Guardrails, redaction, approval gates
    reports/                Report engine
    events/                 Domain events + workflow
    actions/                Server actions (thin; orchestration only)
  types/domain.ts           Shared domain model
supabase/migrations/        Schema, RLS, functions
```

**Architectural rule:** nothing outside `server/data/` may import a storage adapter. Route handlers, pages and server actions depend on the repository *interface* only.

---

## 3. The data boundary (Phase 1 — in progress)

The single most important structural change. Every data access is:

- **asynchronous** — so a network-backed adapter can be substituted,
- **tenant-scoped** — organisation identity is a required parameter, not a module constant,
- **actor-aware** — the acting user and role travel with the request.

```ts
interface RequestContext {
  organisationId: string;
  userId: string;
  role: MemberRole;
  now: () => Date;        // injectable clock; deterministic in tests
}

interface MissionRepository {
  organisations: OrganisationRepository;
  funding: FundingRepository;
  applications: ApplicationRepository;
  grants: GrantRepository;
  programmes: ProgrammeRepository;
  evidence: EvidenceRepository;
  reports: ReportRepository;
  activity: ActivityRepository;
  audit: AuditRepository;
}
```

Two adapters implement it:

| Adapter | Purpose |
|---|---|
| `in-memory` | Demo workspace, deterministic tests, storybook. Retained permanently — it is what makes the test suite fast and hermetic. |
| `supabase` | Production system of record. |

Selection happens once, in `server/data/index.ts`, from configuration. **Defence in depth:** the adapter filters by `organisationId` *and* Postgres RLS enforces it independently. Neither is trusted alone.

---

## 4. Mission Graph

Postgres remains the system of record. No graph database — the traversals required are shallow (typically 3–7 hops) and expressible as recursive CTEs and well-indexed joins. Introducing a second store would fragment the trust boundary for no measurable gain.

The graph is achieved by **normalising toward the existing relational schema**, which is already closer to the target than the TypeScript model (see audit §6), plus a small set of reusable relation primitives instead of unbounded ad-hoc foreign keys.

### Relation primitive

```ts
interface EntityReference { type: EntityType; id: string; }

interface Relation {
  id: string;
  organisationId: string;
  from: EntityReference;
  to: EntityReference;
  kind: RelationKind;   // contributes_to | evidences | funds | measures | derived_from | supersedes …
  attested?: Attested<null>;
}
```

Strong, high-traffic edges (grant → application, indicator → outcome) stay as typed foreign keys for query performance and referential integrity. The `Relation` table carries the **many-to-many, cross-domain, semantically varied** edges the brief requires — strategic priority → programme, evidence → claim, claim → report section — which would otherwise become a sprawl of join tables.

`EntityReference` now exists in `src/types/domain.ts`, and `RelationshipLink` (relationship → programme as a delivery partner, relationship → evidence as its evaluator) is its first concrete instance. See [`RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md`](./RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md) §2.2.

### Required traversals

```text
Strategic Priority → Programme → Activity → Output → Outcome
                   → Indicator → Measurement → Evidence → Claim → Report → Funder

Funding Opportunity → Application → Grant → Budget → Programme
                    → Delivery → Outcome → Evidence → Report

Transaction → Financial Allocation → Grant / Programme / Activity
            → Output → Outcome → Impact Economics
```

The third traversal is why **`FinancialAllocation` is an entity and not a join**: it records *how* money was attributed (method, basis, confidence, who verified it), which is the only thing that makes a cost-per-outcome figure defensible. Money never reaches a programme directly from a transaction. See [`FINANCE_INTELLIGENCE.md`](./FINANCE_INTELLIGENCE.md) §2.

---

## 5. Trust Layer

### Expanded `Attested<T>`

```ts
interface Attested<T> {
  value: T;
  verificationState: VerificationState;
  confidence?: number;
  sources: SourceReference[];
  providedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  validFrom?: string;
  validUntil?: string;
  derivedFrom?: EntityReference[];
}
```

Applied **selectively** — where provenance materially affects a decision or a funder-facing statement. Not mechanically wrapped around every column.

Verification states extend to distinguish: verified fact, human-provided, AI-extracted, AI-derived inference, human interpretation, assumption, outdated, conflicting, missing.

### Claims — the unified epistemic foundation

A `Claim` is a first-class assertion ("82% of participants improved employment readiness") linking indicator, measurement, evidence, programme, grant, report and application answer. **Evidence strength** is computed deterministically from the count, recency, verification state and independence of supporting evidence — never by a model.

Any figure in a report or application must be traceable: `Claim → Indicator → Measurement → Evidence → Programme → Grant`.

**Claims are not one more entity.** `Attested<T>`, the five finance statement kinds, the Organisation Intelligence candidate/source/authority/conflict model and the relationship brief's `sources[]`/`missing[]` are four independent inventions of the same concept. They unify into one layer:

```text
SOURCE → CLAIM → VERIFICATION → DERIVATION → KNOWLEDGE → DECISION / ACTION
```

Claims are **immutable** (correction supersedes, never edits), confidence **never promotes** verification, `effectiveKind()` returns the weakest link in any support chain, and `claim_usages` is a reverse index so "where did this figure come from?" and "what breaks if it is wrong?" are one query in two directions.

This is why the layer is **promoted into the foundation** rather than sequenced mid-roadmap: it reshapes the schema, so it must be settled before the storage adapter is written. Full design and sequencing in [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md) §2.

### Statement kinds

Derived output is typed by how far it stands from a record:

```text
FACT · CALCULATION · FORECAST · ASSUMPTION · RECOMMENDATION
```

The kind is part of the model, not UI copy. A recommendation is assembled from a chain of supporting statements and is always the last link; the *effective* kind of a chain is its weakest link, so a calculation resting on a forecast may not be presented as a calculation. Tracing that chain is what lets a user drill from "Programme X has a £310k funding gap" to the grant end dates and assumptions beneath it. Introduced for Finance Intelligence; it belongs to the shared provenance model.

### Provenance must be observed, not assumed

The current implementation reports everything *offered* to a model as *used* (audit S2). The target requires generation to return **which sources it actually drew on**, via structured output, validated before persistence. Unverifiable provenance is worse than none, because it looks authoritative.

S2 is not a bug in a function — it is a bug in a type. `AIProvenance` is five arrays of bare strings, so there is no reference for a returned source to be validated *against*. It is therefore closed by **replacing the type**, not by adding a check to the current one: generation returns claim IDs, and an ID that was never offered is a validation failure rather than a warning. Scheduled in Slice B accordingly.

---

## 6. Intelligence architecture

```text
UI / Feature
     ↓
Intelligence Service        ← single entry point; no direct model calls in components
     ↓
Context Builder             ← authorised Mission Graph facts, each retaining source identity
     ↓
Policy / Guardrails         ← permissions, PII minimisation, injection defence, approval gates
     ↓
Router                      ← rule | retrieval | generative | analytical
     ↓
Provider                    ← mock | Anthropic | future providers
     ↓
Structured Result           ← schema-validated before persistence
     ↓
Provenance                  ← observed sources, execution metadata
     ↓
Human Review                ← consequential actions require authorisation
```

### Six intelligence kinds

| Kind | Implementation | Examples |
|---|---|---|
| **Deterministic** | Pure functions | eligibility, fit, grant health, report readiness, budget variance, evidence completeness |
| **Retrieval** | Scoped search over the graph | find evidence supporting an outcome |
| **Generative** | Model | draft, rewrite, summarise, explain |
| **Analytical** | Mixed | gaps, inconsistencies, trends |
| **Recommendation** | Rules + model explanation | pursue this opportunity, chase this evidence |
| **Action** | Controlled tools | prepare a report, create tasks — always human-authorised |

**Deterministic wins wherever rules can decide.** AI is used for interpretation, language and synthesis. Specialist capabilities (Funding, Application, Evidence, Grant, Programme, Impact, Finance, Reporting, Governance, Learning, Executive Intelligence) are *configurations* of this shared pipeline — routing, context builder and prompt set — never independent implementations.

### Finance Intelligence — the closed loop

Finance is not a module that reports what was spent. It is the loop that connects money to delivery and back again, and the architecture must express it as one:

```text
FINANCIAL DATA → POSITION → FORECAST → FUNDING NEED → FUNDING INTELLIGENCE
   → OPPORTUNITY → APPLICATION → GRANT → FINANCIAL ALLOCATION
   → PROGRAMME DELIVERY → OUTPUTS → OUTCOMES → IMPACT ECONOMICS
   → REPORTING → LEARNING → NEXT FORECAST
```

Two consequences for the platform rather than for one feature:

- **`FundingNeed` is a first-class input to funding matching.** Discovery stops asking only "what grants fit this organisation?" and can ask "what could close this specific future gap?" — with amount, timing, duration and funding type as match factors over the unchanged deterministic fit scorer.
- **Every derived financial figure is deterministic and discloses its methodology.** AI explains figures; it never produces or alters them. Where the data cannot support a figure, the figure is withheld with a reason rather than published with a caveat.

Design and implemented calculation core: [`FINANCE_INTELLIGENCE.md`](./FINANCE_INTELLIGENCE.md).

### Execution record

Every execution persists: feature, prompt version, provider, model, context source IDs, timestamp, output type, validation result, fallback state, human review state. Mock fallback is surfaced explicitly in the UI, never disguised as live generation.

---

## 7. Reporting engine

Reports become a general capability, not a page.

```text
ReportDefinition   type, required sections, funder template
Report             instance: period, programme/grant/funder, owner, contributors, reviewers
ReportSection      typed: executive summary | narrative | KPI | indicator | chart | table |
                   programme | financial | evidence | case study | testimonial | risks |
                   lessons | recommendations | methodology | appendix | custom
```

Lifecycle:

```text
draft → collecting_evidence → drafting → internal_review → changes_requested
      → ready_for_approval → approved → submitted → archived
```

**Report readiness** is deterministic and continuous — computed from indicator currency, evidence availability and staleness, unsupported claims, figure consistency and deliverable completion. The goal of §52: reaching a deadline with the report already evidenced, rather than performing archaeology.

Export (PDF/DOCX/print/secure web view) sits behind a provider-independent interface.

---

## 8. Trust and approval in the UI

Significant AI output exposes interpretable grounding — counts of verified facts, approved evidence and indicators used, plus assumptions made and figures unavailable. Not a spurious confidence percentage.

Human approval is mandatory for: application submission, funder reporting, financial changes, deleting evidence, approving claims, trustee decisions, strategic changes and external communications. AI prepares; humans authorise.

---

## 9. Events and workflow

```text
EVENT → CONDITION → ACTION
```

Domain events (`OpportunityDiscovered`, `GrantAtRisk`, `DeliverableOverdue`, `EvidenceOutdated`, `ReportDueSoon`, …) are emitted by the data layer on state transitions and consumed by a rules engine. Implementation stays pragmatic — an in-process dispatcher plus a Postgres-backed job table. No queue infrastructure until measurement demands it.

---

## 10. Cross-cutting requirements

- **Multi-tenancy:** every tenant-owned row carries `organisation_id`; adapter filtering *and* RLS; automated isolation tests are part of the definition of done.
- **Audit ledger:** actor, action, entity, before/after, timestamp, AI involvement, approval. Requires a real clock.
- **Security:** AI retrieval obeys the same authorisation model as the UI. Untrusted document text is never concatenated into an instruction channel.
- **Internationalisation:** currency, locale and timezone are data, not constants. Translations retain the source text.
- **Accessibility:** WCAG 2.2 AA.
- **Integrations:** boundaries defined now, implementations later. Pegasus is the intelligence layer over existing tools, not a forced replacement.

---

## 11. Design principles

Calm, trustworthy, capable. Clear hierarchy, progressive disclosure, excellent tables and search, visible evidence, actionable attention states, keyboard efficiency. AI appears as useful actions in context — not as branding, and not as dozens of sparkle buttons.

---

## 12. Success tests for every feature

1. Does it reduce administrative work?
2. Does information entered here become reusable elsewhere?
3. Can the user understand *why* Pegasus recommended this?
4. Can an important claim be traced to evidence?
5. Is AI used because it is appropriate, or because it is fashionable?
6. Does the organisation get smarter over time?
