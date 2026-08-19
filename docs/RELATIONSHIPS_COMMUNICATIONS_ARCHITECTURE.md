# Pegasus Mission OS — Relationships, Communications and Collaboration

**Status:** Living document. Phase 1 (Relationship Foundation) implemented; later phases designed, not built.
**Date:** 2026-08-17
**Companion documents:** [`PEGASUS_ARCHITECTURE_AUDIT.md`](./PEGASUS_ARCHITECTURE_AUDIT.md), [`PEGASUS_TARGET_ARCHITECTURE.md`](./PEGASUS_TARGET_ARCHITECTURE.md), [`PEGASUS_IMPLEMENTATION_PLAN.md`](./PEGASUS_IMPLEMENTATION_PLAN.md), [`SECURITY_AND_PRIVACY.md`](./SECURITY_AND_PRIVACY.md)

> **Principle.** Pegasus should understand relationships, not just store contacts. The deliverable is not a CRM inside Pegasus — it is the **relationship memory of the organisation**.

---

## 1. Repository inspection — what already exists

Full read of `src/types/domain.ts` (585 lines), `src/server/data/`, `src/features/store/`, `supabase/migrations/` (737 lines) and every page under `src/app/(dashboard)/`.

### 1.1 Concepts that already carry relationship meaning

| Concept | Location | What it is today |
|---|---|---|
| `User` | `domain.ts:50` | An internal person. Global, not tenant-owned. |
| `OrganisationMember` | `domain.ts:58` | Tenant ↔ user membership with a `MemberRole`. **This is already a relationship record** — internal only. |
| `Organisation` | `domain.ts:76` | The **tenant**. Not an external party. |
| `Funder` | `domain.ts:169` | An external organisation, but modelled as a funding-module-local entity. |
| `Grant.funderContact` | `domain.ts:365` | A free-text string. |
| `Programme.deliveryPartners` | `domain.ts:415` | `string[]`. |
| `OrganisationProfile.trustees` | `domain.ts:105` | `Attested<string[]>`. |
| `OrganisationProfile.pastFunders` | `domain.ts:117` | `Attested<string[]>`. |
| `EvidenceItem.attribution` | `domain.ts:151` | Free-text person reference on testimonials. |
| `Task` | `domain.ts:509` | Generic, with `relatedType` / `relatedId`. Reusable as-is. |
| `Comment` | `domain.ts:521`, `0001_schema.sql:545` | Generic `targetType` / `targetId`. **Modelled and migrated, but referenced by no UI.** |
| `Notification`, `ActivityEvent`, `AuditEvent` | `domain.ts:531–585` | Shared streams. `ActivityEvent` has no Postgres table (audit §6). |
| `EvidenceLink` | `domain.ts:159` | The existing precedent for a polymorphic edge table. |
| `Application.contributorIds` / `reviewerIds` | `domain.ts:300` | Internal collaboration, expressed as ID arrays. |

### 1.2 Duplicated contact models — the actual problem

Six independent representations of "a person or organisation we know" exist today, none of which can be joined to another:

1. `Funder.contactName` + `Funder.contactEmail` — a person flattened onto an organisation row.
2. `Grant.funderContact: string` — a *different* person field, on a different entity, for the same funder.
3. `Programme.deliveryPartners: string[]` — organisations as bare strings.
4. `OrganisationProfile.trustees: Attested<string[]>` — people as bare strings.
5. `OrganisationProfile.pastFunders: Attested<string[]>` — organisations as bare strings, unlinked to the `funders` table that names the same bodies.
6. `EvidenceItem.attribution: string` — a person as a string.

Consequences today: the funder on `grant-henderson` and the funder on `opp-mentor` are the same real body but share no record beyond `funders.id`; "The Henderson Trust" appears in `profile.pastFunders` as text with no link to `fnd-henderson`; "Leeds City College" exists only as a string inside one programme's array. **Nothing can answer "what's happening with The Henderson Trust?" without a human joining it up.**

This is exactly the sprawl the brief forbids. The remedy is not five more contact tables; it is one canonical model with contextual roles.

### 1.3 What is genuinely absent

Person (external), external organisation, relationship, relationship role, interaction, communication, conversation, message, meeting, commitment, decision, calendar, donation, campaign, partnership, event, form, survey, portal, introduction, consent, communication preference, identity resolution, duplicate detection, activity projection.

---

## 2. Canonical model

### 2.1 Naming

