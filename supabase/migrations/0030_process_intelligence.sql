-- Process Intelligence: source evidence, derived interpretations and measured outcomes.
create type process_campaign_status as enum ('draft','active','paused','closed','archived');
create type process_invitation_status as enum ('not_invited','invited','opened','started','submitted','declined');
create type process_analysis_status as enum ('queued','processing','complete','failed');
create type process_review_decision as enum ('approve','needs_research','modify','defer','reject');
create type transformation_status as enum ('discovered','analysed','approved','designing','building','pilot','live','measuring','complete');

create table process_intake_campaigns (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 name text not null, description text, welcome_message text, status process_campaign_status not null default 'draft',
 opens_at timestamptz, closes_at timestamptz, anonymous_allowed boolean not null default false,
 participant_identification_required boolean not null default true, voice_enabled boolean not null default true,
 general_link_enabled boolean not null default true, created_by uuid references internal_users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_pi_campaign_org on process_intake_campaigns(organisation_id, status);

create table process_participants (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 campaign_id uuid not null references process_intake_campaigns(id) on delete cascade, first_name text, last_name text, email text,
 department text, team text, job_title text, invitation_status process_invitation_status not null default 'not_invited',
 invitation_sent_at timestamptz, first_opened_at timestamptz, started_at timestamptz, last_activity_at timestamptz,
 completed_first_process_at timestamptz, processes_submitted integer not null default 0, created_at timestamptz not null default now(),
 unique(campaign_id, email)
);
create index idx_pi_participant_org on process_participants(organisation_id, campaign_id);

-- Only a SHA-256 digest is retained. The bearer secret exists in the invitation URL, not this table.
create table process_invitation_tokens (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 campaign_id uuid not null references process_intake_campaigns(id) on delete cascade,
 participant_id uuid references process_participants(id) on delete cascade, token_digest text not null unique,
 expires_at timestamptz not null, revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz not null default now()
);

create table process_submissions (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 campaign_id uuid not null references process_intake_campaigns(id), participant_id uuid references process_participants(id),
 process_name text not null, narrative text not null, frequency text not null, occurrences_per_year numeric,
 duration_minutes integer not null check(duration_minutes >= 0), people_count integer not null default 1 check(people_count > 0),
 trigger_text text, output_text text, friction_text text, failure_text text, manual_work_text text, waiting_text text,
 human_judgement_text text, sensitive_data text[] not null default '{}', magic_removal text, systems text[] not null default '{}',
 annual_hours numeric not null default 0, effort_assumptions jsonb not null default '{}', submitted_at timestamptz not null default now(),
 analysis_status process_analysis_status not null default 'queued', analysis_error_code text, retain_until timestamptz
);
create index idx_pi_submission_org on process_submissions(organisation_id, campaign_id, submitted_at desc);

create table process_audio_assets (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 submission_id uuid references process_submissions(id) on delete cascade, storage_path text not null, mime_type text not null,
 byte_size bigint not null, duration_seconds integer, transcription text, transcription_provider text, transcription_model text,
 transcription_status process_analysis_status not null default 'queued', created_at timestamptz not null default now(), retain_until timestamptz
);

create table process_ai_analyses (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 submission_id uuid not null references process_submissions(id) on delete cascade, provider text not null, model text not null,
 analysis_version text not null, prompt_version text not null, structured_output jsonb not null,
 confidence numeric check(confidence between 0 and 1), created_at timestamptz not null default now(), unique(submission_id, analysis_version)
);
create table process_steps (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 submission_id uuid not null references process_submissions(id) on delete cascade, analysis_id uuid not null references process_ai_analyses(id),
 step_order integer not null, title text not null, description text, actor text, system_name text, estimated_duration_minutes integer,
 automation_state text not null default 'manual', decision_required boolean not null default false,
 human_judgement_required boolean not null default false, approval_required boolean not null default false,
 data_input text, data_output text, classification text not null default 'UNKNOWN', reasoning text, confidence numeric check(confidence between 0 and 1),
 unique(submission_id, analysis_id, step_order)
);
create index idx_pi_steps_submission on process_steps(submission_id, step_order);

create table process_ai_opportunities (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 submission_id uuid not null references process_submissions(id) on delete cascade, analysis_id uuid not null references process_ai_analyses(id),
 title text not null, problem text not null, current_state text, proposed_state text, opportunity_type text not null,
 expected_benefit text, estimated_recoverable_hours numeric, complexity text, systems text[] not null default '{}',
 integration_requirements text[], data_requirements text[], oversight_requirements text[], risks text[], controls text[],
 confidence numeric check(confidence between 0 and 1), opportunity_score integer not null check(opportunity_score between 0 and 100),
 score_components jsonb not null, created_at timestamptz not null default now()
);
create table process_reviews (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 opportunity_id uuid not null references process_ai_opportunities(id) on delete cascade, reviewer_id uuid not null references internal_users(id),
 decision process_review_decision not null, rejection_reason text, reviewer_changes jsonb, original_recommendation jsonb not null,
 created_at timestamptz not null default now(), check(decision <> 'reject' or rejection_reason is not null)
);
create table transformation_initiatives (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 opportunity_id uuid references process_ai_opportunities(id), name text not null, owner_id uuid references internal_users(id), department text,
 expected_outcome text, baseline jsonb not null default '{}', target jsonb not null default '{}', implementation_approach text,
 systems text[], dependencies text[], risks text[], controls text[], milestones jsonb not null default '[]',
 status transformation_status not null default 'discovered', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table transformation_measurements (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade,
 initiative_id uuid not null references transformation_initiatives(id) on delete cascade, measurement_type text not null,
 observed_metric double precision not null, unit text not null, measurement_kind text not null check(measurement_kind in ('baseline','target','actual')),
 measured_at timestamptz not null, source text, notes text, created_at timestamptz not null default now()
);

-- Every internal relation is tenant scoped through the existing membership policy.
alter table process_intake_campaigns enable row level security; alter table process_participants enable row level security;
alter table process_invitation_tokens enable row level security; alter table process_submissions enable row level security;
alter table process_audio_assets enable row level security; alter table process_ai_analyses enable row level security;
alter table process_steps enable row level security; alter table process_ai_opportunities enable row level security;
alter table process_reviews enable row level security; alter table transformation_initiatives enable row level security;
alter table transformation_measurements enable row level security;
do $$ declare t text; begin foreach t in array array['process_intake_campaigns','process_participants','process_invitation_tokens','process_submissions','process_audio_assets','process_ai_analyses','process_steps','process_ai_opportunities','process_reviews','transformation_initiatives','transformation_measurements'] loop
 execute format('create policy %I on %I for all to authenticated using (is_org_member(organisation_id)) with check (is_org_member(organisation_id))', t || '_tenant', t);
end loop; end $$;

-- Tokens are resolved server-side. This deliberately returns only intake-safe campaign/participant fields.
create or replace function resolve_process_intake_token(p_token text) returns jsonb language sql security definer set search_path=public stable as $$
 select jsonb_build_object('campaignId',c.id,'campaignName',c.name,'organisationName',o.name,'welcomeMessage',c.welcome_message,
  'voiceEnabled',c.voice_enabled,'identificationRequired',c.participant_identification_required,'participant',
  case when p.id is null then null else jsonb_build_object('firstName',p.first_name,'department',p.department,'team',p.team,'jobTitle',p.job_title) end)
 from process_invitation_tokens t join process_intake_campaigns c on c.id=t.campaign_id join organisations o on o.id=c.organisation_id
 left join process_participants p on p.id=t.participant_id
 where t.token_digest=encode(digest(p_token,'sha256'),'hex') and t.revoked_at is null and t.expires_at>now()
 and c.status='active' and (c.opens_at is null or c.opens_at<=now()) and (c.closes_at is null or c.closes_at>now()) limit 1 $$;
revoke all on function resolve_process_intake_token(text) from public;
grant execute on function resolve_process_intake_token(text) to anon, authenticated;
