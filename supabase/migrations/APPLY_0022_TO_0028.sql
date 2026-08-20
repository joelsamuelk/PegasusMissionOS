-- =====================================================================
-- Pegasus Mission OS: migrations 0022 to 0028, consolidated
--
-- Generated from supabase/migrations/. Run this once in the Supabase SQL
-- editor. It brings a database at 0021 up to 0028.
--
-- WHAT IT DOES
--   0022  Reporting engine: immutable versions and the snapshots that make a
--         published report stop moving when its data changes
--   0023  Automation: domain events, a rules engine, runs recorded whether or
--         not they matched, and a job table for time-based triggers
--   0024  Forms: field-level sensitivity with no default, consent recorded
--         verbatim, and the mappings that turn a submission into graph records
--   0025  Finance runtime: statement imports held for review before posting,
--         and an opening balance on funds
--   0026  Portals: a separate external identity model, per-record grants
--   0027  Fundraising: donations that carry no amount, only a transaction
--   0028  Integrations: provider identifiers confined to their own table
--
-- SAFE TO RE-RUN. Every statement is guarded: types check pg_type, tables and
-- columns use IF NOT EXISTS, constraints check pg_constraint, and policies and
-- triggers are dropped before being created. If it fails partway, fix the
-- cause and run the whole thing again.
--
-- ADDITIVE ONLY. No table is dropped, no column is removed, no row is touched.
-- The one change to an existing table is `funds.opening_balance_minor_units`,
-- a nullable column added in 0025.
--
-- ORDER MATTERS, and more than last time. 0024 creates the `forms` table and
-- the `submission_status` type; 0026 uses that type and 0027 references that
-- table. 0027 references `financial_transactions` and `funds` from 0018. Do
-- not reorder or run in pieces.
--
-- AFTERWARDS: tell Claude, and it will verify over the REST API that every
-- table, constraint and policy landed.
-- =====================================================================

-- =====================================================================
-- 0022_reporting_engine.sql
-- Reporting engine: versions, snapshots, approvals, requirements, ingestion
-- =====================================================================

-- Pegasus Mission OS: the reporting engine.
--
-- MG-5.
--
-- The brief's rule for this phase is one sentence and every table below exists
-- to keep it: *a published report cannot silently change when underlying live
-- data changes*. Everything else here — approvals, contributions, per-section
-- requirements — is ordinary record-keeping. Versions and snapshots are the
-- part that makes a published report defensible.
--
-- Four of the brief's ten entity names are deliberately absent, because they
-- already exist under other names and a second representation of the same edge
-- has to be kept consistent with the first:
--
--   ReportSection      -> impact_report_sections
--   ReportTemplate     -> report_definitions, extended below
--   ReportClaim        -> impact_report_sections.claim_ids + claim_usages
--   ReportEvidenceLink -> relations, kind = 'evidences'

-- ---------------------------------------------------------------------------
-- Versions
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_version_reason') then
    create type report_version_reason as enum (
      'draft_saved',
      'submitted_for_review',
      'approved',
      'published',
      -- Distinct from 'revision' on purpose. A revision is the document moving
      -- forward; a correction is an admission that a published figure was wrong.
      -- Collapsing them lets the second hide inside the first.
      'correction',
      'revision'
    );
  end if;
end $$;

create table if not exists report_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  report_id uuid not null references impact_reports(id) on delete cascade,

  version_number integer not null,
  reason report_version_reason not null,
  status report_status not null,

  -- The sections exactly as they stood, stored rather than re-rendered. A
  -- version that regenerated itself from live data would defeat its own
  -- purpose the first time a claim was superseded.
  sections jsonb not null default '[]'::jsonb,

  snapshot_id uuid,
  note text,

  created_by uuid references users(id),
  created_at timestamptz not null default now(),

  constraint report_versions_number_positive check (version_number >= 1),
  unique (report_id, version_number)
);

create index if not exists report_versions_report_idx
  on report_versions (organisation_id, report_id, version_number desc);

-- ---------------------------------------------------------------------------
-- Report templates
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_template_origin') then
    create type report_template_origin as enum ('built_in', 'cloned', 'ingested');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_section_type') then
    create type report_section_type as enum (
      'narrative', 'claims', 'metrics', 'table', 'chart', 'evidence',
      'financial', 'appendix'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_type') then
    create type report_type as enum (
      'impact', 'funder', 'grant', 'programme', 'trustee', 'board_pack',
      'annual', 'finance'
    );
  end if;
end $$;

-- `report_definitions` is created here rather than altered. The entity has
-- existed in the domain model since reporting was built, but only ever in the
-- in-memory store: no migration gave it a table, so the Postgres side of
-- reporting has been templateless. Ingested funder templates are the feature
-- that makes that gap load-bearing, so the table lands with the columns that
-- need it rather than in a migration of its own.
create table if not exists report_definitions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  name text not null,
  type report_type not null,
  -- Section definitions are a shape the application owns, not a relation:
  -- nothing joins to a section key, and every read wants all of them at once.
  sections jsonb not null default '[]'::jsonb,

  origin report_template_origin not null default 'built_in',
  funder_id uuid references funders(id) on delete set null,
  source_document_id uuid references documents(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_by uuid references users(id),
  archived_at timestamptz
);

create index if not exists report_definitions_org_idx
  on report_definitions (organisation_id);
create index if not exists report_definitions_funder_idx
  on report_definitions (funder_id) where funder_id is not null;

drop trigger if exists report_definitions_set_updated_at on report_definitions;
create trigger report_definitions_set_updated_at
  before update on report_definitions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- `impact_reports` catches up with its own model.
--
-- Six fields on `ImpactReport` have never had a column: the report's type, the
-- template it was built from, its owner, and the three id arrays naming who
-- contributes, reviews and approves. They have worked in the in-memory adapter
-- and evaporated in Postgres.
--
-- `type` defaults to 'impact' because that is what every existing row is: the
-- built-in template was the only one available before this migration.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Sections carry their type and their citations.
--
-- `ImpactReportSection.claimIds` is the mechanism behind "figures are
-- references to immutable claims, never copied values" -- and it has had no
-- column, so in Postgres every section cited nothing. A published report could
-- not resolve what its numbers were written from, which is the property the
-- whole claims layer exists to provide.
--
-- `type` defaults to 'narrative', matching the fallback the reader used while
-- the column was missing.
-- ---------------------------------------------------------------------------
alter table impact_report_sections
  add column if not exists type report_section_type not null default 'narrative',
  add column if not exists claim_ids uuid[] not null default '{}';

alter table impact_reports
  add column if not exists type report_type not null default 'impact',
  add column if not exists definition_id uuid references report_definitions(id) on delete set null,
  add column if not exists owner_id uuid references users(id),
  add column if not exists contributor_ids uuid[] not null default '{}',
  add column if not exists reviewer_ids uuid[] not null default '{}',
  add column if not exists approver_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Snapshots
-- ---------------------------------------------------------------------------

create table if not exists report_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  report_id uuid not null references impact_reports(id) on delete cascade,
  version_id uuid references report_versions(id) on delete cascade,

  taken_at timestamptz not null default now(),

  -- Every figure the version cited, with the claim it came from and the value
  -- as rendered. `rendered_value` is what makes drift computable: comparing a
  -- report against live data requires knowing what the report actually said,
  -- and a claim id alone does not say that once the claim is superseded.
  figures jsonb not null default '[]'::jsonb,

  evidence_ids uuid[] not null default '{}',
  indicator_values jsonb not null default '[]'::jsonb,
  claim_ids uuid[] not null default '{}'
);

create index if not exists report_snapshots_report_idx
  on report_snapshots (organisation_id, report_id, taken_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'report_versions_snapshot_fk') then
    alter table report_versions
  add constraint report_versions_snapshot_fk
  foreign key (snapshot_id) references report_snapshots(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Contributions and approvals
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_contributor_role') then
    create type report_contributor_role as enum (
      'author', 'reviewer', 'approver', 'data_owner'
    );
  end if;
end $$;

create table if not exists report_contributors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  report_id uuid not null references impact_reports(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role report_contributor_role not null,

  -- Null means the whole report. A section assignment is what turns "who owes
  -- me the finance section?" from a conversation into a query.
  section_key text,

  invited_at timestamptz not null default now(),
  completed_at timestamptz,

  unique (report_id, user_id, role, section_key)
);

create index if not exists report_contributors_report_idx
  on report_contributors (organisation_id, report_id);

do $$ begin
  if not exists (select 1 from pg_type where typname = 'approval_decision') then
    create type approval_decision as enum ('approved', 'changes_requested');
  end if;
end $$;

create table if not exists report_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  report_id uuid not null references impact_reports(id) on delete cascade,

  -- Approval is of a version, never of a report. Approving "the report" is
  -- meaningless once it can be edited afterwards, which is precisely the
  -- failure this whole migration exists to prevent.
  version_id uuid not null references report_versions(id) on delete cascade,

  user_id uuid not null references users(id) on delete cascade,
  decision approval_decision not null,
  comment text,
  decided_at timestamptz not null default now(),

  -- An unexplained rejection is not actionable. Approval may be silent;
  -- refusal may not.
  constraint report_approvals_refusal_needs_reason check (
    decision = 'approved' or (comment is not null and length(btrim(comment)) > 0)
  )
);

