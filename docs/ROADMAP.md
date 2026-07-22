# Roadmap

## Recommended next five product priorities
1. **Live Supabase data layer.** Implement the store accessors against Supabase
   with RLS, wire Supabase Auth into the shell, and switch on `isMockData=false`.
   The query surface and schema are already in place.
2. **Enforce the permission model.** Apply role capabilities in every server
   action and align RLS role policies, so Trustees review but do not edit,
   Contributors see only assigned work, and Finance manages budgets.
3. **Evidence uploads and AI extraction.** Real Supabase Storage uploads with
   type/size validation and signed URLs, then AI extraction from documents to
   populate `ai_extracted` profile fields for review.
4. **Funding discovery.** A pipeline to ingest and match real funding
   opportunities to the organisation profile, with verified source references
   and last-verified dates, replacing seeded demonstration opportunities.
5. **Collaboration and review depth.** Threaded comments on answers and report
   sections, reviewer assignment and sign-off flows, notifications and email
   digests, and richer version history and diffs.

## Later
- Team management (invites, role changes) and billing.
- Multi-organisation support for consultants and federations.
- Deeper impact analytics and funder-specific report templates.
- Mobile-optimised approval and task flows.
- Internationalisation beyond UK English and multi-currency.
- Integrations (accounting, CRM, calendar) and an API.
