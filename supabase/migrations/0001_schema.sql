-- Pegasus Mission OS: core relational schema.
-- PostgreSQL / Supabase. All organisation-owned tables carry organisation_id
-- plus audit stamps. UUID primary keys, foreign keys and indexes throughout.
-- Row Level Security is enabled here and the policies are defined in 0002.

create extension if not exists "pgcrypto";

-- Reusable enum types -------------------------------------------------------

create type member_role as enum (
  'owner', 'administrator', 'funding_lead', 'programme_lead',
  'finance_contributor', 'trustee_reviewer', 'contributor'
);
create type verification_state as enum (
  'verified', 'provided', 'ai_extracted', 'needs_review', 'outdated'
);
create type pipeline_stage as enum (
  'discovered', 'reviewing', 'qualified', 'applying', 'internal_review',
  'ready_to_submit', 'submitted', 'decision_pending', 'successful',
  'unsuccessful', 'archived'
);
create type application_status as enum (
  'not_started', 'in_progress', 'internal_review', 'ready_to_submit',
  'submitted', 'successful', 'unsuccessful'
);
create type answer_status as enum (
  'not_started', 'drafting', 'needs_evidence', 'ready_for_review',
  'changes_requested', 'approved'
);
create type grant_status as enum ('active', 'completed', 'closed');
create type programme_status as enum ('planning', 'active', 'paused', 'completed');
create type report_status as enum ('draft', 'in_review', 'approved');
create type confidence_level as enum ('high', 'medium', 'low');

-- Users (mirrors auth.users) -----------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  job_title text,
  avatar_initials text,
  created_at timestamptz not null default now()
);

-- Organisations ------------------------------------------------------------

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text not null,
  type text not null,
  charity_number text,
  company_number text,
  year_founded int,
  website text,
  registered_address text,
  operating_regions text[] not null default '{}',
  organisation_size text,
  annual_income_band text,
  is_demo boolean not null default false,
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz
);

create table organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role member_role not null default 'contributor',
  status text not null default 'active',
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);
create index idx_members_org on organisation_members(organisation_id);
create index idx_members_user on organisation_members(user_id);

create table organisation_profiles (
  organisation_id uuid primary key references organisations(id) on delete cascade,
  -- Attested fields stored as jsonb {value, verification, source, last_verified_at}
  mission_statement jsonb,
  vision jsonb,
  summary jsonb,
  core_activities jsonb,
  strategic_priorities jsonb,
  communities_served jsonb,
  geographic_reach jsonb,
  trustees jsonb,
  key_policies jsonb,
  safeguarding_status jsonb,
  data_protection_status jsonb,
  insurance_status jsonb,
  financial_year_end jsonb,
  auditors jsonb,
  typical_funding_requirement jsonb,
  preferred_funding_types jsonb,
  restricted_needs jsonb,
  unrestricted_needs jsonb,
  past_funders jsonb,
  match_funding_available jsonb,
  updated_at timestamptz not null default now()
);

create table organisation_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  storage_path text,
  file_size_kb int,
  verification verification_state not null default 'provided',
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);
create index idx_docs_org on organisation_documents(organisation_id);

-- Funders and opportunities -------------------------------------------------

create table funders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  type text,
  website text,
  contact_name text,
  contact_email text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_funders_org on funders(organisation_id);

create table funding_opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  funder_id uuid not null references funders(id) on delete cascade,
  programme_name text not null,
  description text,
  min_award numeric,
  max_award numeric,
  currency text not null default 'GBP',
  deadline date,
  funding_duration_months int,
  funding_type text not null default 'project',
  eligible_org_types text[] not null default '{}',
  eligible_locations text[] not null default '{}',
  priority_themes text[] not null default '{}',
  required_documents text[] not null default '{}',
  reporting_requirements text[] not null default '{}',
  source_reference text,
  last_verified_at date,
  owner_id uuid references users(id),
  stage pipeline_stage not null default 'discovered',
  probability int not null default 0,
  next_action text,
  saved boolean not null default false,
  is_demo boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index idx_opps_org on funding_opportunities(organisation_id);
create index idx_opps_stage on funding_opportunities(organisation_id, stage);
create index idx_opps_deadline on funding_opportunities(deadline);

create table opportunity_eligibility_criteria (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  label text not null,
  detail text
);
create index idx_elig_opp on opportunity_eligibility_criteria(opportunity_id);

