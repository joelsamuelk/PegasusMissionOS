-- Every unusable intake link returned the same nothing: a null row, which the
-- page rendered as "invalid, expired, or closed". A participant whose campaign
-- had simply closed was told their link was invalid, and had nothing to act on
-- and nobody to contact. This returns the cause alongside the campaign, so the
-- page can name the closing date and the organisation that ran the campaign.
--
-- Added beside resolve_process_intake_token rather than replacing it. Schema
-- and application deploy separately here, and the old projection has to keep
-- serving live links for the window between the two. Drop the old function
-- once the deploy carrying resolve_process_intake_link has landed.
create or replace function resolve_process_intake_link(p_token text)
returns jsonb language sql security definer set search_path=public stable as $$
 with matched as (
  select * from process_invitation_tokens
  where token_digest=encode(extensions.digest(p_token,'sha256'),'hex') limit 1
 )
 -- 'invalid' is the only reason that carries no campaign, because it is the
 -- only one resolved without a row: nothing about the tenant is disclosed to a
 -- caller who did not present a real token.
 select coalesce((
  select jsonb_build_object(
   'reason', case
    when t.revoked_at is not null then 'revoked'
    when t.expires_at<=now() then 'expired'
    when c.status<>'active' then 'closed'
    when c.opens_at is not null and c.opens_at>now() then 'not_open'
    when c.closes_at is not null and c.closes_at<=now() then 'expired'
    else 'ok' end,
   'campaignId',c.id,'campaignName',c.name,'organisationName',o.name,
   'welcomeMessage',c.welcome_message,'voiceEnabled',c.voice_enabled,
   'identificationRequired',c.participant_identification_required,
   'opensAt',c.opens_at,
   -- The window a participant actually has is the earlier of the two, and the
   -- token is what expires first when a campaign is extended without reissue.
   'closesAt',least(t.expires_at,coalesce(c.closes_at,t.expires_at)),
   'participant', case when p.id is null then null else
    jsonb_build_object('firstName',p.first_name,'department',p.department,'team',p.team,'jobTitle',p.job_title) end)
  from matched t
  join process_intake_campaigns c on c.id=t.campaign_id
  join organisations o on o.id=c.organisation_id
  left join process_participants p on p.id=t.participant_id
 ), jsonb_build_object('reason','invalid'))
$$;
revoke all on function resolve_process_intake_link(text) from public;
grant execute on function resolve_process_intake_link(text) to anon, authenticated;
