create table commercial_discovery_runs (
  id uuid primary key default gen_random_uuid(), job_key text not null,
  mode text not null check(mode='pilot'), provider_versions jsonb not null,
  query_snapshot jsonb not null, icp_version text not null, scoring_version text not null,
  candidate_limit int not null check(candidate_limit between 1 and 25), recommendation_limit int not null check(recommendation_limit between 1 and 10),
  results_count int not null default 0, error_metadata jsonb, cost numeric, duration_ms int,
  created_by uuid not null references internal_users(id), created_at timestamptz not null default now()
);
create table pilot_recommendations (
  id uuid primary key default gen_random_uuid(), discovery_run_id uuid not null references commercial_discovery_runs(id) on delete restrict,
  prospect_organisation_id uuid not null references prospect_organisations(id) on delete restrict,
  motion text not null check(motion in('studio','mission_os')), icp_id text not null,
  rank int not null check(rank between 1 and 10), fit int not null check(fit between 0 and 100), intent int not null check(intent between 0 and 100), confidence int not null check(confidence between 0 and 100),
  system_reasons jsonb not null, signal_state jsonb not null, research_state jsonb not null,
  provider_contributions jsonb not null, unknown_count int not null, source_count int not null, official_source_count int not null, conflict_count int not null,
  created_at timestamptz not null default now(), unique(discovery_run_id,prospect_organisation_id)
);
create table pilot_founder_reviews (
  id uuid primary key default gen_random_uuid(), recommendation_id uuid not null unique references pilot_recommendations(id) on delete restrict,
  disposition text not null check(disposition in('contact_now','nurture','reject','needs_research')),
  rejection_reasons text[] not null default '{}', founder_note text, reviewed_by uuid not null references internal_users(id), reviewed_at timestamptz not null default now(),
  check((disposition='reject' and cardinality(rejection_reasons)>0) or (disposition<>'reject' and cardinality(rejection_reasons)=0))
);
create table commercial_discovery_misses (
  id uuid primary key default gen_random_uuid(), organisation text not null, motion text not null check(motion in('studio','mission_os')), icp_id text not null,
  why_it_matters text not null, evidence text, created_by uuid not null references internal_users(id), created_at timestamptz not null default now()
);
create table calibration_recommendations (
  id uuid primary key default gen_random_uuid(), observation text not null, sample_size int not null check(sample_size>0), affected_motion text check(affected_motion in('studio','mission_os')),
  affected_icp text, suggested_change text not null, expected_effect text not null, confidence int not null check(confidence between 0 and 100),
  status text not null check(status in('proposed','approved','rejected','implemented')), created_at timestamptz not null default now()
);
alter table commercial_discovery_runs enable row level security; alter table pilot_recommendations enable row level security; alter table pilot_founder_reviews enable row level security; alter table commercial_discovery_misses enable row level security; alter table calibration_recommendations enable row level security;
grant select,insert,update on commercial_discovery_runs,pilot_recommendations,pilot_founder_reviews,commercial_discovery_misses,calibration_recommendations to authenticated;
create policy pilot_runs_access on commercial_discovery_runs for all using(is_active_internal_user()) with check(internal_has_role(array['super_admin','operations','sales']::internal_role[]));
create policy pilot_recommendations_access on pilot_recommendations for all using(is_active_internal_user()) with check(internal_has_role(array['super_admin','operations','sales']::internal_role[]));
create policy pilot_reviews_access on pilot_founder_reviews for all using(is_active_internal_user()) with check(internal_has_role(array['super_admin','operations','sales']::internal_role[]));
create policy discovery_misses_access on commercial_discovery_misses for all using(is_active_internal_user()) with check(internal_has_role(array['super_admin','operations','sales']::internal_role[]));
create policy calibration_recommendations_access on calibration_recommendations for all using(is_active_internal_user()) with check(internal_has_role(array['super_admin','operations','sales']::internal_role[]));