create index if not exists report_approvals_report_idx
  on report_approvals (organisation_id, report_id, decided_at desc);

-- ---------------------------------------------------------------------------
-- What a section needs
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_requirement_kind') then
    create type report_requirement_kind as enum (
      'narrative', 'indicator', 'financial', 'evidence', 'claim', 'attachment'
    );
  end if;
end $$;

create table if not exists report_requirements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- Owned by a template, so cloning a template clones its requirements.
  definition_id uuid not null references report_definitions(id) on delete cascade,
  section_key text not null,
  kind report_requirement_kind not null,

  -- The funder's question, verbatim where it was ingested.
  prompt text not null,
  guidance text,
  word_limit integer,

  -- What specifically is wanted, once a human has mapped it. Polymorphic for
  -- the same reason `relations` is: the target may be an indicator, an
  -- outcome, a fund or a claim, and none of those is a foreign key here.
  target_type text,
  target_id uuid,

  evidence_types text[] not null default '{}',

  required boolean not null default true,
  "order" integer not null default 0,

  source_type text,
  source_id uuid,

  -- A requirement lifted from a PDF is a *reading* of that PDF. Reading a
  -- funder's template wrongly is exactly the error that costs an organisation
  -- a grant, so extraction is a candidate until a person confirms it.
  verification verification_state not null default 'needs_review',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_requirements_definition_idx
  on report_requirements (organisation_id, definition_id, section_key, "order");

drop trigger if exists report_requirements_set_updated_at on report_requirements;
create trigger report_requirements_set_updated_at
  before update on report_requirements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Template ingestion
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'template_ingestion_status') then
    create type template_ingestion_status as enum (
      'parsing', 'awaiting_review', 'accepted', 'rejected', 'failed'
    );
  end if;
end $$;

create table if not exists report_template_ingestions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  definition_id uuid references report_definitions(id) on delete set null,
  document_id uuid,
  file_name text,
  funder_id uuid references funders(id) on delete set null,

  status template_ingestion_status not null default 'parsing',

  -- What the parser found, before anyone confirmed it. Held here rather than
  -- written straight into report_requirements, so an unreviewed extraction can
  -- never be mistaken for an approved template.
  candidates jsonb not null default '[]'::jsonb,
  detected_due_dates date[] not null default '{}',

  -- Why parsing failed, or what it could not read. Never silently empty: a
  -- template that yielded three questions out of twelve must say so.
  notes text[] not null default '{}',

  created_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz
);

create index if not exists report_template_ingestions_org_idx
  on report_template_ingestions (organisation_id, status, created_at desc);

comment on column report_definitions.origin is
  'A built-in template is Pegasus''s; an ingested one is a funder''s and '
  'carries the authority of the document it came from. Readiness treats an '
  'unmet ingested requirement more seriously than an unmet built-in section.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table report_versions enable row level security;
alter table report_snapshots enable row level security;
alter table report_contributors enable row level security;
alter table report_approvals enable row level security;
alter table report_requirements enable row level security;
alter table report_template_ingestions enable row level security;
alter table report_definitions enable row level security;

drop policy if exists report_versions_member_all on report_versions;
create policy report_versions_member_all on report_versions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists report_snapshots_member_all on report_snapshots;
create policy report_snapshots_member_all on report_snapshots for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists report_contributors_member_all on report_contributors;
create policy report_contributors_member_all on report_contributors for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists report_requirements_member_all on report_requirements;
create policy report_requirements_member_all on report_requirements for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists report_template_ingestions_member_all on report_template_ingestions;
create policy report_template_ingestions_member_all on report_template_ingestions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists report_definitions_member_all on report_definitions;
create policy report_definitions_member_all on report_definitions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Approvals are append-only for the same reason audit events are: an approval
-- that can be edited or deleted is not evidence that anyone approved anything.
drop policy if exists report_approvals_member_read on report_approvals;
create policy report_approvals_member_read on report_approvals for select
  using (is_org_member(organisation_id));
drop policy if exists report_approvals_member_insert on report_approvals;
create policy report_approvals_member_insert on report_approvals for insert
  with check (is_org_member(organisation_id));

comment on table report_versions is
  'Immutable points in a report''s life. A published report resolves to the '
  'version and snapshot it was published with, however many times the '
  'underlying claims are superseded afterwards.';
comment on table report_snapshots is
  'What a version cited, frozen. Without rendered_value, "the report says 58%" '
  'and "the indicator says 61%" cannot be reconciled.';



-- =====================================================================
-- 0023_automation.sql
-- Automation: domain events, automations, runs, steps, failures, jobs
-- =====================================================================

-- Pegasus Mission OS: domain events, automation and scheduling.
--
-- MG-6. Structural change SC7.
--
-- The acceptance test for this phase is a sentence about what must *not* be
-- built: *the organisation should be able to automate routine mission
-- operations without creating opaque autonomous agents*. Three choices in this
-- schema are what make that true rather than aspirational.
--
--   1. `automations.condition` is a **typed tree in jsonb**, not an expression
--      string. There is nothing here for a tenant to inject code into, because
--      there is no interpreter for code.
--   2. `automation_runs` are written **whether or not the automation matched**,
--      and carry the condition trace. "Why did nothing happen?" is a more
--      common question than "why did this happen?", and a system that records
--      only its successes cannot answer it.
--   3. `automation_steps.status` distinguishes `awaiting_approval` from
--      `planned`. Invariant 7 — human approval for external action — is a row
--      state, not a code path somebody has to remember.
--
-- No queue infrastructure. `scheduled_jobs` plus an in-process runner is the
-- whole scheduler. A charity operating system reminding somebody about a
-- report in thirty days does not need a broker, and adding one would be the
-- largest operational cost in the product for the smallest capability.

-- ---------------------------------------------------------------------------
-- Domain events
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'domain_event_kind') then
    create type domain_event_kind as enum (
      'record.created', 'record.changed', 'record.archived',
      'grant.state_changed', 'grant.health_changed', 'deliverable.overdue',
      'report.state_changed', 'report.due_soon', 'requirement.due_soon',
      'indicator.updated', 'evidence.linked', 'evidence.outdated',
      'payment.received', 'transaction.imported', 'runway.changed',
      'relationship.health_changed', 'opportunity.discovered', 'form.submitted',
      'date.approaching', 'deadline.passed'
    );
  end if;
end $$;

-- Deliberately *not* audit_events. `audit_events` records what a person did
-- and is evidence for a human reader; this records what became true and is
-- machinery. Conflating them makes the audit trail unreadable and the
-- automation feed unfilterable.
create table if not exists domain_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  kind domain_event_kind not null,
  subject_type text not null,
  subject_id uuid not null,

  occurred_at timestamptz not null default now(),

  -- The record's addressable fields, flattened. Flat so a condition can read
  -- `grant.health` without the engine walking an arbitrary object.
  facts jsonb not null default '{}'::jsonb,
  previous jsonb,

  actor_id uuid references users(id),
  processed_at timestamptz
);

create index if not exists domain_events_unprocessed_idx
  on domain_events (organisation_id, occurred_at)
  where processed_at is null;
create index if not exists domain_events_subject_idx
  on domain_events (organisation_id, subject_type, subject_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Automations
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'automation_status') then
    create type automation_status as enum ('draft', 'active', 'paused');
  end if;
end $$;

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  name text not null,
  description text,

  trigger jsonb not null,

  -- A typed condition tree, or null for "runs whenever the trigger fires".
  -- Evaluation is three-valued: true, false and unknown. An automation whose
  -- condition cannot be decided does not fire, and records why.
  condition jsonb,

  actions jsonb not null default '[]'::jsonb,

  status automation_status not null default 'draft',

  -- The author's intent. The engine recomputes the answer from the actions
  -- themselves and the computed answer wins, so a mistake here cannot send
  -- anything. Stored because a rule may require approval for reasons the
  -- action catalogue does not know about.
  requires_approval boolean not null default false,

  owner_id uuid references users(id),
  last_run_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  constraint automations_needs_actions check (jsonb_array_length(actions) > 0)
);

create index if not exists automations_active_idx
  on automations (organisation_id, status);

drop trigger if exists automations_set_updated_at on automations;
create trigger automations_set_updated_at
  before update on automations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Runs, steps and failures
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'automation_run_outcome') then
    create type automation_run_outcome as enum (
      'matched',
      'not_matched',
      -- The outcome that separates this engine from a two-valued one. A condition
      -- reading a field nobody has recorded is not false; it is undecided, and the
      -- automation says so instead of quietly never firing.
      'undecidable',
      'awaiting_approval',
      'completed',
      'failed',
      'skipped'
    );
  end if;
