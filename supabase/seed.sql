-- Pegasus Mission OS: demonstration seed for Supabase.
-- Northstar Community Foundation: fictional but realistic UK charity data.
-- All funders and opportunities are demonstration data (is_demo = true).
-- Mirrors the in-memory mock seed (src/features/store/seed.ts). Fixed UUIDs
-- make the data stable and referenceable.

-- Users ---------------------------------------------------------------------
insert into users (id, email, name, job_title, avatar_initials) values
  ('00000000-0000-0000-0000-0000000000a1', 'amara@northstarcf.org.uk', 'Amara Okafor', 'Chief Executive', 'AO'),
  ('00000000-0000-0000-0000-0000000000a2', 'james@northstarcf.org.uk', 'James Fielding', 'Head of Funding', 'JF'),
  ('00000000-0000-0000-0000-0000000000a3', 'priya@northstarcf.org.uk', 'Priya Sharma', 'Programmes Manager', 'PS'),
  ('00000000-0000-0000-0000-0000000000a4', 'tom@northstarcf.org.uk', 'Tom Whitfield', 'Finance Officer', 'TW'),
  ('00000000-0000-0000-0000-0000000000a5', 'grace@northstarcf.org.uk', 'Grace Bello', 'Trustee', 'GB');

-- Organisation --------------------------------------------------------------
insert into organisations (id, name, legal_name, type, charity_number, year_founded, website, registered_address, operating_regions, organisation_size, annual_income_band, is_demo, ai_enabled, created_by) values
  ('00000000-0000-0000-0000-00000000000f', 'Northstar Community Foundation', 'Northstar Community Foundation', 'charity', '1184023', 2011, 'https://www.northstarcf.org.uk', 'Unit 4, Prospect Works, Leeds LS11 5AB', array['West Yorkshire','Leeds','Bradford'], '24 staff, 60 volunteers', '£1m to £5m', true, true, '00000000-0000-0000-0000-0000000000a1');

-- Membership ----------------------------------------------------------------
insert into organisation_members (organisation_id, user_id, role, status, joined_at) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000a1', 'owner', 'active', '2019-04-01'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000a2', 'funding_lead', 'active', '2020-09-14'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000a3', 'programme_lead', 'active', '2021-01-11'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000a4', 'finance_contributor', 'active', '2022-06-06'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000a5', 'trustee_reviewer', 'active', '2019-05-20');

-- Profile (attested fields as jsonb) ---------------------------------------
insert into organisation_profiles (organisation_id, mission_statement, vision, summary, core_activities, strategic_priorities, communities_served, geographic_reach, safeguarding_status, data_protection_status, financial_year_end, typical_funding_requirement, preferred_funding_types, past_funders) values
  ('00000000-0000-0000-0000-00000000000f',
   '{"value":"We help young people aged 14 to 25 in West Yorkshire build the confidence, skills and support they need to thrive in work and in life.","verification":"verified"}',
   '{"value":"A region where every young person has a fair route into good work and good wellbeing.","verification":"verified"}',
   '{"value":"Northstar delivers employment readiness, digital skills, mentoring and mental wellbeing support to young people across Leeds and Bradford.","verification":"provided"}',
   '{"value":["Employment readiness","Digital skills","Mentoring","Mental wellbeing support"],"verification":"verified"}',
   '{"value":["Youth employment","Digital inclusion","Mental health and wellbeing","Reaching young people facing disadvantage"],"verification":"verified"}',
   '{"value":["Young people aged 14 to 25","Care-experienced young people","Young people not in education, employment or training"],"verification":"provided"}',
   '{"value":"West Yorkshire, with concentration in Leeds and Bradford","verification":"verified"}',
   '{"value":"Up to date. Reviewed February 2026.","verification":"verified"}',
   '{"value":"ICO registered.","verification":"verified"}',
   '{"value":"31 March","verification":"verified"}',
   '{"value":"£25,000 to £150,000 per programme","verification":"provided"}',
   '{"value":["Project","Core","Unrestricted"],"verification":"provided"}',
   '{"value":["The Henderson Trust","West Yorkshire Combined Authority","National Lottery Community Fund"],"verification":"provided"}');

-- Funders -------------------------------------------------------------------
insert into funders (id, organisation_id, name, type, is_demo) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000f', 'Horizon Fund for Youth', 'Grant-making foundation', true),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000f', 'TechForward Foundation', 'Corporate foundation', true),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000000f', 'The Henderson Trust', 'Family foundation', true),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000000f', 'West Yorkshire Combined Authority', 'Public body', true);

-- Opportunities -------------------------------------------------------------
insert into funding_opportunities (id, organisation_id, funder_id, programme_name, description, min_award, max_award, deadline, funding_duration_months, funding_type, eligible_org_types, eligible_locations, priority_themes, required_documents, reporting_requirements, owner_id, stage, probability, saved, is_demo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000f1', 'Youth Opportunity Grant 2026', 'Multi-year funding for organisations helping disadvantaged young people into employment, education or training.', 40000, 120000, '2026-08-14', 24, 'project', array['charity','cic','social_enterprise'], array['England','West Yorkshire'], array['Youth employment','Mental health and wellbeing','Disadvantage'], array['Latest accounts','Safeguarding policy','Project budget'], array['Six-monthly progress reports','Final evaluation'], '00000000-0000-0000-0000-0000000000a2', 'applying', 55, true, true),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000f2', 'Digital Inclusion Programme', 'Grants for projects closing the digital skills gap for young people facing disadvantage.', 15000, 50000, '2026-07-31', 12, 'restricted', array['charity','cic','community_group'], array['UK'], array['Digital inclusion','Digital skills','Disadvantage'], array['Project plan','Budget','Safeguarding policy'], array['Quarterly reports','Final report'], '00000000-0000-0000-0000-0000000000a2', 'internal_review', 65, true, true);