The brief says `tenantId`. This repository's tenant column is `organisation_id` everywhere, and the RLS helpers `is_org_member(org uuid)` / `org_has_role()` are built on it. Introducing a second name for the same concept would fracture the isolation model, so **`organisationId` remains the tenant key**, and the external party is named `ExternalOrganisation`. The distinction the brief draws (§4) is preserved; only the label differs.

### 2.2 Shape

```text
                     PERSON ◄──── ContactPoint (email / phone, multiple, verified)
                        │
                        │ primaryExternalOrganisationId
                        ▼
       ┌──────── EXTERNAL ORGANISATION ────────┐
       │                                        │
       └────────────► RELATIONSHIP ◄────────────┘
                        │  status · roles[] · owner · tags
                        │
        ┌───────────────┼────────────────┬──────────────┐
        ▼               ▼                ▼              ▼
   Interaction     Commitment      RelationshipLink    Task
   (typed, dated)  (we_owe /       (→ any Mission     (existing
                    they_owe)       Graph entity)      primitive)
```

`RelationshipLink` is the Mission-Graph edge, and is the concrete first instance of the `Relation` primitive foreshadowed in `PEGASUS_TARGET_ARCHITECTURE.md` §4. Strong, high-traffic edges stay as typed foreign keys (relationship → funder → grant); the semantically varied ones (relationship → programme as delivery partner, relationship → evidence as evaluator) go through the link table.

### 2.3 Person

`Person` is tenant-owned, distinct from `User` (internal, global, authenticates). Multiple emails and phones are `ContactPoint[]` — each with `primary`, `label` and a `VerificationState`, reusing the existing trust vocabulary rather than inventing a second one.

**Data minimisation is a modelling decision, not a policy note.** There is deliberately no date of birth, no address, no household, no wealth field, no inferred-interest field. Adding any of those requires a documented lawful basis first.

### 2.4 External organisation

Sixteen types (`funder`, `foundation`, `charity`, `ngo`, `social_enterprise`, `corporate`, `government`, `local_authority`, `university`, `research_institution`, `delivery_partner`, `supplier`, `consultancy`, `community_organisation`, `network`, `other`).

**Type is descriptive, not exhaustive of the relationship.** A university that funds, delivers and evaluates carries `type: "university"` and roles `["funder", "delivery_partner", "evaluator"]`. Types never gate behaviour; roles do.

### 2.5 Relationship and roles

```ts
interface Relationship {
  id; organisationId;
  personId?; externalOrganisationId?;   // exactly one of the two
  ownerId?;                              // internal user who owns it
  status: "prospect" | "active" | "dormant" | "former" | "archived";
  roles: RelationshipRole[];
  startedAt?; nextAction?; nextActionAt?;
  healthOverride?: { state; reason; setBy; setAt };
  tags: string[]; notes?;
  audit;
}
```

Roles are an **open taxonomy**: `type RelationshipRole = KnownRelationshipRole | (string & {})`. Seventeen known roles ship with labels and families; a tenant-specific role is a string, not a migration. No role is ever a boolean column.

**`lastInteractionAt` is deliberately not stored.** It is derived from `Interaction` rows. A stored copy is a second source of truth that goes stale the moment an interaction is edited or imported out of order.

### 2.6 Interaction

One generic entity for every contact event: `email | meeting | call | message | event | introduction | note | proposal | visit | other`, with `direction` (`inbound` / `outbound` / `internal`), `channel`, participants (people, external organisations, internal users) and `links: EntityReference[]` into the Mission Graph.

`source` records how the record arrived (`manual` / `imported` / `provider_sync`), which is what makes idempotent email sync possible later without a schema change.

### 2.7 Commitment

Deliberate divergence from the brief: **`status` is `open | completed | cancelled`; `overdue` is derived**, not stored. A stored `overdue` requires a scheduled job to stay true and is wrong between runs. `commitmentState(commitment, now)` computes it deterministically. Commitments created from AI extraction carry `confirmedBy` — unconfirmed suggestions are never organisational commitments (§57).

### 2.8 Timeline — a projection, never a copy

`buildRelationshipTimeline()` is a pure function over already-fetched, tenant-scoped domain records. It emits `TimelineEvent[]`, each carrying `source: EntityReference` back to the record it was projected from. **No timeline table exists and none is planned.** Grant awards, payments, application submissions, report submissions, deliverables, commitments and interactions all project; none is duplicated.

---

## 3. Migration strategy

Additive and reversible. No existing table is dropped, no existing field is removed in Phase 1.