end $$;

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  automation_id uuid not null references automations(id) on delete cascade,
  event_id uuid references domain_events(id) on delete set null,

  trigger domain_event_kind not null,
  subject_type text not null,
  subject_id uuid not null,

  outcome automation_run_outcome not null,

  -- Stored rather than re-derived. A run audited six months later must show
  -- what the condition saw at the time, and the records will have moved on.
  condition_trace jsonb,
  explanation text not null,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  approved_by uuid references users(id),
  approved_at timestamptz,

  -- A simulated run writes nothing outside this table. Recording simulations
  -- alongside real runs is what lets "what would this have done last month?"
  -- be answered.
  simulated boolean not null default false
);

create index if not exists automation_runs_automation_idx
  on automation_runs (organisation_id, automation_id, started_at desc);
create index if not exists automation_runs_pending_idx
  on automation_runs (organisation_id, outcome)
  where outcome = 'awaiting_approval';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'automation_step_status') then
    create type automation_step_status as enum (
      'planned', 'awaiting_approval', 'executed', 'skipped', 'failed'
    );
  end if;
end $$;

create table if not exists automation_steps (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references automation_runs(id) on delete cascade,

  "order" integer not null,
  action text not null,
  params jsonb not null default '{}'::jsonb,

  status automation_step_status not null default 'planned',

  result_type text,
  result_id uuid,
  detail text,

  -- Set where a model assisted inside the bounded action. AI never chooses the
  -- action or its target; it may only fill in text within one.
  provenance jsonb,

  executed_at timestamptz,

  unique (run_id, "order")
);

create index if not exists automation_steps_run_idx
  on automation_steps (organisation_id, run_id, "order");

create table if not exists automation_failures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references automation_runs(id) on delete cascade,
  step_id uuid references automation_steps(id) on delete cascade,

  -- Machine-readable, so repeated failures group rather than filling a log
  -- with near-identical sentences.
  code text not null,
  message text not null,
  occurred_at timestamptz not null default now(),

  -- A permission refusal cannot succeed on retry; a provider timeout can.
  -- Storing the distinction stops a retry loop hammering a closed door.
  retryable boolean not null default false
);

create index if not exists automation_failures_run_idx
  on automation_failures (organisation_id, run_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'scheduled_job_kind') then
    create type scheduled_job_kind as enum (
      'scan_dates', 'recompute_signals', 'run_automation', 'send_reminder'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'scheduled_job_status') then
    create type scheduled_job_status as enum (
      'pending', 'running', 'done', 'failed', 'cancelled'
    );
  end if;
end $$;

create table if not exists scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  kind scheduled_job_kind not null,
  subject_type text,
  subject_id uuid,

  run_after timestamptz not null,
  status scheduled_job_status not null default 'pending',

  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text,

  -- The reason this column is not null and is unique. A reminder for the same
  -- requirement at the same horizon must not be created twice because the
  -- scanner ran twice, and the only place that can be guaranteed is on insert.
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,

  unique (organisation_id, dedupe_key)
);

create index if not exists scheduled_jobs_due_idx
  on scheduled_jobs (organisation_id, status, run_after)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table domain_events enable row level security;
alter table automations enable row level security;
alter table automation_runs enable row level security;
alter table automation_steps enable row level security;
alter table automation_failures enable row level security;
alter table scheduled_jobs enable row level security;

drop policy if exists automations_member_all on automations;
create policy automations_member_all on automations for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists automation_steps_member_all on automation_steps;
create policy automation_steps_member_all on automation_steps for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists scheduled_jobs_member_all on scheduled_jobs;
create policy scheduled_jobs_member_all on scheduled_jobs for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Events, runs and failures are the record of what the system did without a
-- person present. They are readable and insertable and never editable, for the
-- same reason audit events are: a run that can be rewritten is not evidence of
-- anything.
drop policy if exists domain_events_member_read on domain_events;
create policy domain_events_member_read on domain_events for select
  using (is_org_member(organisation_id));
drop policy if exists domain_events_member_insert on domain_events;
create policy domain_events_member_insert on domain_events for insert
  with check (is_org_member(organisation_id));
drop policy if exists domain_events_member_mark on domain_events;
create policy domain_events_member_mark on domain_events for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

drop policy if exists automation_runs_member_read on automation_runs;
create policy automation_runs_member_read on automation_runs for select
  using (is_org_member(organisation_id));
drop policy if exists automation_runs_member_insert on automation_runs;
create policy automation_runs_member_insert on automation_runs for insert
  with check (is_org_member(organisation_id));
-- Approval is the one field a person may set after the fact.
drop policy if exists automation_runs_member_approve on automation_runs;
create policy automation_runs_member_approve on automation_runs for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

drop policy if exists automation_failures_member_read on automation_failures;
create policy automation_failures_member_read on automation_failures for select
  using (is_org_member(organisation_id));
drop policy if exists automation_failures_member_insert on automation_failures;
create policy automation_failures_member_insert on automation_failures for insert
  with check (is_org_member(organisation_id));

comment on column automations.condition is
  'A typed condition tree. Three-valued: an automation whose condition cannot '
  'be decided does not fire and records why. There is no expression string '
  'and no interpreter, so there is nothing to inject code into.';
comment on table automation_runs is
  'Written whether or not the automation matched. "Why did nothing happen?" is '
  'the more common question and only a complete run log can answer it.';



-- =====================================================================
-- 0024_forms.sql
-- Forms: forms, versions, fields, submissions, answers, mappings, consent
-- =====================================================================

-- Pegasus Mission OS: forms and data collection.
--
-- MG-7.
--
-- The acceptance test is that a programme survey response becomes a participant
-- interaction, an indicator measurement and a piece of evidence without anybody
-- re-entering it. So `form_submissions` is not the interesting table here.
-- `form_mappings` is: it says what an answer becomes, and without it this is a
-- form builder.
--
-- ---------------------------------------------------------------------------
-- On beneficiaries, and what this migration deliberately does not create
-- ---------------------------------------------------------------------------
--
-- `MISSION_GRAPH_ARCHITECTURE.md` §8 records the absence of a beneficiary
-- entity as a decision, and the expansion plan names this phase as the one
-- most likely to reverse it by accident. Beneficiary intake is in the brief's
-- own list of form purposes.
--
-- What this migration adds: the ability to *collect* intake answers, with a
-- required sensitivity classification on every field, a lawful basis, an
-- enforced retention period and an AI exclusion.
--
-- What it does not add: any table called `beneficiaries`, and any projection
-- from an intake answer into `people`. Those answers stay in
-- `submission_answers`, behind their own capability, and are erased on
-- schedule. Impact continues to be measured through indicators and evidence.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'form_purpose') then
    create type form_purpose as enum (
      'donation', 'volunteer_application', 'beneficiary_intake',
      'programme_registration', 'survey', 'outcome_measurement', 'feedback',
      'grant_application', 'partner_submission', 'evidence_submission',
      'event_registration', 'custom'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'form_field_type') then
    create type form_field_type as enum (
      'text', 'textarea', 'number', 'currency', 'date', 'select', 'multiselect',
      'checkbox', 'radio', 'email', 'phone', 'address', 'file', 'rating', 'scale',
      'consent', 'signature'
    );
  end if;
end $$;

-- Named for the legal category rather than for a feeling about sensitivity,
-- because the legal category is what carries the obligations. `special_category`
-- is UK GDPR Article 9.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'field_sensitivity') then
    create type field_sensitivity as enum (
      'public', 'internal', 'personal', 'special_category'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'form_access') then
    create type form_access as enum ('internal', 'link', 'public');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'form_status') then
    create type form_status as enum ('draft', 'open', 'closed');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'form_version_status') then
    create type form_version_status as enum ('draft', 'published', 'retired');
  end if;
end $$;

create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  name text not null,
  purpose form_purpose not null,
  description text,

  subject_type text,
  subject_id uuid,

  current_version_id uuid,
  access form_access not null default 'internal',
  slug text,
  status form_status not null default 'draft',
  confirmation_message text,

  -- The lawful basis for everything this form collects. Enforced in the
  -- application before publication: a form that cannot say why it is entitled
  -- to ask is a form that should not be asking.
  lawful_basis jsonb,

  -- Required where any field is special category. "Indefinitely" is not a
  -- retention policy, and its absence is the most common way personal data
  -- outlives its purpose.
  retention_days integer,

  rate_limit_per_hour integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  -- A public form must be reachable, and a slug must be unique within a
  -- tenant or two forms answer the same URL.
  constraint forms_public_needs_slug check (access = 'internal' or slug is not null),
  unique (organisation_id, slug)
);

create index if not exists forms_open_idx on forms (organisation_id, status);

drop trigger if exists forms_set_updated_at on forms;
create trigger forms_set_updated_at
  before update on forms for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Versions and fields