create table opportunity_questions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  ord int not null default 0,
  text text not null,
  guidance text,
  word_limit int,
  char_limit int
);
create index idx_oq_opp on opportunity_questions(opportunity_id);

create table saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (opportunity_id, user_id)
);

-- Fit assessments -----------------------------------------------------------

create table fit_assessments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  overall_score int not null,
  category text not null,
  eligibility_status text not null,
  key_risks text[] not null default '{}',
  missing_information text[] not null default '{}',
  recommended_next_action text,
  effort_estimate text,
  strategic_value text,
  generated_by text not null default 'mock',
  generated_at timestamptz not null default now()
);
create index idx_fit_opp on fit_assessments(opportunity_id);

create table fit_assessment_factors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  assessment_id uuid not null references fit_assessments(id) on delete cascade,
  key text not null,
  label text not null,
  status text not null,
  score int not null,
  weight numeric not null default 1,
  rationale text,
  evidence_used text[] not null default '{}',
  assumptions text[] not null default '{}'
);
create index idx_fit_factors on fit_assessment_factors(assessment_id);

-- Applications --------------------------------------------------------------

create table applications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid not null references funding_opportunities(id) on delete cascade,
  title text not null,
  status application_status not null default 'not_started',
  owner_id uuid references users(id),
  contributor_ids uuid[] not null default '{}',
  reviewer_ids uuid[] not null default '{}',
  deadline date,
  required_documents jsonb not null default '[]',
  submission_checklist jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index idx_apps_org on applications(organisation_id);

create table application_questions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  ord int not null default 0,
  question_text text not null,
  guidance text,
  word_limit int
);
create index idx_aq_app on application_questions(application_id);

create table application_answers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  ord int not null default 0,
  question_text text not null,
  guidance text,
  word_limit int,
  draft text not null default '',
  status answer_status not null default 'not_started',
  assigned_to uuid references users(id),
  evidence_ids uuid[] not null default '{}',
  provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_answers_app on application_answers(application_id);

create table application_answer_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  answer_id uuid not null references application_answers(id) on delete cascade,
  content text not null,
  word_count int not null default 0,
  author_id uuid references users(id),
  source text not null default 'human',
  note text,
  created_at timestamptz not null default now()
);
create index idx_answer_versions on application_answer_versions(answer_id);

create table application_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  decision text not null default 'pending',
  comment text,
  created_at timestamptz not null default now()
);
create index idx_reviews_app on application_reviews(application_id);

-- Grants --------------------------------------------------------------------

create table grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  application_id uuid references applications(id) on delete set null,
  funder_id uuid not null references funders(id) on delete cascade,
  title text not null,
  award_value numeric not null default 0,
  currency text not null default 'GBP',
  restricted boolean not null default false,
  start_date date not null,
  end_date date not null,
  grant_manager_id uuid references users(id),
  funder_contact text,
  spent_to_date numeric not null default 0,
  conditions text[] not null default '{}',
  status grant_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index idx_grants_org on grants(organisation_id);

create table grant_payments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  grant_id uuid not null references grants(id) on delete cascade,
  label text not null,
  amount numeric not null,
  due_date date,
  received boolean not null default false
);
create index idx_payments_grant on grant_payments(grant_id);

create table grant_conditions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  grant_id uuid not null references grants(id) on delete cascade,
  detail text not null,
  met boolean not null default false
);

create table grant_deliverables (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  grant_id uuid not null references grants(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'not_started'
);
create index idx_deliverables_grant on grant_deliverables(grant_id);

create table grant_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  grant_id uuid not null references grants(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'not_started'
);
create index idx_greports_grant on grant_reports(grant_id);

-- Programmes and outcomes ---------------------------------------------------

create table programmes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  summary text,
  status programme_status not null default 'planning',
  owner_id uuid references users(id),
  start_date date,
  end_date date,
  location text,
  communities_served text[] not null default '{}',
  budget numeric,
  activities text[] not null default '{}',
  outputs text[] not null default '{}',
  delivery_partners text[] not null default '{}',
  risks text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index idx_programmes_org on programmes(organisation_id);

create table programme_grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  programme_id uuid not null references programmes(id) on delete cascade,
  grant_id uuid not null references grants(id) on delete cascade,
  unique (programme_id, grant_id)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  programme_id uuid not null references programmes(id) on delete cascade,
  title text not null,
  description text
);

create table outputs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  programme_id uuid not null references programmes(id) on delete cascade,
  title text not null,
  value numeric
);

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  programme_id uuid not null references programmes(id) on delete cascade,
  title text not null,
  description text,
  level text not null default 'outcome',
  created_at timestamptz not null default now()
);
create index idx_outcomes_prog on outcomes(programme_id);