| Step | Change | Phase |
|---|---|---|
| 1 | New tables alongside the existing ones; `funders.external_organisation_id` nullable FK | **1 (done)** |
| 2 | Read paths prefer the canonical record, fall back to the legacy field | **1 (done)** |
| 3 | Backfill: one `ExternalOrganisation` per `Funder`; `Funder.contactName/Email` → `Person` + `ContactPoint` | 2 |
| 4 | `Programme.deliveryPartners: string[]` → `RelationshipLink` rows, string array retained as a display fallback | 8 |
| 5 | `profile.trustees` / `profile.pastFunders` → `Person` / `ExternalOrganisation` with `Attested` provenance preserved | 12 |
| 6 | `Grant.funderContact` → resolved contact on the funder relationship; column deprecated, not dropped | 6 |
| 7 | Legacy columns dropped only once every read path is migrated and a full cycle has passed | later |

Backfill is **never automatic merging**. Step 3 creates one external organisation per funder row; if two funder rows name the same body, they surface as duplicate *candidates* for a human (§65), they do not merge.

---

## 4. Communications architecture

One platform. No per-module messaging.

```text
Conversation ──┬── Participant  (person | external organisation | internal user)
               ├── Message ──── Attachment → existing Document / Evidence store
               └── context: EntityReference   ← what the conversation is about
CommunicationChannel: internal | email | sms | whatsapp | teams | slack | other
```

A `Conversation` is anchored to a Mission Graph entity by `EntityReference`. The internal conversation on a programme, the reviewer discussion on an application answer and a funder email thread are the **same entity with different channels and different participant kinds**. That is the whole design: the advantage of Pegasus collaboration is context, not chat features.

Messages carry mentions, replies (`replyToId`), attachments, entity references and edit history. Task creation from a message writes a normal `Task` with `relatedType`/`relatedId` — no parallel task system inside Communications (§22).

### 4.1 Provider boundary

Declared in `src/server/communications/provider.ts` (interfaces only in Phase 1):

```ts
interface CommunicationProvider {
  readonly id: string;
  readonly capabilities: CommunicationCapability[];
  connect(...): Promise<ProviderConnection>;
  disconnect(...): Promise<void>;
  sync(...): Promise<SyncResult>;
  send?(...): Promise<SendResult>;
}
interface EmailProvider extends CommunicationProvider { listMessages; getThread; reply; }
```

**No provider identifier ever enters a core entity.** Gmail message IDs, Microsoft Graph IDs and thread IDs live in a separate `provider_message_map` keyed by `(connectionId, providerMessageId)` — which is also the idempotency key for sync (§63).

### 4.2 Sync pipeline

```text
Provider → Sync Job → Normalisation → Identity Resolution → Relationship Matching
        → Conversation → Mission Graph Association (suggested, human-confirmed)
```

Idempotent (unique `(connection_id, provider_message_id)`), observable (job rows with counts and errors), retryable (durable cursor per connection). Ambiguous associations are **suggested with a confidence and a source, never silently attached** (§13).

### 4.3 Identity resolution

Implemented deterministically in Phase 1 (`src/lib/logic/relationship-identity.ts`) because email sync depends on it being trustworthy first:

| Signal | Confidence | Auto-apply |
|---|---|---|
| Exact normalised email match | high | yes |
| Confirmed user↔provider identity mapping | high | yes |
| Email domain ↔ organisation website domain | medium | suggest only |
| Name similarity | low | **never** |

`findDuplicateCandidates()` returns candidates with reasons and `autoMergeAllowed: false` unconditionally. "Comic Relief" / "Comic Relief UK" / "Comic Relief Ltd" surface for a human; they never merge themselves. Merge preserves references by rewriting foreign keys and recording a `merged_into` tombstone.

---

## 5. Collaboration architecture

Contextual conversation is a tab on Mission Graph entities (`Programme`, `Application`, `Grant`, `Report`, `Answer`, `Evidence`, `Relationship`), backed by the same `Conversation`/`Message` pair. The existing `comments` table is the migration target for `Message` — it already has `target_type`/`target_id` and RLS.

Mentions resolve to `User` (internal) or `Person` (external, only where an external participant is explicitly authorised through a portal). Mentioning generates a `Notification` through the existing notification path.

---

## 6. Donor and fundraising architecture (Phase 7)

Shared primitives, distinct domain concepts (§68):

```text
shared:   Person · ExternalOrganisation · Relationship · Interaction · Conversation · Commitment
distinct: Donation · Campaign · Appeal · Pledge · RecurringGift   |   Grant · Application · FundingOpportunity
```