-- ---------------------------------------------------------------------------

create table if not exists form_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  form_id uuid not null references forms(id) on delete cascade,

  version_number integer not null,
  status form_version_status not null default 'draft',
  sections jsonb not null default '[]'::jsonb,

  published_at timestamptz,
  published_by uuid references users(id),
  retired_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (form_id, version_number)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'forms_current_version_fk') then
    alter table forms
  add constraint forms_current_version_fk
  foreign key (current_version_id) references form_versions(id) on delete set null;
  end if;
end $$;

create table if not exists form_fields (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  version_id uuid not null references form_versions(id) on delete cascade,

  section_key text not null,
  key text not null,
  label text not null,
  help text,
  type form_field_type not null,
  required boolean not null default false,
  "order" integer not null default 0,

  options jsonb,
  validation jsonb,

  -- Not null and no default. There is no unclassified state: by the time an
  -- answer exists it is too late to decide whether it should have been
  -- collected.
  sensitivity field_sensitivity not null,

  -- The automation engine's typed condition tree, evaluated by the same
  -- three-valued function. A second conditional language would be a second set
  -- of edge cases, drifting apart from the first.
  visible_when jsonb,
  required_when jsonb,

  consent_purpose text,

  unique (version_id, key),

  -- Consent to an unstated purpose is not consent.
  constraint form_fields_consent_needs_purpose check (
    type <> 'consent' or (consent_purpose is not null and length(btrim(consent_purpose)) > 0)
  )
);

create index if not exists form_fields_version_idx
  on form_fields (organisation_id, version_id, section_key, "order");

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'submission_status') then
    create type submission_status as enum (
      'received', 'awaiting_review', 'accepted', 'rejected', 'spam'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'submission_source') then
    create type submission_source as enum ('public', 'link', 'internal', 'import');
  end if;
end $$;

create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  form_id uuid not null references forms(id) on delete cascade,

  -- The exact version answered, never the current one. A submission answers
  -- the form as it stood; resolving it against a form edited afterwards makes
  -- every prior submission unreadable.
  version_id uuid not null references form_versions(id),

  status submission_status not null default 'received',
  source submission_source not null,

  submitted_at timestamptz not null default now(),
  submitted_by uuid references users(id),

  -- Deliberately not an IP address. An IP is personal data under UK GDPR and
  -- keeping one for spam control needs its own lawful basis; a salted,
  -- non-reversible token does the same job for rate limiting.
  source_token text,

  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,

  retain_until timestamptz,

  -- An unexplained rejection is not auditable.
  constraint form_submissions_rejection_needs_reason check (
    status <> 'rejected' or (review_note is not null and length(btrim(review_note)) > 0)
  )
);

create index if not exists form_submissions_form_idx
  on form_submissions (organisation_id, form_id, submitted_at desc);
create index if not exists form_submissions_review_idx
  on form_submissions (organisation_id, status)
  where status = 'awaiting_review';
create index if not exists form_submissions_retention_idx
  on form_submissions (organisation_id, retain_until)
  where retain_until is not null;

create table if not exists submission_answers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  submission_id uuid not null references form_submissions(id) on delete cascade,

  field_key text not null,
  -- Denormalised so an answer stays readable when the field is retired.
  field_label text not null,
  field_type form_field_type not null,
  -- Carried onto the answer, so nothing reading it has to resolve the field
  -- to know whether it may.
  sensitivity field_sensitivity not null,

  value jsonb not null,

  -- Erasure blanks the value and keeps the row. "Somebody submitted this and
  -- the answers were deleted under our retention policy" is a true and useful
  -- statement; deleting the row would make the erasure itself unprovable.
  redacted boolean not null default false,
  redacted_at timestamptz,

  unique (submission_id, field_key)
);

create index if not exists submission_answers_sensitive_idx
  on submission_answers (organisation_id, sensitivity)
  where sensitivity in ('personal', 'special_category');

create table if not exists submission_attachments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  submission_id uuid not null references form_submissions(id) on delete cascade,

  field_key text not null,
  file_name text not null,
  media_type text not null,
  size_bytes bigint not null,
  storage_key text,
  sensitivity field_sensitivity not null,
  uploaded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Mappings: the table that makes this a data collection system
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'mapping_target_kind') then
    create type mapping_target_kind as enum (
      'person', 'external_organisation', 'relationship', 'interaction',
      'indicator_measurement', 'evidence', 'claim', 'consent'
    );
  end if;
end $$;

create table if not exists form_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  form_id uuid not null references forms(id) on delete cascade,

  field_key text not null,
  target mapping_target_kind not null,
  predicate text,
  target_type text,
  target_id uuid,

  -- Defaults true, and the application forces it true for anything that would
  -- replace an existing value. A form answer is an assertion by whoever filled
  -- it in; an assertion is not a correction.
  requires_review boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (form_id, field_key, target)
);

drop trigger if exists form_mappings_set_updated_at on form_mappings;
create trigger form_mappings_set_updated_at
  before update on form_mappings for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------

create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  submission_id uuid not null references form_submissions(id) on delete cascade,
  version_id uuid not null references form_versions(id),

  field_key text not null,
  -- Verbatim from the version that was answered, so the wording somebody
  -- actually agreed to can always be recovered.
  purpose text not null,
  granted boolean not null,
  recorded_at timestamptz not null default now(),

  -- Withdrawal is recorded, never deleted. A deleted consent record cannot
  -- prove that consent was withdrawn.
  withdrawn_at timestamptz
);

create index if not exists consent_records_submission_idx
  on consent_records (organisation_id, submission_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table forms enable row level security;
alter table form_versions enable row level security;
alter table form_fields enable row level security;
alter table form_submissions enable row level security;
alter table submission_answers enable row level security;
alter table submission_attachments enable row level security;
alter table form_mappings enable row level security;
alter table consent_records enable row level security;

drop policy if exists forms_member_all on forms;
create policy forms_member_all on forms for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists form_versions_member_all on form_versions;
create policy form_versions_member_all on form_versions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists form_fields_member_all on form_fields;
create policy form_fields_member_all on form_fields for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists form_submissions_member_all on form_submissions;
create policy form_submissions_member_all on form_submissions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists submission_attachments_member_all on submission_attachments;
create policy submission_attachments_member_all on submission_attachments for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists form_mappings_member_all on form_mappings;
create policy form_mappings_member_all on form_mappings for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Answers are readable by members and erasable, and are never editable. An
-- answer that can be rewritten is not a record of what somebody said.
drop policy if exists submission_answers_member_read on submission_answers;
create policy submission_answers_member_read on submission_answers for select
  using (is_org_member(organisation_id));
drop policy if exists submission_answers_member_insert on submission_answers;
create policy submission_answers_member_insert on submission_answers for insert
  with check (is_org_member(organisation_id));
drop policy if exists submission_answers_member_redact on submission_answers;
create policy submission_answers_member_redact on submission_answers for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Consent is append-only apart from withdrawal.
drop policy if exists consent_records_member_read on consent_records;
create policy consent_records_member_read on consent_records for select
  using (is_org_member(organisation_id));
drop policy if exists consent_records_member_insert on consent_records;
create policy consent_records_member_insert on consent_records for insert
  with check (is_org_member(organisation_id));
drop policy if exists consent_records_member_withdraw on consent_records;
create policy consent_records_member_withdraw on consent_records for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on column form_fields.sensitivity is
  'Not null and no default. Decides three things: whether the answer may ever '
  'reach a model, whether the form needs a retention period to be publishable, '
  'and which capability is needed to read it.';
comment on table form_mappings is
  'What an answer becomes in the Mission Graph. Without this table a submission '
  'is a row nobody reads twice, and the phase has built a form builder.';



-- =====================================================================
-- 0025_finance_runtime.sql
-- Finance runtime: imports, transaction candidates, periods, reconciliations
-- =====================================================================

-- Pegasus Mission OS: the finance runtime.
--
-- MG-8. Build spec Slice E.
--
-- The governing constraint is what this migration does *not* do. Migration
-- `0018` created `funds`, `financial_transactions`, `financial_allocations`,
-- `budgets` and `budget_lines`, and none of them is altered here. The
-- calculation engine that reads them is untouched. What was missing was
-- everything before those tables: a record of the file the transactions came
-- from, the classification that was suggested, and who approved it.
--
-- The pipeline this completes:
--
--   upload -> statement -> transactions -> normalisation -> classification
--     -> review -> post -> allocate
--
-- Two of those steps are the reason the tables below exist rather than being
-- columns on `financial_transactions`.
--
--   **Classification is a candidate, not a value.** A suggested category that
--   lived on the transaction would be indistinguishable from a confirmed one
--   the moment it was written. `transaction_candidates` keeps them apart until
--   a person decides.
--
--   **An import is a thing that happened.** "Where did this transaction come
--   from?" and "did that statement import cleanly?" are both questions with
--   answers, and neither can be reconstructed from the transactions alone.

-- ---------------------------------------------------------------------------
-- An opening balance is a property of the fund, not a transaction
-- ---------------------------------------------------------------------------
--
-- Added here rather than in `0018` because the need only became visible once
-- the engine had a real ledger to run on. Modelling a balance brought forward
-- as an income transaction puts it inside the flow, and a burn rate computed
-- over a window containing it reports that income covers costs when it does
-- not. That is the most flattering possible error and it only surfaces when
-- somebody trusts the runway figure.

alter table funds
  add column if not exists opening_balance_minor_units bigint;

comment on column funds.opening_balance_minor_units is
  'What the fund held before the recorded ledger begins. Part of the balance '
  'and deliberately not part of the flow: an opening reserve counted as income '
  'makes the burn rate report that the core covers itself.';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'financial_import_status') then
    create type financial_import_status as enum (
      'parsing', 'awaiting_review', 'posted', 'rejected', 'failed'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'statement_format') then
    create type statement_format as enum ('csv', 'ofx', 'xlsx', 'manual');
  end if;