create table indicators (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  outcome_id uuid not null references outcomes(id) on delete cascade,
  name text not null,
  definition text,
  baseline numeric not null default 0,
  target numeric not null default 0,
  current_value numeric not null default 0,
  unit text,
  measurement_frequency text,
  evidence_source text,
  data_owner_id uuid references users(id),
  last_updated date,
  confidence confidence_level not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_indicators_outcome on indicators(outcome_id);

create table indicator_measurements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  indicator_id uuid not null references indicators(id) on delete cascade,
  value numeric not null,
  recorded_at timestamptz not null default now(),
  note text,
  recorded_by uuid references users(id)
);
create index idx_measurements_ind on indicator_measurements(indicator_id);

-- Evidence ------------------------------------------------------------------

create table evidence_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  type text not null,
  description text,
  verification verification_state not null default 'provided',
  reporting_period text,
  location text,
  community text,
  stat_value text,
  stat_label text,
  quote text,
  attribution text,
  file_name text,
  file_size_kb int,
  storage_path text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz
);
create index idx_evidence_org on evidence_items(organisation_id);

create table evidence_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  evidence_id uuid not null references evidence_items(id) on delete cascade,
  target_type text not null,
  target_id uuid not null
);
create index idx_evlinks_evidence on evidence_links(evidence_id);
create index idx_evlinks_target on evidence_links(target_type, target_id);

-- Impact reports ------------------------------------------------------------

create table impact_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  programme_id uuid references programmes(id) on delete set null,
  grant_id uuid references grants(id) on delete set null,
  reporting_period text,
  status report_status not null default 'draft',
  included_indicator_ids uuid[] not null default '{}',
  included_evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index idx_reports_org on impact_reports(organisation_id);

create table impact_report_sections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  report_id uuid not null references impact_reports(id) on delete cascade,
  key text not null,
  title text not null,
  content text not null default '',
  provenance jsonb,
  ord int not null default 0
);
create index idx_report_sections on impact_report_sections(report_id);

-- Tasks, comments, notifications --------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  due_date date,
  assignee_id uuid references users(id),
  related_type text,
  related_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tasks_org on tasks(organisation_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  target_type text not null,
  target_id uuid not null,
  created_at timestamptz not null default now()
);
create index idx_comments_target on comments(target_type, target_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'system',
  read boolean not null default false,
  href text,
  created_at timestamptz not null default now()
);
create index idx_notifs_user on notifications(user_id);

-- AI generations and audit --------------------------------------------------

create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  feature text not null,
  model text not null,
  prompt_version text not null,
  user_id uuid references users(id),
  input_refs text[] not null default '{}',
  output_preview text,
  approval_status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index idx_ai_org on ai_generations(organisation_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  actor_id uuid references users(id),
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text,
  created_at timestamptz not null default now()
);
create index idx_audit_org on audit_events(organisation_id, created_at desc);

-- Enable Row Level Security on every organisation-owned table ---------------

alter table organisations enable row level security;
alter table organisation_members enable row level security;
alter table organisation_profiles enable row level security;
alter table organisation_documents enable row level security;
alter table funders enable row level security;
alter table funding_opportunities enable row level security;
alter table opportunity_eligibility_criteria enable row level security;
alter table opportunity_questions enable row level security;
alter table saved_opportunities enable row level security;
alter table fit_assessments enable row level security;
alter table fit_assessment_factors enable row level security;
alter table applications enable row level security;
alter table application_questions enable row level security;
alter table application_answers enable row level security;
alter table application_answer_versions enable row level security;
alter table application_reviews enable row level security;
alter table grants enable row level security;
alter table grant_payments enable row level security;
alter table grant_conditions enable row level security;
alter table grant_deliverables enable row level security;
alter table grant_reports enable row level security;
alter table programmes enable row level security;
alter table programme_grants enable row level security;
alter table activities enable row level security;
alter table outputs enable row level security;
alter table outcomes enable row level security;
alter table indicators enable row level security;
alter table indicator_measurements enable row level security;
alter table evidence_items enable row level security;
alter table evidence_links enable row level security;
alter table impact_reports enable row level security;
alter table impact_report_sections enable row level security;
alter table tasks enable row level security;
alter table comments enable row level security;
alter table notifications enable row level security;
alter table ai_generations enable row level security;
alter table audit_events enable row level security;