`Donation → FinancialTransaction → Fund → Programme → Impact` — donations are never a standalone fundraising total. Reconciliation compares a donation to a matched transaction and reports `reconciled` / `unmatched` / `discrepancy` deterministically.

**Jurisdiction-specific extensions, not core fields.** Gift Aid is `donation_tax_relief_uk` (declaration state, date, evidence reference), keyed by donation, loaded only where `jurisdiction = 'UK'`. The core `Donation` has no `giftAid` column.

**Ethical limits are structural.** Donor intelligence answers questions from *recorded relationship and engagement facts* — who gave, to what, when, what we sent them, what they told us. There is no wealth screening, no propensity model, no inference of health, religion, politics or any other special-category characteristic, and no psychological profiling. This is enforced by the absence of the fields, not by prompt instructions.

---

## 7. Partnership architecture (Phase 8)

`Partnership` composes existing primitives rather than duplicating them: participating organisations and people (relationships), purpose, programmes (links), funding (grants), agreement (document), commitments, activities, outputs, outcomes, meetings, risks. Partnership intelligence answers "which partners have open commitments / no recent activity / worked on successful applications" from those records, with the supporting rows named in the answer.

---

## 8. Relationship intelligence

### 8.1 Health — explainable, never a mystery score

Five states: `active`, `established`, `developing`, `dormant`, `needs_attention`. Computed by ordered deterministic rules in `src/lib/logic/relationship-health.ts` from: overdue commitments, days since last interaction, active funding, historical funding count, upcoming meetings, next-action date, relationship status. Every state returns `signals[]` — label, detail, effect — and a human may override with a required reason.

There is deliberately **one** measure. The brief mentions both "strength" and "health"; two scores would compete and neither would be trusted. Strength signals (recency, frequency, active funding, historical funding, open commitments) are inputs to health, and are surfaced individually.

### 8.2 Brief — assembly, not generation

`buildRelationshipBrief()` is deterministic. It assembles history, funding, current grants, applications, commitments, communications and suggested discussion points from the graph. Every line carries `sources: EntityReference[]`. What is **missing** is stated explicitly (`missing[]`) rather than smoothed over. AI's role, later, is to render this assembled brief as prose — never to supply the facts.

### 8.3 AI boundaries

| Pegasus may | Pegasus must not, without authorised human action |
|---|---|
| Prepare, draft, suggest, summarise, recommend | Send, promise, commit, agree, submit |

Communication provenance records context used, relationship/grant/programme/evidence data used, prompt version, provider and model, human edits, sender, approver and sent timestamp. Extracted commitments require confirmation before becoming organisational commitments.

---

## 9. Privacy, consent and permissions

### 9.1 Consent

`ConsentState` records `basis` (`consent | legitimate_interest | contract | legal_obligation | not_recorded`), `source`, `recordedAt`, `reviewDueAt`, `jurisdiction`, `evidenceRef`. `not_recorded` is the honest default — it is not "consent".

`CommunicationPreferences` separates the lawful bases that actually differ: operational contact, marketing, and fundraising are independent flags, plus `doNotContact` as a hard stop and `preferredChannel`. There is no single global consent boolean, because there is no single jurisdiction.

### 9.2 Permissions

Added to the existing capability model: `relationships:view`, `relationships:manage`, `communications:view`, `communications:send`, `commitments:manage`, `meetings:manage`, `donors:view`, `donors:manage`, `partnerships:manage`.

`trustee_reviewer` gets view-only. `donors:*` is granted to `owner`/`administrator`/`funding_lead` only — donor records are the most sensitive personal data in the system. Field-level restriction of donor giving history is designed (a `sensitive` projection stripped in the repository, not the UI) and lands with Phase 7.

Unlike the pre-existing capabilities — which the audit correctly called decorative — **the relationship capabilities are enforced in the server actions that ship with Phase 1.**

### 9.3 Tenant isolation

Every new table carries `organisation_id`, is filtered in the adapter *and* protected by RLS, and is covered by the two-tenant isolation suite. Communication content is the highest-consequence leak in the product; it is tested as such.

---

## 10. Mission Graph relationships

```text
Relationship ──funds──────────► Grant ──► Programme ──► Outcome ──► Evidence
      │  ──applies_via────────► Application ──► FundingOpportunity
      │  ──delivers_with─────► Programme
      │  ──evaluates─────────► Programme / Evidence
      │  ──owes / is_owed────► Commitment ──► Task
      │  ──interacted────────► Interaction ──► any EntityReference
      └──introduced_by───────► Person
```

