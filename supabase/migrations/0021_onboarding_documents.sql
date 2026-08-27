-- Pegasus Mission OS: document ingestion and onboarding research.
--
-- MG-3. Additive: no table is dropped and no column is removed.
--
-- The shape here follows the MG-3 rule that an uploaded file is not arbitrary
-- AI context. A document is parsed, structured, reviewed and only then
-- approved, and the schema keeps those four states distinguishable rather than
-- collapsing them into "ingested".

-- ---------------------------------------------------------------------------
-- Documents
--
-- Three tables where a naive design would have one, and each separation earns
-- its place:
--
--   documents          the thing: "our 2025 annual report"
--   document_versions  the bytes, of which there may be several over time
--   document_sources   how it arrived, of which there may also be several
--
-- Splitting the document from its bytes is what lets a corrected report
-- supersede an earlier one without orphaning the claims extracted from it, and
-- what lets a re-crawl notice that a published PDF has changed. Splitting the
-- source off is because a document can legitimately be found on a website *and*
-- published by a regulator, and those arrivals carry different authority.
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_format') then
    create type document_format as enum ('pdf', 'docx', 'csv', 'xlsx', 'txt', 'html', 'unknown');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_kind') then
    create type document_kind as enum (
      'annual_report', 'impact_report', 'accounts', 'strategy', 'evaluation',
      'policy', 'governance', 'funding_agreement', 'data_export', 'other'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_origin') then
    create type document_origin as enum ('upload', 'website_discovery', 'registry', 'integration');
  end if;
end $$;

-- Five states rather than a boolean, deliberately. "Not read yet", "cannot
-- read this format", "read it and the text was unusable" and "it failed" are
-- four different things to a person deciding whether to re-upload, and
-- collapsing them into `parsed = false` is how a product silently ignores a
-- document someone believes it has read.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_parse_status') then
    create type document_parse_status as enum (
      'pending', 'parsed', 'unreadable', 'unsupported_format', 'failed'
    );
  end if;
end $$;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  kind document_kind not null default 'other',
  description text,
  reporting_period text,
  current_version_id uuid,
  -- Declared, never inferred. Documents are the most likely route for
  -- beneficiary data to enter the product, and the default must not be
  -- "safe to send to a model".
  contains_personal_data boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  archived_at timestamptz
);
create index if not exists documents_org_kind_idx on documents (organisation_id, kind);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version integer not null,
  format document_format not null default 'unknown',
  file_name text not null,
  file_size_bytes bigint not null,
  -- SHA-256 of the bytes. Re-uploading an identical file is not a new version,
  -- and without this the review queue doubles every time someone does.
  content_hash text not null,
  storage_key text,
  parse_status document_parse_status not null default 'pending',
  -- Always set when parsing did not produce usable text. A status without a
  -- reason cannot be acted on by the person who uploaded the file.
  parse_note text,
  text_content text,
  page_count integer,
  word_count integer,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  constraint document_versions_unique_version unique (document_id, version)
);
create unique index if not exists document_versions_hash_idx
  on document_versions (organisation_id, content_hash);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_current_version_fkey') then
    alter table documents
    add constraint documents_current_version_fkey
    foreign key (current_version_id) references document_versions(id) on delete set null;
  end if;
end $$;

create table if not exists document_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_id uuid references document_versions(id) on delete set null,
  origin document_origin not null,
  authority source_authority not null,
  url text,
  publisher text,
  retrieved_at timestamptz not null default now(),
  research_source_id uuid
);
create index if not exists document_sources_document_idx
  on document_sources (organisation_id, document_id);

-- ---------------------------------------------------------------------------
-- Extracted claims
--
-- Distinct from `claims`, and the distinction is the entire point of MG-3: a
-- claim is something the organisation asserts, an extracted claim is something
-- a machine thinks a document says. `claim_id` is null until a person has made
-- the transition, and that column being null is the boundary between the two.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'extracted_claim_status') then
    create type extracted_claim_status as enum ('pending', 'approved', 'edited', 'rejected');
  end if;
end $$;

create table if not exists extracted_claims (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_id uuid not null references document_versions(id) on delete cascade,
  predicate text not null,
  value jsonb not null,
  -- The sentence as it appeared. A reviewer must be able to check the claim
  -- against its source, not just read a tidied value.
  excerpt text not null,
  locator text not null,
  extraction_method text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  injection_suspected boolean not null default false,
  status extracted_claim_status not null default 'pending',
  claim_id uuid references claims(id) on delete set null,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- An approved extraction must point at the claim it became. Without this the
  -- link is a convention, and a broken one is invisible.
  constraint extracted_claims_approved_has_claim check (
    status <> 'approved' or claim_id is not null
  )
);
create index if not exists extracted_claims_document_idx
  on extracted_claims (organisation_id, document_id, status);

