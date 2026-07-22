# Data Model

The domain model is defined in `src/types/domain.ts` and realised as PostgreSQL
tables in `supabase/migrations/0001_schema.sql`, with Row Level Security in
`0002_rls.sql` and demonstration data in `supabase/seed.sql`.

## Conventions
- **UUID** primary keys (`gen_random_uuid()`).
- Every organisation-owned record carries `organisation_id`.
- Audit stamps: `created_at`, `updated_at`, `created_by` (and `archived_at` for
  soft delete) where appropriate.
- Foreign keys with sensible `on delete` behaviour; indexes on `organisation_id`
  and common lookups (stage, deadline, target links).
- Enum types for roles, verification states, pipeline stages, application and
  answer statuses, grant/programme/report statuses and confidence.
- Attested profile fields are stored as `jsonb` of
  `{ value, verification, source, last_verified_at }`.

## Entities
People and org: `users`, `organisations`, `organisation_members`,
`organisation_profiles`, `organisation_documents`.

Funding: `funders`, `funding_opportunities`,
`opportunity_eligibility_criteria`, `opportunity_questions`,
`saved_opportunities`.

Fit: `fit_assessments`, `fit_assessment_factors`.

Applications: `applications`, `application_questions`, `application_answers`,
`application_answer_versions`, `application_reviews`.

Grants: `grants`, `grant_payments`, `grant_conditions`, `grant_deliverables`,
`grant_reports`.

Programmes and outcomes: `programmes`, `programme_grants`, `activities`,
`outputs`, `outcomes`, `indicators`, `indicator_measurements`.

Evidence: `evidence_items`, `evidence_links` (polymorphic to programme, grant,
outcome, application answer or report).

Impact: `impact_reports`, `impact_report_sections`.

Operational and trust: `tasks`, `comments`, `notifications`, `ai_generations`,
`audit_events`.

## Key relationships
- An organisation has many members (with a role), one profile, many funders and
  opportunities.
- An opportunity has many questions and eligibility criteria and one fit
  assessment (with many factors).
- An application belongs to an opportunity and has many answers; each answer has
  many versions and carries provenance for its last AI draft.
- A successful application converts into a grant; a grant has payments,
  deliverables, conditions and reports.
- A programme links to many grants and has outcomes; each outcome has indicators;
  each indicator has measurements.
- Evidence links to programmes, grants, outcomes, answers and reports.
- An impact report references included indicators and evidence and has sections.

## Verification and trust
`verification_state` (`verified`, `provided`, `ai_extracted`, `needs_review`,
`outdated`) is shown on every profile field and evidence item. Indicators carry
a `confidence` level. `ai_generations` records feature, model, prompt version,
user, input references, an output preview and approval status. `audit_events`
is append-only.

## Row Level Security
Isolation is by organisation membership. Helper functions:
- `is_org_member(org uuid)` — active membership check.
- `org_has_role(org uuid, roles member_role[])` — role check.

Policies:
- `users`: read self and people who share an organisation; update self.
- `organisations`: members read; owners/administrators update.
- `organisation_members`: members read; owners/administrators manage.
- All standard organisation-owned tables: full access for active members
  (`is_org_member(organisation_id)` on `using` and `with check`). Column- and
  role-level restrictions are enforced in the application permission layer; RLS
  guarantees organisation isolation.
- `audit_events`: append-only (select + insert only).

The `store.test.ts` unit test verifies that every seeded organisation-owned
record carries the organisation id, mirroring the isolation RLS enforces in
live mode.
