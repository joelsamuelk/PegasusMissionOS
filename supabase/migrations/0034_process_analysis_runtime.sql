-- Process analysis: the stage between a captured submission and a reviewable
-- opportunity. Submissions have sat at 'queued' since 0030 because nothing
-- moved them; these are the entry points the analyser uses.
--
-- The model call happens in the application, between a claim and a record.
-- The claim exists so two operators pressing Analyse do not pay for, and then
-- race to write, the same analysis. A claim older than ten minutes is treated
-- as abandoned (a crashed or timed-out request), so a submission can never be
-- stuck in 'processing' for good.

alter table process_submissions add column if not exists analysis_started_at timestamptz;
alter table process_ai_opportunities
  add column if not exists recoverable_share numeric check (recoverable_share between 0 and 1),
  add column if not exists step_orders integer[] not null default '{}',
  add column if not exists evidence_fields text[] not null default '{}';

create or replace function control_claim_process_analysis(p_submission_id uuid, p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_s process_submissions%rowtype; v_p process_participants%rowtype;
begin
  if not internal_has_role(array['super_admin','operations']::internal_role[]) then
    raise exception 'process:analyse capability required';
  end if;
  select * into v_s from process_submissions where id=p_submission_id for update;
  if not found then raise exception 'process submission not found'; end if;
  if v_s.analysis_status='processing' and v_s.analysis_started_at > now() - interval '10 minutes' then
    return jsonb_build_object('claimed',false,'reason','in_progress');
  end if;
  -- Re-analysis replaces opportunities. Once a person has reviewed one, the
  -- review is the record and must not be cascaded away by a rerun.
  if exists(select 1 from process_reviews r join process_ai_opportunities a on a.id=r.opportunity_id where a.submission_id=v_s.id) then
    return jsonb_build_object('claimed',false,'reason','reviewed');
  end if;
  update process_submissions set analysis_status='processing',analysis_started_at=now(),analysis_error_code=null where id=v_s.id;
  insert into internal_audit_events(actor_id,action,target_type,target_id,organisation_id,request_id,before_metadata)
  values(auth.uid(),'process_analysis.claim','process_submission',v_s.id::text,v_s.organisation_id,p_request_id,jsonb_build_object('analysis_status',v_s.analysis_status));
  select * into v_p from process_participants where id=v_s.participant_id;
  return jsonb_build_object('claimed',true,'submission',jsonb_build_object(
    'name',v_s.process_name,'department',v_p.department,'team',v_p.team,'jobTitle',v_p.job_title,
    'frequency',v_s.frequency,'occurrencesPerYear',coalesce(v_s.occurrences_per_year,(v_s.effort_assumptions->>'occurrencesPerYear')::numeric),
    'durationMinutes',v_s.duration_minutes,'peopleCount',v_s.people_count,'annualHours',v_s.annual_hours,'systems',v_s.systems,
    'narrative',v_s.narrative,'friction',v_s.friction_text,'humanJudgement',v_s.human_judgement_text,
    'sensitiveData',v_s.sensitive_data,'magicRemoval',v_s.magic_removal));
end $$;

create or replace function control_record_process_analysis(p_submission_id uuid, p_analysis jsonb, p_request_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_s process_submissions%rowtype; v_analysis uuid; v_replaced jsonb;
begin
  if not internal_has_role(array['super_admin','operations']::internal_role[]) then
    raise exception 'process:analyse capability required';
  end if;
  select * into v_s from process_submissions where id=p_submission_id for update;
  if not found then raise exception 'process submission not found'; end if;
  if v_s.analysis_status<>'processing' then raise exception 'process submission is not claimed for analysis'; end if;
  select coalesce(jsonb_agg(id),'[]') into v_replaced from process_ai_analyses where submission_id=v_s.id;
  delete from process_ai_opportunities where submission_id=v_s.id;
  delete from process_steps where submission_id=v_s.id;
  delete from process_ai_analyses where submission_id=v_s.id;

  insert into process_ai_analyses(organisation_id,submission_id,provider,model,analysis_version,prompt_version,structured_output,confidence)
  values(v_s.organisation_id,v_s.id,p_analysis->>'provider',p_analysis->>'model',p_analysis->>'analysisVersion',p_analysis->>'promptVersion',p_analysis,(p_analysis->>'confidence')::numeric)
  returning id into v_analysis;

  insert into process_steps(organisation_id,submission_id,analysis_id,step_order,title,description,actor,system_name,decision_required,
    human_judgement_required,approval_required,data_input,data_output,classification,reasoning,confidence)
  select v_s.organisation_id,v_s.id,v_analysis,(x->>'order')::int,x->>'title',x->>'description',x->>'actor',x->>'system',
    coalesce((x->>'decisionRequired')::boolean,false),coalesce((x->>'humanJudgementRequired')::boolean,false),coalesce((x->>'approvalRequired')::boolean,false),
    x->>'dataInput',x->>'dataOutput',x->>'classification',x->>'reasoning',(x->>'confidence')::numeric
  from jsonb_array_elements(coalesce(p_analysis->'steps','[]')) x;

  insert into process_ai_opportunities(organisation_id,submission_id,analysis_id,title,problem,current_state,proposed_state,opportunity_type,
    expected_benefit,estimated_recoverable_hours,recoverable_share,complexity,systems,integration_requirements,data_requirements,oversight_requirements,
    risks,controls,confidence,opportunity_score,score_components,step_orders,evidence_fields)
  select v_s.organisation_id,v_s.id,v_analysis,x->>'title',x->>'problem',x->>'currentState',x->>'proposedState',x->>'opportunityType',
    x->>'expectedBenefit',(x->>'estimatedRecoverableHours')::numeric,(x->>'recoverableShare')::numeric,x->>'complexity',
    coalesce(array(select jsonb_array_elements_text(x->'systems')),'{}'),
    array(select jsonb_array_elements_text(x->'integrationRequirements')),array(select jsonb_array_elements_text(x->'dataRequirements')),
    array(select jsonb_array_elements_text(x->'oversightRequirements')),array(select jsonb_array_elements_text(x->'risks')),
    array(select jsonb_array_elements_text(x->'controls')),(x->>'confidence')::numeric,(x->'score'->>'score')::int,x->'score',
    coalesce(array(select jsonb_array_elements_text(x->'stepOrders')::int),'{}'),coalesce(array(select jsonb_array_elements_text(x->'evidenceFields')),'{}')
  from jsonb_array_elements(coalesce(p_analysis->'opportunities','[]')) x;

  update process_submissions set analysis_status='complete',analysis_error_code=null where id=v_s.id;
  insert into internal_audit_events(actor_id,action,target_type,target_id,organisation_id,request_id,after_metadata)
  values(auth.uid(),'process_analysis.record','process_submission',v_s.id::text,v_s.organisation_id,p_request_id,jsonb_build_object(
    'analysis_id',v_analysis,'replaced_analysis_ids',v_replaced,'model',p_analysis->>'model','analysis_version',p_analysis->>'analysisVersion',
    'steps',jsonb_array_length(coalesce(p_analysis->'steps','[]')),'opportunities',jsonb_array_length(coalesce(p_analysis->'opportunities','[]'))));
  return v_analysis;
end $$;

create or replace function control_fail_process_analysis(p_submission_id uuid, p_error_code text, p_request_id text)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  if not internal_has_role(array['super_admin','operations']::internal_role[]) then
    raise exception 'process:analyse capability required';
  end if;
  update process_submissions set analysis_status='failed',analysis_error_code=left(p_error_code,64)
  where id=p_submission_id and analysis_status='processing' returning organisation_id into v_org;
  if v_org is null then return; end if;
  insert into internal_audit_events(actor_id,action,target_type,target_id,organisation_id,request_id,after_metadata)
  values(auth.uid(),'process_analysis.fail','process_submission',p_submission_id::text,v_org,p_request_id,jsonb_build_object('error_code',left(p_error_code,64)));
end $$;

-- Organisation-wide ranked view: the list a delivery conversation starts from.
create or replace function control_list_process_opportunities(p_organisation_id uuid)
returns table(id uuid,submission_id uuid,process_name text,department text,title text,problem text,proposed_state text,opportunity_type text,
  opportunity_score integer,estimated_recoverable_hours numeric,complexity text,confidence numeric,review_decision process_review_decision)
language sql security definer set search_path=public stable as $$
 select a.id,a.submission_id,s.process_name,p.department,a.title,a.problem,a.proposed_state,a.opportunity_type,a.opportunity_score,
  a.estimated_recoverable_hours,a.complexity,a.confidence,
  (select r.decision from process_reviews r where r.opportunity_id=a.id order by r.created_at desc limit 1)
 from process_ai_opportunities a join process_submissions s on s.id=a.submission_id left join process_participants p on p.id=s.participant_id
 where is_active_internal_user() and a.organisation_id=p_organisation_id
 order by a.opportunity_score desc, a.estimated_recoverable_hours desc nulls last
$$;

create or replace function control_get_process_submission(p_submission_id uuid) returns jsonb language sql security definer set search_path=public stable as $$
 select case when is_active_internal_user() then jsonb_build_object('id',s.id,'organisationId',s.organisation_id,'name',s.process_name,'department',p.department,'team',p.team,
  'participantName',nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'frequency',s.frequency,'durationMinutes',s.duration_minutes,'peopleCount',s.people_count,
  'annualHours',s.annual_hours,'systems',s.systems,'analysisStatus',s.analysis_status,'analysisErrorCode',s.analysis_error_code,'submittedAt',s.submitted_at,'narrative',s.narrative,
  'friction',s.friction_text,'humanJudgement',s.human_judgement_text,'sensitiveData',s.sensitive_data,'magicRemoval',s.magic_removal,'effortAssumptions',s.effort_assumptions,
  'analysis',(select jsonb_build_object('id',an.id,'model',an.model,'analysisVersion',an.analysis_version,'promptVersion',an.prompt_version,'createdAt',an.created_at,
    'confidence',an.confidence,'summary',an.structured_output->>'summary','evidenceGaps',coalesce(an.structured_output->'evidenceGaps','[]'),
    'clarifyingQuestions',coalesce(an.structured_output->'clarifyingQuestions','[]')) from process_ai_analyses an where an.submission_id=s.id order by an.created_at desc limit 1),
  'steps',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'order',x.step_order,'title',x.title,'description',x.description,'actor',x.actor,'system',x.system_name,
    'classification',x.classification,'reasoning',x.reasoning,'confidence',x.confidence,'humanJudgementRequired',x.human_judgement_required) order by x.step_order) from process_steps x where x.submission_id=s.id),'[]'::jsonb),
  'opportunities',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'type',a.opportunity_type,'score',a.opportunity_score,'confidence',a.confidence,
    'benefit',a.expected_benefit,'components',a.score_components,'problem',a.problem,'currentState',a.current_state,'proposedState',a.proposed_state,
    'recoverableHours',a.estimated_recoverable_hours,'complexity',a.complexity,'systems',a.systems,'integrationRequirements',coalesce(a.integration_requirements,'{}'),
    'dataRequirements',coalesce(a.data_requirements,'{}'),'oversightRequirements',coalesce(a.oversight_requirements,'{}'),'risks',coalesce(a.risks,'{}'),
    'controls',coalesce(a.controls,'{}'),'stepOrders',a.step_orders,'evidenceFields',a.evidence_fields) order by a.opportunity_score desc)
    from process_ai_opportunities a where a.submission_id=s.id),'[]'::jsonb)) else null end
 from process_submissions s left join process_participants p on p.id=s.participant_id where s.id=p_submission_id
$$;

revoke all on function control_claim_process_analysis(uuid,text),control_record_process_analysis(uuid,jsonb,text),
  control_fail_process_analysis(uuid,text,text),control_list_process_opportunities(uuid) from public;
grant execute on function control_claim_process_analysis(uuid,text),control_record_process_analysis(uuid,jsonb,text),
  control_fail_process_analysis(uuid,text,text),control_list_process_opportunities(uuid) to authenticated;