`EntityReference { type, id, label? }` is introduced in `src/types/domain.ts` as a shared primitive with an `EntityType` union covering both existing and planned entities. This is what makes the future relationship network (§38) renderable without a data migration — the edges are being recorded now.

---

## 11. Integration boundaries

| Domain | Pegasus owns | Provider executes |
|---|---|---|
| Relationships, commitments, notes, meetings, briefs | ✅ native | — |
| Contextual conversation | ✅ native | — |
| Email | thread association, drafting, history, provenance | Microsoft 365 / Gmail delivery |
| Calendar | deadlines, meetings, projections | Google / Outlook sync |
| Bulk email | audience, campaign, message, outcomes | Mailchimp-class provider |
| Video, accounting, payments, document editing | context and links | specialist tool |

The rule from §60: Pegasus owns the organisational context even when another provider performs specialised execution.

---

## 12. Implementation phases

| Phase | Scope | State |
|---|---|---|
| **1 — Relationship foundation** | Person, external organisation, relationship, roles, interaction, commitment, Mission Graph links, timeline projection, health, identity resolution, permissions, RLS, seed, relationship + person pages, funder/programme/Mission-Control surfaces | ✅ **Implemented** |
| 2 — Relationship experience | Search, activity stream, funder backfill, merge workflow UI | planned |
| 3 — Collaboration | Conversations, messages, mentions on Mission Graph entities | planned |
| 4 — Meetings | Meeting entity, notes, preparation, follow-ups, extraction with confirmation | planned |
| 5 — Email | Provider implementations, sync, association, reply/send, audit | planned |
| 6 — Relationship intelligence | AI-rendered briefs, next actions, Mission Control depth | planned |
| 7 — Donor management | Donation, campaign, stewardship, finance reconciliation, jurisdiction extensions | planned |
| 8 — Partnerships | Partnership records, agreements, programme connections | planned |
| 9 — Calendar | Unified calendar projection, external sync | planned |
| 10 — Forms / surveys / events | Structured intake into the Mission Graph, survey → indicator | planned |
| 11 — Portals | Trustee, partner, funder — explicit scoped access | planned |
| 12 — Advanced intelligence | Cross-domain recommendations, network view, organisational memory | planned |

**Email is not built before the core relationship model is trustworthy** (§94).

---

## 13. Phase 1 — what was built, and acceptance criteria

The vertical slice mandated by §94:

```text
External Organisation → Person → Relationship → Interaction → Task / Commitment
                      → Unified Timeline → Relationship Page
```

| # | Criterion | State |
|---|---|---|
| 1 | Canonical `Person`, `ExternalOrganisation`, `Relationship`, `RelationshipRole`, `Interaction`, `Commitment`, `RelationshipLink`, `EntityReference` in the domain model | ✅ |
| 2 | Repository interface is async and `RequestContext`-first, like every other repository | ✅ |
| 3 | Tenant isolation holds on every new read and write, proven by a two-tenant suite | ✅ |
| 4 | Timeline is a projection with per-event source provenance; no timeline table | ✅ |
| 5 | Relationship health is deterministic, returns signals, supports human override | ✅ |
| 6 | Identity resolution and duplicate detection never auto-merge on name similarity | ✅ |
| 7 | Capabilities enforced in the new server actions | ✅ |
| 8 | Postgres schema + RLS for every new table | ✅ |
| 9 | Funder ↔ external organisation bridged without rewriting the funding module | ✅ |
| 10 | Grant, programme and Mission Control surfaces read shared relationship data | ✅ |
| 11 | Seeded demo data answers "what's happening with The Henderson Trust?" end to end | ✅ |
| 12 | Provider boundary declared; no provider implementation, no provider IDs in core entities | ✅ |

### Deliberate divergences from the brief

| Brief | Implemented | Why |
|---|---|---|
| `tenantId` | `organisationId` | The tenant key and RLS helpers already exist under that name; a second name would fracture isolation. |
| `Commitment.status` includes `overdue` | derived from `dueAt` + status | A stored flag needs a cron and is wrong between runs. |
| `Relationship.lastInteractionAt` stored | derived from interactions | Avoids a second source of truth. |
| Separate strength *and* health | one health measure with named signals | Two competing scores are trusted less than one explained state. |

### Not in Phase 1

Conversations and messages, meetings, calendar, email providers, donations, campaigns, partnerships, events, forms, surveys, portals, the visual network, merge execution UI, AI-drafted communications. All are designed above; none is stubbed in code beyond the declared provider interfaces.
