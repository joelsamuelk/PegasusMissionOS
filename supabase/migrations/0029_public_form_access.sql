-- Pegasus Mission OS: the anonymous surface.
--
-- Every policy so far reduces to `is_org_member(organisation_id)`, which is
-- correct for the whole product except one path. A member of the public
-- filling in a public form is not a member of any organisation, so every read
-- they need returns nothing and every write they attempt is refused.
--
-- Two ways to fix that, and only one of them is acceptable.
--
-- The service role key bypasses RLS entirely. Putting it behind an
-- unauthenticated endpoint means the only thing standing between the public
-- and every row in the database is application code being correct -- which is
-- exactly the assumption row level security exists to stop anyone making.
-- `src/server/data/supabase/client.ts` already says so: "Never use this to
-- serve a request."
--
-- So the database is taught the rule instead. Anonymous callers get read
-- access to public, open, published forms and nothing else, and one function
-- through which a submission can be written. The rule is enforced where it
-- cannot be forgotten.

-- ---------------------------------------------------------------------------
-- Reads
--
-- Scoped to what somebody deliberately put on the internet: a form whose
-- access is `public`, whose status is `open`, which is not archived, and only
-- the version it is currently serving. A draft form, a closed form, a
-- link-only form and a retired version are all invisible.
-- ---------------------------------------------------------------------------

-- Supabase grants table privileges to `anon` and `authenticated` by default and
-- relies on RLS for the row-level decision. Stating the three reads explicitly
-- makes the migration self-contained: it says which tables the anonymous
-- surface touches, and it applies to a plain Postgres that has no such default.
-- Row visibility is still decided entirely by the policies below.
grant select on forms, form_versions, form_fields to anon;

drop policy if exists forms_public_read on forms;
create policy forms_public_read on forms
  for select
  to anon
  using (
    access = 'public'
    and status = 'open'
    and archived_at is null
    and current_version_id is not null
  );

drop policy if exists form_versions_public_read on form_versions;
create policy form_versions_public_read on form_versions
  for select
  to anon
  using (
    status = 'published'
    and exists (
      select 1 from forms f
      where f.id = form_versions.form_id
        and f.current_version_id = form_versions.id
        and f.access = 'public'
        and f.status = 'open'
        and f.archived_at is null
    )
  );

drop policy if exists form_fields_public_read on form_fields;
create policy form_fields_public_read on form_fields
  for select
  to anon
  using (
    exists (
      select 1 from form_versions v
      join forms f on f.id = v.form_id
      where v.id = form_fields.version_id
        and v.status = 'published'
        and f.current_version_id = v.id
        and f.access = 'public'
        and f.status = 'open'
        and f.archived_at is null
    )
  );

-- Deliberately absent: any policy granting `anon` select on form_submissions,
-- submission_answers or consent_records. A respondent may write an answer and
-- may never read one back, including their own -- there is no way to prove who
-- they are, so "their own" is not a set this database can compute.

-- ---------------------------------------------------------------------------
-- Writes
--
-- One function, and no insert policies. Insert policies would need the
-- submission's form to be readable to check an answer belongs to a public
-- form, which means granting `anon` select on submissions -- and a submission
-- row is personal data even before its answers are read.
--
-- A definer function avoids that entirely and buys something better: the
-- caller does not get to say what it is writing. The form is resolved from the
-- slug here, the fields are read from the published version here, and the
-- label, type and **sensitivity** of every answer come from the field
-- definition rather than from the payload. A caller cannot mark special
-- category data as routine, because it never gets to state the classification.
-- ---------------------------------------------------------------------------

create or replace function public_form_submit(
  p_slug text,
  p_status submission_status,
  p_source_token text,
  -- [{ "fieldKey": "...", "value": { ... } }]. Values are ClaimValue objects.
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form forms%rowtype;
  v_submission_id uuid;
  v_answer jsonb;
  v_field form_fields%rowtype;
begin
  -- The same conditions as the read policies, restated because a definer
  -- function runs as its owner and no policy applies to it.
  select * into v_form
  from forms
  where slug = p_slug
    and access = 'public'
    and status = 'open'
    and archived_at is null
    and current_version_id is not null;

  if not found then
    return null;
  end if;

  -- A public submission may only ever land in one of these two states. Nothing
  -- reached from the internet may write an accepted submission, because an
  -- accepted submission is one a person decided about.
  if p_status not in ('awaiting_review', 'spam') then
    raise exception 'A public submission may not be created as %', p_status;
  end if;

  insert into form_submissions (
    organisation_id, form_id, version_id, status, source,
    submitted_at, source_token, retain_until
  )
  values (
    v_form.organisation_id,
    v_form.id,
    v_form.current_version_id,
    p_status,
    'public',
    now(),
    p_source_token,
    case
      when v_form.retention_days is not null
        then now() + make_interval(days => v_form.retention_days)
      else null
    end
  )
  returning id into v_submission_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    select * into v_field
    from form_fields
    where version_id = v_form.current_version_id
      and key = v_answer->>'fieldKey';

    -- An answer to a field this version does not have is dropped rather than
    -- stored. There is nothing to label it with and nothing to classify it by.
    continue when not found;

    insert into submission_answers (
      organisation_id, submission_id, field_key, field_label,
      field_type, sensitivity, value, redacted
    )
    values (
      v_form.organisation_id,
      v_submission_id,
      v_field.key,
      v_field.label,
      v_field.type,
      v_field.sensitivity,
      v_answer->'value',
      false
    );

    if v_field.type = 'consent' and (v_answer->'value'->>'boolean') is not null then
      insert into consent_records (
        organisation_id, submission_id, version_id, field_key,
        purpose, granted, recorded_at
      )
      values (
        v_form.organisation_id,
        v_submission_id,
        v_form.current_version_id,
        v_field.key,
        -- Verbatim from the version answered, so the wording somebody actually
        -- agreed to can always be recovered.
        coalesce(v_field.consent_purpose, v_field.label),
        (v_answer->'value'->>'boolean')::boolean,
        now()
      );
    end if;
  end loop;

  return v_submission_id;
end;
$$;

-- The function is the entry point, so it is the only thing granted. Revoking
-- from public first means the grant list is exactly what is intended rather
-- than the default plus what is intended.
revoke all on function public_form_submit(text, submission_status, text, jsonb) from public;
grant execute on function public_form_submit(text, submission_status, text, jsonb) to anon;
grant execute on function public_form_submit(text, submission_status, text, jsonb) to authenticated;

comment on function public_form_submit is
  'The only write an unauthenticated caller may make. Resolves the form from '
  'its slug, reads field definitions from the published version, and derives '
  'every answer''s label, type and sensitivity from the field rather than the '
  'payload -- so a caller cannot misclassify what it is submitting.';
