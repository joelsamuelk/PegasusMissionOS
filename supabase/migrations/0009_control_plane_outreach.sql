create table outreach_templates(id uuid primary key default gen_random_uuid(),name text not null,subject text not null,body text not null,status text not null check(status in('draft','active','archived')),created_by uuid not null references internal_users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table outreach_sequences(id uuid primary key default gen_random_uuid(),name text not null,status text not null check(status in('draft','active','paused','archived')),created_by uuid not null references internal_users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table sequence_steps(id uuid primary key default gen_random_uuid(),sequence_id uuid not null references outreach_sequences(id) on delete cascade,position int not null check(position>0),template_id uuid not null references outreach_templates(id),delay_days int not null default 0 check(delay_days>=0),unique(sequence_id,position));
create table contact_compliance(prospect_person_id uuid primary key references prospect_people(id) on delete cascade,contact_source_url text not null,contact_source_retrieved_at timestamptz not null,lawful_basis text not null check(lawful_basis in('consent','legitimate_interests','contract','none_recorded')),lawful_basis_note text,consent_recorded_at timestamptz,do_not_contact boolean not null default false,unsubscribed_at timestamptz,updated_at timestamptz not null default now());
create table sequence_enrollments(id uuid primary key default gen_random_uuid(),sequence_id uuid not null references outreach_sequences(id),prospect_person_id uuid not null references prospect_people(id),status text not null check(status in('pending_approval','active','paused','completed','cancelled','suppressed')),current_step int not null default 0,enrolled_by uuid not null references internal_users(id),enrolled_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(sequence_id,prospect_person_id));
create table outreach_send_requests(id uuid primary key default gen_random_uuid(),prospect_person_id uuid not null references prospect_people(id),sequence_enrollment_id uuid references sequence_enrollments(id),template_id uuid references outreach_templates(id),subject text not null,body text not null,state text not null check(state in('draft','pending_approval','approved','blocked','queued','sent','failed','replied')),initial_outbound boolean not null default true,approved_by uuid references internal_users(id),approved_at timestamptz,blocked_reason text,idempotency_key text not null unique,created_by uuid not null references internal_users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(not initial_outbound or state not in('approved','queued','sent') or approved_by is not null));
alter table outreach_templates enable row level security;
alter table outreach_sequences enable row level security;
alter table sequence_steps enable row level security;
alter table contact_compliance enable row level security;
alter table sequence_enrollments enable row level security;
alter table outreach_send_requests enable row level security;
do $$ declare t text;begin foreach t in array array['outreach_templates','outreach_sequences','sequence_steps','contact_compliance','sequence_enrollments','outreach_send_requests'] loop execute format('grant select,insert,update on %I to authenticated',t);execute format('create policy %I_select on %I for select using(is_active_internal_user())',t,t);execute format('create policy %I_write on %I for all using(internal_has_role(array[''super_admin'',''operations'',''sales'']::internal_role[])) with check(internal_has_role(array[''super_admin'',''operations'',''sales'']::internal_role[]))',t,t);end loop;end $$;

-- Defence in depth: direct table access cannot turn an initial request into an
-- approved/sendable state without a sales-capable human and valid compliance.
create or replace function enforce_outreach_send_approval()
returns trigger language plpgsql security definer set search_path=public as $$
declare compliance contact_compliance%rowtype;
begin
  if new.initial_outbound and new.state in ('approved','queued','sent') then
    if not internal_has_role(array['super_admin','sales']::internal_role[]) then raise exception 'outreach:send capability required'; end if;
    if new.approved_by is distinct from auth.uid() or new.approved_at is null then raise exception 'human approval required'; end if;
    select * into compliance from contact_compliance where prospect_person_id=new.prospect_person_id;
    if not found or compliance.do_not_contact or compliance.unsubscribed_at is not null or compliance.lawful_basis='none_recorded' then raise exception 'contact compliance blocks outreach'; end if;
    if compliance.lawful_basis='legitimate_interests' and nullif(trim(compliance.lawful_basis_note),'') is null then raise exception 'legitimate-interests reasoning required'; end if;
  end if;
  return new;
end $$;
create trigger outreach_send_approval_guard before insert or update on outreach_send_requests for each row execute function enforce_outreach_send_approval();
revoke all on function enforce_outreach_send_approval() from public;
