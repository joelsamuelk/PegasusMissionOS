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

create type portal_audience as enum (
  'funder', 'beneficiary', 'volunteer', 'partner', 'trustee', 'applicant'
);

create type portal_status as enum ('draft', 'open', 'closed');

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

create trigger portals_set_updated_at
  before update on portals for each row execute function set_updated_at();

create type portal_identity_status as enum ('invited', 'active', 'suspended');

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

create type portal_submission_kind as enum (
  'report_response', 'evidence', 'availability', 'expression_of_interest', 'approval'
);

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

create policy portals_member_all on portals for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy portal_identities_member_all on portal_identities for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy portal_memberships_member_all on portal_memberships for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy portal_submissions_member_all on portal_submissions for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));
create policy portal_messages_member_all on portal_messages for all
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

-- A grant is the record of a decision to share something outside the
-- organisation. It is insertable and revocable and never editable: changing
-- which record a grant points at, after the fact, would rewrite the history of
-- what was shared with whom.
create policy portal_grants_member_read on portal_grants for select
  using (is_org_member(organisation_id));
create policy portal_grants_member_insert on portal_grants for insert
  with check (is_org_member(organisation_id));
create policy portal_grants_member_revoke on portal_grants for update
  using (is_org_member(organisation_id)) with check (is_org_member(organisation_id));

comment on table portal_grants is
  'One record shared with one membership. There is no traversal from a granted '
  'record to a related one: reaching a second thing requires a second grant.';
comment on table portal_identities is
  'Not users. Separate table, separate id space, separate authentication path.';