-- Application, answers ------------------------------------------------------
insert into applications (id, organisation_id, opportunity_id, title, status, owner_id, contributor_ids, reviewer_ids, deadline) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000e1', 'Horizon Youth Opportunity Grant 2026', 'in_progress', '00000000-0000-0000-0000-0000000000a2', array['00000000-0000-0000-0000-0000000000a3']::uuid[], array['00000000-0000-0000-0000-0000000000a5']::uuid[], '2026-08-14');

insert into application_answers (organisation_id, application_id, ord, question_text, guidance, word_limit, draft, status, assigned_to) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000d1', 1, 'Describe the young people your project will support and the need you are addressing.', 'Focus on evidence of need.', 300, 'Northstar works with young people aged 14 to 25 across Leeds and Bradford, with a focus on those facing disadvantage.', 'approved', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000d1', 2, 'What will your project do, and what outcomes do you expect to achieve?', 'Be specific and measurable.', 400, 'The project will deliver a 24-month programme of employability workshops, mentoring and wellbeing sessions for 240 young people.', 'ready_for_review', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000d1', 3, 'Describe your organisation''s capacity and track record.', 'Include governance and staffing.', 350, '', 'not_started', '00000000-0000-0000-0000-0000000000a2');

-- Grant ---------------------------------------------------------------------
insert into grants (id, organisation_id, funder_id, title, award_value, restricted, start_date, end_date, grant_manager_id, spent_to_date, conditions, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000f3', 'Youth Futures programme grant', 95000, true, '2025-04-01', '2027-03-31', '00000000-0000-0000-0000-0000000000a3', 41000, array['Funding restricted to Youth Futures delivery','Six-monthly progress reports required'], 'active');

insert into grant_deliverables (organisation_id, grant_id, title, due_date, status) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000c1', 'Recruit programme cohort 3', '2026-09-15', 'in_progress'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000c1', 'Deliver 40 mentoring matches', '2026-06-30', 'complete');

insert into grant_reports (organisation_id, grant_id, title, due_date, status) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000c1', 'Six-monthly progress report', '2026-08-01', 'drafting');

-- Programme, outcome, indicators -------------------------------------------
insert into programmes (id, organisation_id, name, summary, status, owner_id, start_date, end_date, location, communities_served, budget, activities, outputs) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000f', 'Youth Futures', 'An employability and mentoring programme helping young people into education, employment or training.', 'active', '00000000-0000-0000-0000-0000000000a3', '2025-04-01', '2027-03-31', 'Leeds and Bradford', array['Young people not in education, employment or training'], 180000, array['Employability workshops','One-to-one mentoring'], array['240 young people supported','60 mentoring matches']);

insert into programme_grants (organisation_id, programme_id, grant_id) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1');

insert into outcomes (id, organisation_id, programme_id, title, description, level) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000b1', 'Progression into education, employment or training', 'Young people move into a positive destination within six months.', 'outcome');

insert into indicators (organisation_id, outcome_id, name, definition, baseline, target, current_value, unit, measurement_frequency, evidence_source, data_owner_id, last_updated, confidence) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000aa', 'Progression rate into EET', 'Percentage of completers in EET at six-month follow-up.', 0, 70, 58, '%', 'Six-monthly', 'Follow-up survey', '00000000-0000-0000-0000-0000000000a3', '2026-06-30', 'medium'),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000aa', 'Young people supported', 'Number who started the programme.', 0, 240, 168, 'people', 'Monthly', 'Attendance records', '00000000-0000-0000-0000-0000000000a3', '2026-07-05', 'high');

-- Evidence ------------------------------------------------------------------
insert into evidence_items (organisation_id, title, type, description, verification, stat_value, stat_label, tags) values
  ('00000000-0000-0000-0000-00000000000f', 'Progression outcomes 2025', 'statistic', 'Share of Youth Futures completers progressing into EET.', 'provided', '58%', 'progressed into education, employment or training', array['outcome','youth-futures']),
  ('00000000-0000-0000-0000-00000000000f', 'Youth Futures independent evaluation 2025', 'evaluation', 'Independent evaluation of the Youth Futures programme.', 'verified', null, null, array['evaluation','youth-futures']);

-- Tasks and audit -----------------------------------------------------------
insert into tasks (organisation_id, title, status, due_date, assignee_id, related_type, related_id) values
  ('00000000-0000-0000-0000-00000000000f', 'Draft organisational capacity answer for Horizon', 'in_progress', '2026-07-24', '00000000-0000-0000-0000-0000000000a2', 'application', '00000000-0000-0000-0000-0000000000d1');

insert into audit_events (organisation_id, actor_id, actor_name, action, entity_type, entity_id, summary) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000a1', 'Amara Okafor', 'application.answer.approved', 'application_answer', 'seed', 'Approved a Horizon application answer');

-- Impact report -------------------------------------------------------------
insert into impact_reports (id, organisation_id, title, programme_id, grant_id, reporting_period, status, included_indicator_ids, included_evidence_ids) values
  ('00000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000f', 'Youth Futures interim impact report', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'April 2025 to June 2026', 'draft', '{}', '{}');

insert into impact_report_sections (organisation_id, report_id, key, title, ord) values
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000ab', 'executive_summary', 'Executive summary', 0),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000ab', 'outcomes', 'Outcomes achieved', 1),
  ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000ab', 'beneficiary_stories', 'Beneficiary stories', 2);
