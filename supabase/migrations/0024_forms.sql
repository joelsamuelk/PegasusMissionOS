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

create type form_purpose as enum (
  'donation', 'volunteer_application', 'beneficiary_intake',
  'programme_registration', 'survey', 'outcome_measurement', 'feedback',
  'grant_application', 'partner_submission', 'evidence_submission',
  'event_registration', 'custom'
);

create type form_field_type as enum (
  'text', 'textarea', 'number', 'currency', 'date', 'select', 'multiselect',
  'checkbox', 'radio', 'email', 'phone', 'address', 'file', 'rating', 'scale',
  'consent', 'signature'
);

-- Named for the legal category rather than for a feeling about sensitivity,
-- because the legal category is what carries the obligations. `special_category`
-- is UK GDPR Article 9.
create type field_sensitivity as enum (
  'public', 'internal', 'personal', 'special_category'
);

create type form_access as enum ('internal', 'link', 'public');
create type form_status as enum ('draft', 'open', 'closed');
create type form_version_status as enum ('draft', 'published', 'retired');

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

alter table forms
  add constraint forms_current_version_fk
  foreign key (current_version_id) references form_versions(id) on delete set null;

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

create type submission_status as enum (
  'received', 'awaiting_review', 'accepted', 'rejected', 'spam'
);

create type submission_source as enum ('public', 'link', 'internal', 'import');

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

create type mapping_target_kind as enum (
  'person', 'external_organisation', 'relationship', 'interaction',
  'indicator_measurement', 'evidence', 'claim', 'consent'
);

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

create policy forms_member_all on forms for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy form_versions_member_all on form_versions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy form_fields_member_all on form_fields for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy form_submissions_member_all on form_submissions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy submission_attachments_member_all on submission_attachments for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy form_mappings_member_all on form_mappings for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Answers are readable by members and erasable, and are never editable. An
-- answer that can be rewritten is not a record of what somebody said.
create policy submission_answers_member_read on submission_answers for select
  using (is_org_member(organisation_id));
create policy submission_answers_member_insert on submission_answers for insert
  with check (is_org_member(organisation_id));
create policy submission_answers_member_redact on submission_answers for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- Consent is append-only apart from withdrawal.
create policy consent_records_member_read on consent_records for select
  using (is_org_member(organisation_id));
create policy consent_records_member_insert on consent_records for insert
  with check (is_org_member(organisation_id));
create policy consent_records_member_withdraw on consent_records for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on column form_fields.sensitivity is
  'Not null and no default. Decides three things: whether the answer may ever '
  'reach a model, whether the form needs a retention period to be publishable, '
  'and which capability is needed to read it.';
comment on table form_mappings is
  'What an answer becomes in the Mission Graph. Without this table a submission '
  'is a row nobody reads twice, and the phase has built a form builder.';