end $$;

create table if not exists financial_imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  file_name text,
  format statement_format not null default 'csv',
  status financial_import_status not null default 'parsing',

  -- The account the statement covers, where the organisation records accounts.
  account_reference text,
  currency text not null default 'GBP',

  -- What each column was taken to mean. Stored so a mis-detection can be
  -- diagnosed after the fact rather than argued about.
  detected_columns jsonb not null default '[]'::jsonb,

  -- Rows the parser could not read, by number and with the reason. Never
  -- silently dropped: an import that skipped four rows would reconcile to the
  -- wrong total and nobody would know which four.
  problems jsonb not null default '[]'::jsonb,

  row_count integer not null default 0,
  posted_count integer not null default 0,
  duplicate_count integer not null default 0,

  -- `dd/mm` and `mm/dd` are indistinguishable when every day is twelve or
  -- below. The file cannot resolve it; only the person who downloaded it can.
  date_format_ambiguous boolean not null default false,

  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz
);

create index if not exists financial_imports_org_idx
  on financial_imports (organisation_id, uploaded_at desc);

do $$ begin
  if not exists (select 1 from pg_type where typname = 'classification_confidence') then
    create type classification_confidence as enum ('certain', 'probable', 'possible');
  end if;
end $$;

create table if not exists transaction_candidates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  import_id uuid not null references financial_imports(id) on delete cascade,

  row_number integer not null,

  -- The normalised transaction, before it is posted. Held here rather than in
  -- `financial_transactions` so that an unreviewed import cannot be mistaken
  -- for a ledger.
  transaction_date date not null,
  description text not null,
  amount_minor_units bigint not null,
  currency text not null,
  direction transaction_direction not null,
  counterparty text,
  reference text,

  -- What was suggested, and why. The evidence is not decoration: a reviewer
  -- approving forty transactions needs to see why each was suggested rather
  -- than approving forty assertions.
  suggested_category text,
  suggested_fund_id uuid references funds(id) on delete set null,
  suggested_grant_id uuid references grants(id) on delete set null,
  suggested_restricted boolean,
  confidence classification_confidence not null,
  evidence jsonb not null default '[]'::jsonb,

  -- Forced true above the materiality threshold however confident the match.
  -- A large payment attached to the wrong grant is a figure a funder reads.
  requires_approval boolean not null default true,

  duplicate_of uuid references financial_transactions(id) on delete set null,
  duplicate_reason text,

  posted_transaction_id uuid references financial_transactions(id) on delete set null,
  decided_by uuid references users(id),
  decided_at timestamptz,

  unique (import_id, row_number)
);

create index if not exists transaction_candidates_pending_idx
  on transaction_candidates (organisation_id, import_id)
  where posted_transaction_id is null and decided_at is null;

-- ---------------------------------------------------------------------------
-- Periods and reconciliation
-- ---------------------------------------------------------------------------

create table if not exists financial_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  label text not null,
  starts_on date not null,
  ends_on date not null,

  -- A closed period is one whose figures have been reported. Posting into it
  -- afterwards changes a number somebody has already sent to a funder, which
  -- is why closing is a state rather than a convention.
  closed boolean not null default false,
  closed_by uuid references users(id),
  closed_at timestamptz,

  constraint financial_periods_ordered check (ends_on >= starts_on),
  unique (organisation_id, label)
);

create table if not exists reconciliations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  period_id uuid references financial_periods(id) on delete set null,

  as_at date not null,
  -- What the bank says.
  statement_balance_minor_units bigint not null,
  -- What Pegasus says, from the transactions recorded.
  ledger_balance_minor_units bigint not null,
  currency text not null,

  -- Stored rather than computed on read, so a reconciliation that balanced in
  -- March still shows as balanced after a later correction changes the ledger.
  difference_minor_units bigint not null,
  note text,

  reconciled_by uuid references users(id),
  reconciled_at timestamptz not null default now()
);

create index if not exists reconciliations_org_idx
  on reconciliations (organisation_id, as_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table financial_imports enable row level security;
alter table transaction_candidates enable row level security;
alter table financial_periods enable row level security;
alter table reconciliations enable row level security;

drop policy if exists financial_imports_member_all on financial_imports;
create policy financial_imports_member_all on financial_imports for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists transaction_candidates_member_all on transaction_candidates;
create policy transaction_candidates_member_all on transaction_candidates for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists financial_periods_member_all on financial_periods;
create policy financial_periods_member_all on financial_periods for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- A reconciliation is a statement that the books balanced on a date. One that
-- can be edited afterwards is not evidence of anything.
drop policy if exists reconciliations_member_read on reconciliations;
create policy reconciliations_member_read on reconciliations for select
  using (is_org_member(organisation_id));
drop policy if exists reconciliations_member_insert on reconciliations;
create policy reconciliations_member_insert on reconciliations for insert
  with check (is_org_member(organisation_id));

comment on table transaction_candidates is
  'Classification before it is a value. A suggested category living on the '
  'transaction would be indistinguishable from a confirmed one the moment it '
  'was written.';
comment on column financial_imports.problems is
  'Rows the parser could not read, by number and with the reason. An import '
  'that silently skipped rows would reconcile to the wrong total.';



-- =====================================================================
-- 0026_portals.sql
-- Portals: portals, identities, memberships, grants, submissions, messages
-- =====================================================================

-- Pegasus Mission OS: Mission Portals.
--
-- MG-9.
--
-- The expansion plan's note on this phase is one sentence: *external parties
-- reading tenant data is the highest-risk surface in the product.* Three
-- structural decisions follow, and each one is a table rather than a
-- convention.
--
--   **`portal_identities` is not `users`.** Separate table, separate id space,
--   separate authentication path. The alternative — a `User` with an external
--   flag — means the day somebody writes a role check against the union, an
--   outsider inherits a capability.
--
--   **`portal_grants` is per record.** There is no traversal from a shared
--   grant to the evidence linked to it. The brief states the rule directly:
--   never expose internal organisation data simply because the underlying
--   record is related.
--
--   **Views are field allowlists, in code rather than here.** A denylist would
--   mean every column added to `grants` after this migration is visible to
--   funders by default, which is how a portal leaks: not by a decision, but by
--   a schema change nobody connected to a portal.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'portal_audience') then
    create type portal_audience as enum (
      'funder', 'beneficiary', 'volunteer', 'partner', 'trustee', 'applicant'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'portal_status') then
    create type portal_status as enum ('draft', 'open', 'closed');
  end if;
end $$;

create table if not exists portals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  audience portal_audience not null,
  name text not null,
  description text,
  status portal_status not null default 'draft',
  slug text not null,
  welcome_message text,

  -- A named person, not a shared inbox. Somebody outside the organisation
  -- with a question needs a human, and "info@" is where those go to die.
  contact_user_id uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  unique (organisation_id, slug)
);

drop trigger if exists portals_set_updated_at on portals;
create trigger portals_set_updated_at
  before update on portals for each row execute function set_updated_at();

do $$ begin
  if not exists (select 1 from pg_type where typname = 'portal_identity_status') then
    create type portal_identity_status as enum ('invited', 'active', 'suspended');
  end if;
end $$;

-- Deliberately thin. A portal identity is a way of authenticating somebody,
-- not a place to keep a profile: there is no address, no date of birth and no
-- notes field, and adding one would need a lawful basis rather than a column.
create table if not exists portal_identities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  email text not null,
  display_name text not null,

  -- Where the same human is also a relationship record. One-directional:
  -- nothing about the person changes because a portal identity exists.
  person_id uuid references people(id) on delete set null,
  external_organisation_id uuid references external_organisations(id) on delete set null,

  status portal_identity_status not null default 'invited',
  invited_at timestamptz not null default now(),
  last_seen_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  unique (organisation_id, email)
);

drop trigger if exists portal_identities_set_updated_at on portal_identities;
create trigger portal_identities_set_updated_at
  before update on portal_identities for each row execute function set_updated_at();

