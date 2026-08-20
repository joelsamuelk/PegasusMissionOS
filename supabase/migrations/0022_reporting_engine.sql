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

create type report_template_origin as enum ('built_in', 'cloned', 'ingested');

create type report_type as enum (
  'impact', 'funder', 'grant', 'programme', 'trustee', 'board_pack',
  'annual', 'finance'
);

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

create trigger report_definitions_set_updated_at
  before update on report_definitions
  for each row execute function set_updated_at();

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

alter table report_versions
  add constraint report_versions_snapshot_fk
  foreign key (snapshot_id) references report_snapshots(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Contributions and approvals
-- ---------------------------------------------------------------------------

create type report_contributor_role as enum (
  'author', 'reviewer', 'approver', 'data_owner'
);

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

create type approval_decision as enum ('approved', 'changes_requested');

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

create type report_requirement_kind as enum (
  'narrative', 'indicator', 'financial', 'evidence', 'claim', 'attachment'
);

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

create trigger report_requirements_set_updated_at
  before update on report_requirements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Template ingestion
-- ---------------------------------------------------------------------------

create type template_ingestion_status as enum (
  'parsing', 'awaiting_review', 'accepted', 'rejected', 'failed'
);

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

create policy report_versions_member_all on report_versions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy report_snapshots_member_all on report_snapshots for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy report_contributors_member_all on report_contributors for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy report_requirements_member_all on report_requirements for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy report_template_ingestions_member_all on report_template_ingestions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy report_definitions_member_all on report_definitions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Approvals are append-only for the same reason audit events are: an approval
-- that can be edited or deleted is not evidence that anyone approved anything.
create policy report_approvals_member_read on report_approvals for select
  using (is_org_member(organisation_id));
create policy report_approvals_member_insert on report_approvals for insert
  with check (is_org_member(organisation_id));

comment on table report_versions is
  'Immutable points in a report''s life. A published report resolves to the '
  'version and snapshot it was published with, however many times the '
  'underlying claims are superseded afterwards.';
comment on table report_snapshots is
  'What a version cited, frozen. Without rendered_value, "the report says 58%" '
  'and "the indicator says 61%" cannot be reconciled.';