-- ---------------------------------------------------------------------------
-- Onboarding runs
--
-- Persisted rather than held in a request, and not for convenience: research
-- reaches out to someone's website and to registers that charge per call. A
-- run lost on refresh gets repeated, which is rude to the first and expensive
-- to the second.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'onboarding_stage') then
    create type onboarding_stage as enum (
      'identity', 'website_research', 'registry_research', 'document_discovery',
      'extraction', 'reconciliation', 'review', 'complete'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'onboarding_run_status') then
    create type onboarding_run_status as enum ('running', 'awaiting_review', 'complete', 'failed');
  end if;
end $$;

create table if not exists onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  -- What the organisation told us before any research happened, kept verbatim
  -- so a discrepancy with the register stays visible afterwards.
  input_name text not null,
  input_website_url text,
  input_country text,
  input_registration_number text,
  input_organisation_type text,
  stage onboarding_stage not null default 'identity',
  status onboarding_run_status not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Real counts from the run. Deliberately individual columns rather than a
  -- progress percentage: there is no honest denominator for "how much of an
  -- organisation have we understood".
  count_sources_discovered integer not null default 0,
  count_pages_read integer not null default 0,
  count_documents_found integer not null default 0,
  count_documents_parsed integer not null default 0,
  count_candidates_found integer not null default 0,
  count_conflicts integer not null default 0,
  degraded_reason text,
  degraded_guidance text,
  started_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboarding_runs_org_started_idx
  on onboarding_runs (organisation_id, started_at desc);

create table if not exists research_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references onboarding_runs(id) on delete cascade,
  type text not null,
  title text,
  url text not null,
  publisher text,
  authority source_authority not null,
  discovered_at timestamptz not null default now(),
  retrieved_at timestamptz,
  published_at timestamptz,
  content_hash text,
  extraction_status text not null default 'discovered',
  -- Why retrieval or extraction did not complete. A source recorded as failed
  -- without a reason cannot be explained to the user or retried sensibly.
  failure_reason text,
  metadata jsonb
);
create index if not exists research_sources_run_idx
  on research_sources (organisation_id, run_id);

-- ---------------------------------------------------------------------------
-- Profile candidates
--
-- The heart of the review boundary. Every row here is something Pegasus read
-- and has NOT asserted. `verification` is constrained accordingly: extraction
-- cannot mint a verified value however confident it is, which is the same rule
-- `assertProducerMayAssign` enforces in the Knowledge layer.
-- ---------------------------------------------------------------------------
create table if not exists profile_candidates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references onboarding_runs(id) on delete cascade,
  field text not null,
  value text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  method text not null,
  source_id uuid,
  source_url text not null,
  authority source_authority not null,
  -- Where in the source, to the character offset where possible. This is what
  -- makes "where did you get this?" answerable rather than gestured at.
  locator text not null,
  extracted_at timestamptz not null default now(),
  verification verification_state not null default 'ai_extracted',
  injection_suspected boolean not null default false,
  document_id uuid references documents(id) on delete set null,
  document_version_id uuid references document_versions(id) on delete set null,
  excerpt text,
  constraint profile_candidates_never_self_verified check (
    verification in ('ai_extracted', 'needs_review', 'outdated')
  )
);
create index if not exists profile_candidates_run_idx
  on profile_candidates (organisation_id, run_id, field);

-- The human decision. Recorded as its own row rather than as a status column,
-- because who decided and when is the audit trail for the one transition in
-- the pipeline that a person is required to make.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'candidate_decision') then
    create type candidate_decision as enum ('confirm', 'edit', 'reject');
  end if;
end $$;

create table if not exists candidate_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  run_id uuid not null references onboarding_runs(id) on delete cascade,
  candidate_id uuid not null references profile_candidates(id) on delete cascade,
  decision candidate_decision not null,
  edited_value text,
  claim_id uuid references claims(id) on delete set null,
  decided_by uuid references users(id),
  decided_at timestamptz not null default now(),
  -- An edit without a value is not an edit.
  constraint candidate_decisions_edit_has_value check (
    decision <> 'edit' or edited_value is not null
  )
);
create unique index if not exists candidate_decisions_one_per_candidate_idx
  on candidate_decisions (candidate_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Written out per table rather than issued from a loop, so
-- `tests/unit/schema-invariants.test.ts` can see them. Audit finding S1 was
-- invisible precisely because nothing could tell which tables had been covered.
-- ---------------------------------------------------------------------------
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table document_sources enable row level security;
alter table extracted_claims enable row level security;
alter table onboarding_runs enable row level security;
alter table research_sources enable row level security;
alter table profile_candidates enable row level security;
alter table candidate_decisions enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'documents', 'document_versions', 'document_sources', 'extracted_claims',
    'onboarding_runs', 'research_sources', 'profile_candidates', 'candidate_decisions'
  ]
  loop
    execute format('drop policy if exists %I_member_all on %I', t, t);
    execute format(
      'create policy %I_member_all on %I for all
         using (is_org_member(organisation_id))
         with check (is_org_member(organisation_id))',
      t, t
    );
  end loop;
end $$;

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at
  before update on documents
  for each row execute function set_updated_at();
drop trigger if exists onboarding_runs_set_updated_at on onboarding_runs;
create trigger onboarding_runs_set_updated_at
  before update on onboarding_runs
  for each row execute function set_updated_at();