create table if not exists portal_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  portal_id uuid not null references portals(id) on delete cascade,
  identity_id uuid not null references portal_identities(id) on delete cascade,

  capabilities text[] not null default '{}',

  -- Null means indefinite. A dated grant is the safer default and the schema
  -- cannot enforce a policy, but the column being here makes the choice
  -- visible every time somebody creates one.
  expires_at timestamptz,

  invited_by uuid references users(id),
  revoked_at timestamptz,
  revoked_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (portal_id, identity_id),

  -- Revocation is a decision somebody made and should be able to explain, on
  -- the same reasoning that makes a report rejection require a reason.
  constraint portal_memberships_revocation_needs_reason check (
    revoked_at is null or (revoked_reason is not null and length(btrim(revoked_reason)) > 0)
  )
);

drop trigger if exists portal_memberships_set_updated_at on portal_memberships;
create trigger portal_memberships_set_updated_at
  before update on portal_memberships for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- The table that makes "granted, never inherited" structural
-- ---------------------------------------------------------------------------

create table if not exists portal_grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  membership_id uuid not null references portal_memberships(id) on delete cascade,

  -- Polymorphic for the same reason `relations` is, and with the same
  -- limitation: RLS confines the row to the tenant and cannot confine what it
  -- points at, so the endpoint is checked in the repository.
  entity_type text not null,
  entity_id uuid not null,

  -- Which view projects it. Decides the fields, not merely the access.
  view_key text not null,

  granted_by uuid not null references users(id),
  granted_at timestamptz not null default now(),
  reason text,
  expires_at timestamptz,
  revoked_at timestamptz,

  unique (membership_id, entity_type, entity_id, view_key)
);

create index if not exists portal_grants_membership_idx
  on portal_grants (organisation_id, membership_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- What comes back
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'portal_submission_kind') then
    create type portal_submission_kind as enum (
      'report_response', 'evidence', 'availability', 'expression_of_interest', 'approval'
    );
  end if;
end $$;

create table if not exists portal_submissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  portal_id uuid not null references portals(id) on delete cascade,
  membership_id uuid not null references portal_memberships(id) on delete cascade,

  kind portal_submission_kind not null,
  subject_type text,
  subject_id uuid,
  form_submission_id uuid,
  body text,

  status submission_status not null default 'received',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text
);

create index if not exists portal_submissions_review_idx
  on portal_submissions (organisation_id, status, submitted_at desc);

-- A message is the conversation; an `interaction` is the organisation's record
-- of one. A portal message becomes an interaction when somebody decides it is
-- worth recording, which is a decision rather than a side effect.
create table if not exists portal_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  portal_id uuid not null references portals(id) on delete cascade,
  membership_id uuid not null references portal_memberships(id) on delete cascade,

  direction interaction_direction not null,
  body text not null,
  subject_type text,
  subject_id uuid,

  sent_at timestamptz not null default now(),
  sent_by uuid references users(id),
  read_at timestamptz
);

create index if not exists portal_messages_thread_idx
  on portal_messages (organisation_id, membership_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Every policy below is `is_org_member`, which is to say: **these tables are
-- readable by the organisation, and not by the portal.** A portal request does
-- not authenticate as an organisation member and must never reach these tables
-- directly. It goes through a separate resolver that checks a membership, a
-- grant and a view before returning a projection, exactly as the public form
-- path does.
--
-- Writing an RLS policy that granted a portal identity direct row access would
-- be the single most dangerous change anybody could make to this schema.

alter table portals enable row level security;
alter table portal_identities enable row level security;
alter table portal_memberships enable row level security;
alter table portal_grants enable row level security;
alter table portal_submissions enable row level security;
alter table portal_messages enable row level security;

drop policy if exists portals_member_all on portals;
create policy portals_member_all on portals for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists portal_identities_member_all on portal_identities;
create policy portal_identities_member_all on portal_identities for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists portal_memberships_member_all on portal_memberships;
create policy portal_memberships_member_all on portal_memberships for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists portal_submissions_member_all on portal_submissions;
create policy portal_submissions_member_all on portal_submissions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists portal_messages_member_all on portal_messages;
create policy portal_messages_member_all on portal_messages for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- A grant is the record of a decision to share something outside the
-- organisation. It is insertable and revocable and never editable: changing
-- which record a grant points at, after the fact, would rewrite the history of
-- what was shared with whom.
drop policy if exists portal_grants_member_read on portal_grants;
create policy portal_grants_member_read on portal_grants for select
  using (is_org_member(organisation_id));
drop policy if exists portal_grants_member_insert on portal_grants;
create policy portal_grants_member_insert on portal_grants for insert
  with check (is_org_member(organisation_id));
drop policy if exists portal_grants_member_revoke on portal_grants;
create policy portal_grants_member_revoke on portal_grants for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on table portal_grants is
  'One record shared with one membership. There is no traversal from a granted '
  'record to a related one: reaching a second thing requires a second grant.';
comment on table portal_identities is
  'Not users. Separate table, separate id space, separate authentication path.';



-- =====================================================================
-- 0027_fundraising.sql
-- Fundraising: campaigns, appeals, donations, Gift Aid, supporters
-- =====================================================================

-- Pegasus Mission OS: supporters, fundraising and stewardship.
--
-- MG-10.
--
-- The expansion plan states the test this migration is judged on: *a donation
-- touches supporter, fund, finance, programme, campaign, reporting, impact and
-- stewardship. If it lives in a fundraising table, §11 has been violated.*
--
-- So the single most important line below is `donations.transaction_id`, and
-- the most important omission is any amount column on `donations`. The money
-- is a `financial_transaction` in a `fund`, attributed by a
-- `financial_allocation`, exactly as a grant payment is. This table says what
-- the money *was*: whose gift, to which appeal, through which channel.
--
-- Three tables the brief names are deliberately absent:
--
--   `DonationAllocation`  -> `financial_allocations`, which already records
--                            the method and basis that make an attribution
--                            defensible. A second one would need reconciling.
--   `FundraisingGoal`     -> `campaigns.target_minor_units`. A campaign with
--                            several simultaneous monetary targets is not
--                            something charities of this size run.
--   A supporter's identity -> `people` and `external_organisations`, which are
--                            canonical. `supporter_profiles` holds a steward,
--                            a stage and a recognition preference, and no name.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'donation_channel') then
    create type donation_channel as enum (
      'bank_transfer', 'direct_debit', 'standing_order', 'card', 'cash', 'cheque',
      'platform', 'payroll_giving', 'legacy', 'in_kind'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'donation_kind') then
    create type donation_kind as enum ('one_off', 'recurring_payment', 'legacy', 'in_kind');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type campaign_status as enum ('planned', 'active', 'closed');
  end if;
end $$;

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  name text not null,
  description text,
  target_minor_units bigint,
  currency text not null default 'GBP',
  starts_on date not null,
  ends_on date,

  fund_id uuid references funds(id) on delete set null,
  programme_id uuid references programmes(id) on delete set null,
  cost_minor_units bigint,

  status campaign_status not null default 'planned',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  constraint campaigns_ordered check (ends_on is null or ends_on >= starts_on)
);

-- No `raised` column, deliberately. A stored total is a second source of truth
-- that goes stale the moment a donation is corrected, refunded or reattributed.
comment on table campaigns is
  'Campaign totals are derived from the donations pointing at them. A stored '
  'raised figure would be wrong from the first correction onwards.';

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
  before update on campaigns for each row execute function set_updated_at();

create table if not exists appeals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,

  name text not null,
  channel donation_channel not null,
  sent_on date,
  -- Needed for a response rate that means anything. Nullable, because it is
  -- often unknown, and a rate against an unknown denominator is a number that
  -- merely looks like information.
  audience_size integer,
  cost_minor_units bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gift Aid
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'gift_aid_scope') then
    create type gift_aid_scope as enum ('enduring', 'single_donation');
  end if;
end $$;

create table if not exists gift_aid_declarations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- Individuals only. A company cannot make a Gift Aid declaration.
  person_id uuid not null references people(id) on delete cascade,

  -- HMRC matches a claim on these. A declaration missing any of them is one
  -- the charity would have to repay.
  full_name text not null,
  address_line text not null,
  postcode text not null,
  taxpayer_confirmed boolean not null default false,

  declared_on date not null,
  scope gift_aid_scope not null,
  donation_id uuid,

  cancelled_on date,
  cancelled_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A single-donation declaration that names no donation covers nothing.
  constraint gift_aid_single_needs_donation check (
    scope <> 'single_donation' or donation_id is not null
  )
);

-- The home address is the one field here that the relationship layer
-- deliberately does not hold. It lives on this record because Gift Aid is the
-- lawful basis for holding it, which is §8's rule: a lawful basis first, not
-- an available column.
comment on column gift_aid_declarations.address_line is
  'Held because Gift Aid requires it, and for no other purpose. Person carries '
  'no address by design.';

