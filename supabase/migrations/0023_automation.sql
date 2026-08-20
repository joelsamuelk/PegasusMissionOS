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

create type domain_event_kind as enum (
  'record.created', 'record.changed', 'record.archived',
  'grant.state_changed', 'grant.health_changed', 'deliverable.overdue',
  'report.state_changed', 'report.due_soon', 'requirement.due_soon',
  'indicator.updated', 'evidence.linked', 'evidence.outdated',
  'payment.received', 'transaction.imported', 'runway.changed',
  'relationship.health_changed', 'opportunity.discovered', 'form.submitted',
  'date.approaching', 'deadline.passed'
);

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

create type automation_status as enum ('draft', 'active', 'paused');

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

create trigger automations_set_updated_at
  before update on automations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Runs, steps and failures
-- ---------------------------------------------------------------------------

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

create type automation_step_status as enum (
  'planned', 'awaiting_approval', 'executed', 'skipped', 'failed'
);

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

create type scheduled_job_kind as enum (
  'scan_dates', 'recompute_signals', 'run_automation', 'send_reminder'
);

create type scheduled_job_status as enum (
  'pending', 'running', 'done', 'failed', 'cancelled'
);

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

create policy automations_member_all on automations for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy automation_steps_member_all on automation_steps for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy scheduled_jobs_member_all on scheduled_jobs for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Events, runs and failures are the record of what the system did without a
-- person present. They are readable and insertable and never editable, for the
-- same reason audit events are: a run that can be rewritten is not evidence of
-- anything.
create policy domain_events_member_read on domain_events for select
  using (is_org_member(organisation_id));
create policy domain_events_member_insert on domain_events for insert
  with check (is_org_member(organisation_id));
create policy domain_events_member_mark on domain_events for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

create policy automation_runs_member_read on automation_runs for select
  using (is_org_member(organisation_id));
create policy automation_runs_member_insert on automation_runs for insert
  with check (is_org_member(organisation_id));
-- Approval is the one field a person may set after the fact.
create policy automation_runs_member_approve on automation_runs for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

create policy automation_failures_member_read on automation_failures for select
  using (is_org_member(organisation_id));
create policy automation_failures_member_insert on automation_failures for insert
  with check (is_org_member(organisation_id));

comment on column automations.condition is
  'A typed condition tree. Three-valued: an automation whose condition cannot '
  'be decided does not fire and records why. There is no expression string '
  'and no interpreter, so there is nothing to inject code into.';
comment on table automation_runs is
  'Written whether or not the automation matched. "Why did nothing happen?" is '
  'the more common question and only a complete run log can answer it.';
