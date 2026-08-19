# Authentication

Mission OS uses invite-only Supabase email magic links. Passwords are neither
collected nor stored by the application.

## Supabase configuration

1. In **Authentication → URL Configuration**, set the Site URL to
   `https://app.pegasus-studio.co`.
2. Add these redirect URLs:
   - `https://app.pegasus-studio.co/auth/confirm`
   - `http://app.localhost:3000/auth/confirm` for local development
3. In **Authentication → Email Templates → Magic Link**, use a server-readable
   token hash. The application always supplies a redirect URL that already has
   a `next` query parameter, so the template link is:

   ```html
   <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">
     Sign in to Pegasus Mission OS
   </a>
   ```

4. Configure custom SMTP before production use. Supabase's default sender is
   intended for trying the flow and has delivery/rate limitations.
5. Set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel, then redeploy.

The callback also accepts PKCE `code` callbacks, but the token-hash template is
preferred because it can establish an SSR cookie session without relying on a
URL fragment.

## Provisioning access

Magic-link requests do not create accounts. An administrator must first create
the person in Supabase Auth, add a `users` row with the same UUID, and give that
UUID an active `organisation_members` row. Authentication proves control of the
email; the membership row grants access to a workspace.

Example after creating the Auth user and organisation (replace every value):

```sql
insert into public.users (id, email, name, avatar_initials)
values ('AUTH-USER-UUID', 'owner@example.org', 'Workspace Owner', 'WO');

insert into public.organisation_members
  (organisation_id, user_id, role, status, joined_at)
values
  ('ORGANISATION-UUID', 'AUTH-USER-UUID', 'owner', 'active', now());
```

## Current data-layer boundary

Magic-link authentication, cookie refresh, membership resolution and route
guards are implemented. The customer repository is still the in-memory adapter;
the Supabase-backed `MissionRepository` must be completed before a live tenant
workspace can read and write its own PostgreSQL records. Do not describe the
current deployment as tenant-data-ready until that adapter replaces the
in-memory repository.
