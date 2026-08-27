-- Operational entry points for Process Intelligence. Internal mutations are
-- capability checked in Postgres and audited in the same transaction.

create or replace function control_create_process_organisation(
  p_name text, p_legal_name text, p_type text, p_request_id text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not internal_has_role(array['super_admin','operations']::internal_role[]) then
    raise exception 'organisation:create capability required';
  end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_legal_name),'') is null or nullif(trim(p_type),'') is null then
    raise exception 'name, legal name and type are required';
  end if;
  insert into organisations(name,legal_name,type,created_by) values(trim(p_name),trim(p_legal_name),trim(p_type),null) returning id into v_id;
  insert into internal_audit_events(actor_id,action,target_type,target_id,organisation_id,request_id,after_metadata)
  values(auth.uid(),'organisation.create','organisation',v_id::text,v_id,p_request_id,jsonb_build_object('name',trim(p_name),'type',trim(p_type)));
  return v_id;
end $$;

create or replace function control_list_process_organisations()
returns table(id uuid,name text,legal_name text,type text,campaign_count bigint,process_count bigint)
language sql security definer set search_path=public stable as $$
 select o.id,o.name,o.legal_name,o.type,count(distinct c.id),count(distinct s.id)
 from organisations o left join process_intake_campaigns c on c.organisation_id=o.id
 left join process_submissions s on s.organisation_id=o.id
 where is_active_internal_user() and o.archived_at is null group by o.id,o.name,o.legal_name,o.type order by o.name
$$;

create or replace function control_create_process_campaign(
  p_organisation_id uuid, p_name text, p_description text, p_closes_at timestamptz,
  p_anonymous_allowed boolean, p_identification_required boolean, p_request_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_campaign uuid; v_token text; v_token_id uuid;
begin
  if not internal_has_role(array['super_admin','operations']::internal_role[]) then
    raise exception 'organisation:create capability required';
  end if;
  if not exists(select 1 from organisations where id=p_organisation_id and archived_at is null) then raise exception 'organisation not found'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'campaign name required'; end if;
  insert into process_intake_campaigns(organisation_id,name,description,status,opens_at,closes_at,anonymous_allowed,participant_identification_required,created_by)
  values(p_organisation_id,trim(p_name),nullif(trim(p_description),''),'active',now(),p_closes_at,p_anonymous_allowed,p_identification_required,auth.uid()) returning id into v_campaign;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into process_invitation_tokens(organisation_id,campaign_id,token_digest,expires_at)
  values(p_organisation_id,v_campaign,encode(extensions.digest(v_token,'sha256'),'hex'),coalesce(p_closes_at,now()+interval '90 days')) returning id into v_token_id;
  insert into internal_audit_events(actor_id,action,target_type,target_id,organisation_id,request_id,after_metadata)
  values(auth.uid(),'process_campaign.create','process_intake_campaign',v_campaign::text,p_organisation_id,p_request_id,jsonb_build_object('name',trim(p_name),'general_token_id',v_token_id));
  return jsonb_build_object('campaignId',v_campaign,'token',v_token);
end $$;

create or replace function public_process_submit(
  p_token text, p_identity jsonb, p_submission jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_token process_invitation_tokens%rowtype; v_campaign process_intake_campaigns%rowtype; v_participant uuid; v_submission uuid;
begin
  select * into v_token from process_invitation_tokens where token_digest=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now() for update;
  if not found then raise exception 'intake link is invalid or expired'; end if;
  select * into strict v_campaign from process_intake_campaigns where id=v_token.campaign_id and status='active'
    and (opens_at is null or opens_at<=now()) and (closes_at is null or closes_at>now());
  v_participant := v_token.participant_id;
  if v_participant is null and (p_identity->>'email') is not null then
    insert into process_participants(organisation_id,campaign_id,first_name,last_name,email,department,team,job_title,invitation_status,started_at,last_activity_at)
    values(v_token.organisation_id,v_token.campaign_id,nullif(trim(p_identity->>'firstName'),''),nullif(trim(p_identity->>'lastName'),''),lower(trim(p_identity->>'email')),
      nullif(trim(p_identity->>'department'),''),nullif(trim(p_identity->>'team'),''),nullif(trim(p_identity->>'jobTitle'),''),'started',now(),now())
    on conflict(campaign_id,email) do update set last_activity_at=now() returning id into v_participant;
  end if;
  if v_campaign.participant_identification_required and v_participant is null and not v_campaign.anonymous_allowed then raise exception 'participant identification is required'; end if;
  insert into process_submissions(organisation_id,campaign_id,participant_id,process_name,narrative,frequency,occurrences_per_year,duration_minutes,people_count,
    friction_text,human_judgement_text,sensitive_data,magic_removal,systems,annual_hours,effort_assumptions)
  values(v_token.organisation_id,v_token.campaign_id,v_participant,trim(p_submission->>'name'),trim(p_submission->>'narrative'),p_submission->>'frequency',
    nullif(p_submission->>'occurrencesPerYear','')::numeric,greatest(0,coalesce(nullif(p_submission->>'durationMinutes','')::int,0)),greatest(1,coalesce(nullif(p_submission->>'peopleCount','')::int,1)),
    nullif(trim(p_submission->>'friction'),''),nullif(trim(p_submission->>'humanJudgement'),''),coalesce(array(select jsonb_array_elements_text(p_submission->'sensitiveData')),'{}'),
    nullif(trim(p_submission->>'magicRemoval'),''),coalesce(array(select jsonb_array_elements_text(p_submission->'systems')),'{}'),
    greatest(0,coalesce(nullif(p_submission->>'annualHours','')::numeric,0)),coalesce(p_submission->'effortAssumptions','{}')) returning id into v_submission;
  update process_invitation_tokens set last_used_at=now() where id=v_token.id;
  if v_participant is not null then update process_participants set invitation_status='submitted',last_activity_at=now(),completed_first_process_at=coalesce(completed_first_process_at,now()),processes_submitted=processes_submitted+1 where id=v_participant; end if;
  return v_submission;
end $$;

revoke all on function control_create_process_organisation(text,text,text,text),control_list_process_organisations(),control_create_process_campaign(uuid,text,text,timestamptz,boolean,boolean,text),public_process_submit(text,jsonb,jsonb) from public;
grant execute on function control_create_process_organisation(text,text,text,text),control_list_process_organisations(),control_create_process_campaign(uuid,text,text,timestamptz,boolean,boolean,text) to authenticated;
grant execute on function public_process_submit(text,jsonb,jsonb) to anon,authenticated;