do $$ begin
  if not exists (select 1 from pg_type where typname = 'gift_aid_claim_status') then
    create type gift_aid_claim_status as enum ('draft', 'ready', 'filed', 'settled');
  end if;
end $$;

create table if not exists gift_aid_claims (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  period_start date not null,
  period_end date not null,
  donation_ids uuid[] not null default '{}',
  claimable_minor_units bigint not null,
  currency text not null default 'GBP',

  status gift_aid_claim_status not null default 'draft',

  -- Filled in by whoever filed it with HMRC. Pegasus never files: a submission
  -- that looked as though it had happened and had not would be discovered by
  -- HMRC rather than by the charity.
  hmrc_reference text,
  filed_by uuid references users(id),
  filed_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gift_aid_claims_filed_needs_reference check (
    status <> 'filed' or (hmrc_reference is not null and length(btrim(hmrc_reference)) > 0)
  )
);

-- ---------------------------------------------------------------------------
-- Recurring arrangements and donations
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'recurring_frequency') then
    create type recurring_frequency as enum ('monthly', 'quarterly', 'annual');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'recurring_status') then
    create type recurring_status as enum ('active', 'paused', 'ended');
  end if;
end $$;

-- An intention, not money. Each payment against it is a separate donation with
-- its own transaction, which is what stops a fundraising total counting income
-- nobody has received.
create table if not exists recurring_commitments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  person_id uuid references people(id) on delete set null,
  external_organisation_id uuid references external_organisations(id) on delete set null,

  amount_minor_units bigint not null,
  currency text not null default 'GBP',
  frequency recurring_frequency not null,
  channel donation_channel not null,

  started_on date not null,
  ended_on date,
  ended_reason text,
  campaign_id uuid references campaigns(id) on delete set null,
  status recurring_status not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recurring_commitments_one_party check (
    (person_id is not null and external_organisation_id is null)
    or (person_id is null and external_organisation_id is not null)
  )
);

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- The line this whole migration turns on. There is no amount column here:
  -- the money is the transaction, so a gift reaches the finance position, the
  -- runway calculation and a funder report without a second entry.
  transaction_id uuid not null references financial_transactions(id) on delete restrict,

  person_id uuid references people(id) on delete set null,
  external_organisation_id uuid references external_organisations(id) on delete set null,

  kind donation_kind not null default 'one_off',
  channel donation_channel not null,
  received_on date not null,

  campaign_id uuid references campaigns(id) on delete set null,
  appeal_id uuid references appeals(id) on delete set null,
  recurring_commitment_id uuid references recurring_commitments(id) on delete set null,

  -- Anonymous to the public, not to the organisation. A charity must be able
  -- to identify donors for due diligence and Gift Aid, so person_id may be set
  -- on an anonymous gift; what this flag withholds is the name from anything a
  -- third party sees.
  anonymous boolean not null default false,

  restricted boolean not null default false,
  restriction_purpose text,

  gift_aid_declaration_id uuid references gift_aid_declarations(id) on delete set null,
  gift_aid_claimed boolean not null default false,
  benefit_value_minor_units bigint,

  note text,
  thanked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz,

  -- A restricted gift whose restriction is unstated cannot be honoured, and is
  -- the same failure `funds_restricted_needs_purpose` guards against.
  constraint donations_restricted_needs_purpose check (
    restricted = false or (restriction_purpose is not null and length(btrim(restriction_purpose)) > 0)
  ),
  -- One transaction, one donation. Two donations against the same transaction
  -- would double-count a gift in every campaign total.
  unique (transaction_id)
);

create index if not exists donations_campaign_idx
  on donations (organisation_id, campaign_id, received_on desc);
create index if not exists donations_person_idx
  on donations (organisation_id, person_id, received_on desc);

drop trigger if exists donations_set_updated_at on donations;
create trigger donations_set_updated_at
  before update on donations for each row execute function set_updated_at();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gift_aid_declarations_donation_fk') then
    alter table gift_aid_declarations
  add constraint gift_aid_declarations_donation_fk
  foreign key (donation_id) references donations(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Supporters and stewardship
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'stewardship_stage') then
    create type stewardship_stage as enum (
      'new', 'thanked', 'regular', 'major', 'lapsing', 'lapsed',
      'corporate', 'trust_or_foundation', 'potential_major'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'recognition_preference') then
    create type recognition_preference as enum ('named', 'anonymous', 'ask_each_time');
  end if;
end $$;

-- Holds no identity. No name, no email, no address: those are `people`, which
-- is canonical. A supporter profile that carried them would be the second CRM
-- the brief forbids.
create table if not exists supporter_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  person_id uuid references people(id) on delete cascade,
  external_organisation_id uuid references external_organisations(id) on delete cascade,

  steward_id uuid references users(id) on delete set null,
  stage stewardship_stage not null default 'new',
  stage_override jsonb,
  recognition_preference recognition_preference,

  do_not_solicit boolean not null default false,
  do_not_solicit_reason text,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint supporter_profiles_one_party check (
    (person_id is not null and external_organisation_id is null)
    or (person_id is null and external_organisation_id is not null)
  ),
  unique (organisation_id, person_id),
  unique (organisation_id, external_organisation_id)
);

drop trigger if exists supporter_profiles_set_updated_at on supporter_profiles;
create trigger supporter_profiles_set_updated_at
  before update on supporter_profiles for each row execute function set_updated_at();

create table if not exists stewardship_plans (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  supporter_profile_id uuid not null references supporter_profiles(id) on delete cascade,

  name text not null,
  -- Steps reference tasks rather than duplicating them, so a stewardship plan
  -- does not become a second to-do list nobody looks at.
  steps jsonb not null default '[]'::jsonb,
  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fundraising_pages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,

  slug text not null,
  headline text not null,
  body text,
  -- The donation form is a `form` with purpose 'donation', carrying its own
  -- consent, sensitivity and spam controls. A second form engine here would be
  -- the module-specific duplication the architecture keeps refusing.
  form_id uuid references forms(id) on delete set null,
  show_total boolean not null default true,
  status text not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, slug)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table campaigns enable row level security;
alter table appeals enable row level security;
alter table donations enable row level security;
alter table recurring_commitments enable row level security;
alter table gift_aid_declarations enable row level security;
alter table gift_aid_claims enable row level security;
alter table supporter_profiles enable row level security;
alter table stewardship_plans enable row level security;
alter table fundraising_pages enable row level security;

drop policy if exists campaigns_member_all on campaigns;
create policy campaigns_member_all on campaigns for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists appeals_member_all on appeals;
create policy appeals_member_all on appeals for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists recurring_commitments_member_all on recurring_commitments;
create policy recurring_commitments_member_all on recurring_commitments for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists supporter_profiles_member_all on supporter_profiles;
create policy supporter_profiles_member_all on supporter_profiles for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists stewardship_plans_member_all on stewardship_plans;
create policy stewardship_plans_member_all on stewardship_plans for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists fundraising_pages_member_all on fundraising_pages;
create policy fundraising_pages_member_all on fundraising_pages for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists donations_member_all on donations;
create policy donations_member_all on donations for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- A Gift Aid declaration is a statement somebody made and a record HMRC may
-- inspect. It is insertable and cancellable and never editable: rewriting the
-- address or the date on a declaration after a claim was made on it would
-- destroy the evidence for that claim.
drop policy if exists gift_aid_declarations_member_read on gift_aid_declarations;
create policy gift_aid_declarations_member_read on gift_aid_declarations for select
  using (is_org_member(organisation_id));
drop policy if exists gift_aid_declarations_member_insert on gift_aid_declarations;
create policy gift_aid_declarations_member_insert on gift_aid_declarations for insert
  with check (is_org_member(organisation_id));
drop policy if exists gift_aid_declarations_member_cancel on gift_aid_declarations;
create policy gift_aid_declarations_member_cancel on gift_aid_declarations for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

drop policy if exists gift_aid_claims_member_all on gift_aid_claims;
create policy gift_aid_claims_member_all on gift_aid_claims for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on column donations.transaction_id is
  'The money. There is no amount column on this table: a donation that carried '
  'its own figure would be a second ledger, and the two would disagree.';



-- =====================================================================
-- 0028_integrations.sql
-- Integrations: connections, external identities, cursors, runs, conflicts
-- =====================================================================

