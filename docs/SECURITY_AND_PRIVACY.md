# Security and Privacy

Pegasus Mission OS handles sensitive organisational information. This document
describes the data boundaries, controls and known MVP limitations.

## Data boundaries
- The MVP works with **aggregate** programme and impact data.
- It does **not** collect detailed beneficiary case records or any special
  category personal data. Privacy-safe placeholders exist for future beneficiary
  functionality, but no such data is stored.
- Demonstration funders, opportunities and workspace data are fictional and
  clearly labelled as demonstration data.

## Authentication
- Live mode uses Supabase Auth. The application shell resolves the current user
  and organisation membership from the session.
- Mock mode requires no authentication and uses a seeded current user, so the
  demonstration is open to explore. This is a demonstration convenience and must
  not be used with real data.

## Authorisation
- A role-to-capability model (`src/lib/permissions`) defines seven roles
  (Owner, Administrator, Funding Lead, Programme Lead, Finance Contributor,
  Trustee/Reviewer, Contributor) and their capabilities. The model is complete
  even where the first interface does not expose every capability, and it is
  unit tested.
- Server actions are the single place mutations happen, so authorisation can be
  enforced centrally as the model is wired to the session.

## Row Level Security
- RLS is enabled on every organisation-owned table (`0002_rls.sql`).
- Access is scoped to active organisation membership via `is_org_member()`, with
  `org_has_role()` for owner/administrator-only operations.
- The `audit_events` table is append-only (select and insert only).
- Result: a member of one organisation can never read or write another
  organisation's records. The store isolation unit test mirrors this guarantee
  for mock mode.

## Storage
- Live mode uses Supabase Storage. Uploads must validate file type and size and
  be served through **signed URLs**. The evidence model carries `storage_path`,
  `file_name` and `file_size_kb` for this.
- Mock mode represents files by a description and does not accept real uploads.

## AI data flow
- All AI calls are server-side (`src/lib/ai`, invoked from server actions).
- API keys (`ANTHROPIC_API_KEY`) and the Supabase service role key are
  server-only and never exposed to the browser or placed in `NEXT_PUBLIC_*`.
- Only approved profile fields and selected evidence are sent to the model.
- An organisation-level AI setting (`organisations.ai_enabled`, toggleable in
  Settings) gates AI assistance, and a visible data-use explanation is shown in
  Settings.

## Audit logging
- Important actions are recorded in an append-only audit log: answer approval,
  AI generation, indicator updates, grant creation, report approval and AI
  setting changes.
- AI generations additionally record feature, model, prompt version, user, input
  references, an output preview and approval status. No secrets or unnecessary
  sensitive content are stored in logs.

## Known MVP limitations
- Mock mode has no authentication and stores data in memory only.
- The permission model is defined and tested but not yet enforced per-action in
  mock mode (there is a single seeded owner user).
- File uploads are simulated in mock mode.
- AI document extraction (`ai_extracted` verification state) is modelled but not
  implemented; extraction from uploaded documents is future work.

## Future security work
- Wire the permission model into server actions and RLS role policies.
- Implement Supabase Storage uploads with type/size validation and signed URLs.
- Add rate limiting and abuse protection on AI endpoints.
- Add per-organisation data export and deletion (data subject rights).
- Formal DPIA and penetration testing before handling real beneficiary-adjacent
  data.