-- Pegasus Mission OS: the integration hub.
--
-- MG-11. Build spec Slice I.
--
-- The strategic point, from the brief: Mission OS should be able to become the
-- intelligence layer around an organisation's existing systems before becoming
-- the system of record for everything. A charity with a CRM it likes should be
-- able to start using Pegasus for programme, funding, evidence and impact work
-- without a risky day-one migration.
--
-- Two rules make that survivable, and both are tables rather than conventions.
--
--   **No provider identifier enters a core entity.** There is no `beacon_id`
--   on `people`. `external_identities` says that provider record X on this
--   connection is Pegasus entity Y, and `(connection_id, external_id)` is
--   unique — which is also the idempotency key, so re-running a sync cannot
--   duplicate a record and does not need a full re-read to know so. This is
--   the rule `server/communications/provider.ts` set for email, generalised.
--
--   **Nothing silently overwrites a human.** A sync that would change a value
--   somebody verified writes a `sync_conflicts` row and changes nothing. Not a
--   setting; what the engine does.
--
-- One thing this schema deliberately has nowhere to put: **a credential.**
-- `credential_ref` points at wherever the secret actually lives. A token in a
-- tenant-readable row is a token every member of the organisation can read,
-- and a column that could hold one eventually would.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'integration_category') then
    create type integration_category as enum (
      'crm', 'accounting', 'payments', 'email', 'calendar', 'fundraising',
      'storage', 'forms', 'banking'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sync_direction') then
    create type sync_direction as enum ('inbound', 'outbound', 'bidirectional');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'source_of_truth') then
    create type source_of_truth as enum ('external', 'pegasus', 'field_level');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'conflict_behaviour') then
    create type conflict_behaviour as enum (
      'refuse', 'external_wins', 'pegasus_wins', 'newest_wins'
    );
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'deletion_behaviour') then
    create type deletion_behaviour as enum ('ignore', 'archive', 'flag');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'migration_mode') then
    create type migration_mode as enum ('connect', 'migrate');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'connection_status') then
    create type connection_status as enum (
      'pending', 'active', 'reauthorisation_required', 'rate_limited', 'failing', 'revoked'
    );
  end if;
end $$;

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- The provider's registry id, e.g. 'beacon'. Not a foreign key: the registry
  -- is code, because a capability list is a claim about a third party's
  -- product and belongs where it can carry a comment citing the source.
  integration_id text not null,
  account_label text not null,

  mode migration_mode not null default 'connect',

  -- The six things the brief requires every integration to define. Not null,
  -- so a connection cannot exist without somebody having answered all of them.
  direction sync_direction not null default 'inbound',
  source_of_truth source_of_truth not null default 'external',
  conflict_behaviour conflict_behaviour not null default 'refuse',
  deletion_behaviour deletion_behaviour not null default 'flag',
  freshness_minutes integer not null default 60,
  failure_threshold integer not null default 3,

  status connection_status not null default 'pending',

  -- A reference, never a secret. See the note at the top of this file.
  credential_ref text,

  connected_by uuid references users(id),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  unique (organisation_id, integration_id, account_label)
);

drop trigger if exists integration_connections_set_updated_at on integration_connections;
create trigger integration_connections_set_updated_at
  before update on integration_connections
  for each row execute function set_updated_at();

comment on column integration_connections.credential_ref is
  'A pointer to wherever the secret lives. Never the secret: a token in a '
  'tenant-readable row is a token every member of the organisation can read.';

-- ---------------------------------------------------------------------------
-- The bridge that keeps provider ids out of core entities
-- ---------------------------------------------------------------------------

create table if not exists external_identities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  -- Opaque. Never parsed, never displayed as an identifier to a user.
  external_id text not null,
  external_type text not null,

  entity_type text not null,
  entity_id uuid not null,

  -- Answers "did this record change?" in one comparison rather than a
  -- field-by-field diff, which matters against a provider limited to 300
  -- requests a minute.
  content_hash text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  external_deleted_at timestamptz,

  -- The idempotency key. Re-running a sync cannot duplicate a record.
  unique (connection_id, external_id, external_type)
);

create index if not exists external_identities_entity_idx
  on external_identities (organisation_id, entity_type, entity_id);

create table if not exists sync_cursors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  resource text not null,
  -- Opaque and provider-specific. Pegasus stores it and hands it back; parsing
  -- one is how an integration breaks on a vendor's internal change.
  cursor text not null,
  updated_at timestamptz not null default now(),

  unique (connection_id, resource)
);

-- ---------------------------------------------------------------------------
-- What happened, and what was refused
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sync_run_outcome') then
    create type sync_run_outcome as enum ('completed', 'partial', 'failed', 'refused');
  end if;
end $$;

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  resource text not null,
  direction sync_direction not null,

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome sync_run_outcome not null,

  records_read integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  conflicts_raised integer not null default 0,

  -- Always populated. A run that explains nothing cannot be diagnosed, and a
  -- sync nobody can diagnose is one an organisation stops trusting.
  summary text not null,
  error text
);

create index if not exists sync_runs_connection_idx
  on sync_runs (organisation_id, connection_id, started_at desc);

do $$ begin
  if not exists (select 1 from pg_type where typname = 'conflict_resolution') then
    create type conflict_resolution as enum ('kept_pegasus', 'took_external', 'manual');
  end if;
end $$;

-- The record of the rule the brief states most firmly. Holds both values, so
-- a person resolving it can see what each side says rather than being asked to
-- pick between two labels.
create table if not exists sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  entity_type text not null,
  entity_id uuid not null,
  field text not null,

  pegasus_value text not null,
  pegasus_verification verification_state not null,
  external_value text not null,

  detected_at timestamptz not null default now(),
  resolution conflict_resolution,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  resolution_note text,

  -- Resolving a conflict is a decision about which of two systems was right.
  -- One recorded without a person is not a resolution.
  constraint sync_conflicts_resolution_needs_person check (
    resolution is null or resolved_by is not null
  )
);

create index if not exists sync_conflicts_open_idx
  on sync_conflicts (organisation_id, connection_id)
  where resolution is null;

-- ---------------------------------------------------------------------------
-- Webhooks and field mappings
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'webhook_status') then
    create type webhook_status as enum ('received', 'processed', 'ignored', 'failed');
  end if;
end $$;

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  provider_event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  payload_hash text not null,

  status webhook_status not null default 'received',
  processed_at timestamptz,
  note text,

  -- A webhook delivered twice is normal. A handler that assumed otherwise
  -- would double-count a donation.
  unique (connection_id, provider_event_id)
);

-- Per connection, not per provider. Some providers generate their API schema
-- from each customer's own configuration — Beacon does — so field keys differ
-- between two charities using the same product. A mapping hardcoded per
-- provider would work for the first customer and fail for the second.
create table if not exists integration_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  connection_id uuid not null references integration_connections(id) on delete cascade,

  external_type text not null,
  external_field text not null,
  entity_type text not null,
  field text not null,

  -- Off unless somebody said otherwise. A mapping that could write by default
  -- would make a read-only connection capable of changing another system.
  writable boolean not null default false,

  -- Discovery produces candidates. A field mapping guessed from a name and
  -- then trusted is how a postcode ends up in a phone number column.
  verification verification_state not null default 'needs_review',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (connection_id, external_type, external_field, entity_type, field)
);

drop trigger if exists integration_mappings_set_updated_at on integration_mappings;
create trigger integration_mappings_set_updated_at
  before update on integration_mappings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table integration_connections enable row level security;
alter table external_identities enable row level security;
alter table sync_cursors enable row level security;
alter table sync_runs enable row level security;
alter table sync_conflicts enable row level security;
alter table webhook_events enable row level security;
alter table integration_mappings enable row level security;

drop policy if exists integration_connections_member_all on integration_connections;
create policy integration_connections_member_all on integration_connections for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists external_identities_member_all on external_identities;
create policy external_identities_member_all on external_identities for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists sync_cursors_member_all on sync_cursors;
create policy sync_cursors_member_all on sync_cursors for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists integration_mappings_member_all on integration_mappings;
create policy integration_mappings_member_all on integration_mappings for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
drop policy if exists sync_conflicts_member_all on sync_conflicts;
create policy sync_conflicts_member_all on sync_conflicts for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Runs and webhook receipts are the record of what a machine did without a
-- person present. Insertable and readable and never editable, on the same
-- reasoning as audit events and automation runs.
drop policy if exists sync_runs_member_read on sync_runs;
create policy sync_runs_member_read on sync_runs for select
  using (is_org_member(organisation_id));
drop policy if exists sync_runs_member_insert on sync_runs;
create policy sync_runs_member_insert on sync_runs for insert
  with check (is_org_member(organisation_id));

drop policy if exists webhook_events_member_read on webhook_events;
create policy webhook_events_member_read on webhook_events for select
  using (is_org_member(organisation_id));
drop policy if exists webhook_events_member_insert on webhook_events;
create policy webhook_events_member_insert on webhook_events for insert
  with check (is_org_member(organisation_id));
drop policy if exists webhook_events_member_mark on webhook_events;
create policy webhook_events_member_mark on webhook_events for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on table external_identities is
  'The bridge that keeps provider identifiers out of core entities. There is '
  'no beacon_id on people. (connection_id, external_id) is unique and is the '
  'idempotency key for every sync.';
comment on table sync_conflicts is
  'A change the sync refused to make. Holds both values, so a person can see '
  'what each side says rather than pick between two labels.';

