# Deployment domains

## Required configuration

| Variable | Production value | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_STUDIO_URL` | `https://www.pegasus-studio.co` | Separate corporate site |
| `NEXT_PUBLIC_MARKETING_URL` | `https://mission.pegasus-studio.co` | Canonical public product origin |
| `NEXT_PUBLIC_APP_URL` | `https://app.pegasus-studio.co` | Customer application origin |
| `NEXT_PUBLIC_CONTROL_URL` | `https://control.pegasus-studio.co` | Internal Control Plane origin |
| `NEXT_PUBLIC_PREVIEW_URL` | deployment-specific | Optional combined preview origin |
| `NEXT_PUBLIC_LEGACY_URL` | current verified origin | Temporary combined legacy origin during migration |

Configuration is validated as an HTTP(S) origin: paths, credentials, queries and fragments are rejected. Keep Supabase and provider secrets server-only as described in `.env.example`.

## DNS and hosting

Create DNS records for `mission`, `app`, and (only when its authentication is ready) `control` pointing to the selected hosting platform. Attach each as a custom domain to the same Mission OS deployment unless deployments are intentionally separated later. Provision TLS and verify each certificate before traffic migration. The corporate `www` record and deployment remain untouched.

Application-level routing is provider-neutral. On Vercel, attach all custom domains to the project and leave `VERCEL_URL` available for automatic preview recognition. On another provider, set `NEXT_PUBLIC_PREVIEW_URL` for each preview environment.

## Staged rollout

1. Deploy typed configuration and host-aware routing on the current origin, setting it as `NEXT_PUBLIC_LEGACY_URL`.
2. Attach and verify `mission.pegasus-studio.co`: page, canonical, OpenGraph, sitemap, robots, conversion and app links.
3. Attach and verify `app.pegasus-studio.co`: login/signup, demo, session persistence, onboarding, membership and tenant isolation.
4. Confirm cookies are host-only and state-changing requests do not accept untrusted origins.
5. Attach `control.pegasus-studio.co` only after internal authentication is configured; verify customer identities receive no access.
6. Observe errors and `x-pegasus-surface` request classification before considering legacy redirects.
7. Add temporary, then permanent, legacy redirects only in a later release after target health and SEO ownership are confirmed.

## Rollback

Keep the legacy origin configured and serving the combined route model through verification. If a custom host fails, remove or revert its DNS/custom-domain mapping; do not change data, cookies, or business logic. Restore traffic to the legacy origin, investigate, and redeploy. Because this change adds no permanent redirects or shared parent-domain cookie, rollback does not require session invalidation or redirect-cache recovery.

## Verification checklist

- Marketing, app and control hosts report the expected `x-pegasus-surface` header.
- Unknown hosts return 404 and control routes are unavailable on public hosts.
- Canonical and sitemap URLs use the marketing host; app/control responses are noindex.
- Cross-host destinations remain on the same preview/legacy origin for combined previews, or use configured custom origins in production.
- Changing `Host` alone grants neither organisation membership nor an internal role.
- Lint, typecheck, unit tests, production build and Playwright journeys pass before DNS changes.

## Implementation verification (2026-08-19)

- `npm run lint`: passed with one pre-existing unused import warning in the in-progress Control Plane shell.
- `npm run typecheck`: passed.
- `npm test`: 36 files and 434 tests passed.
- `npm run build`: passed; 23 application pages and middleware generated.
- `npm run test:e2e`: executed, but the checked-in suite is not green in the current developer environment. The local `.env` enables live Supabase without a browser test session, while Control Plane mock access is disabled, so customer journeys are unauthenticated and internal routes correctly fail closed. Several marketing expectations also describe sections absent from the current homepage. No DNS or redirect rollout should proceed until an isolated mock-mode E2E environment and the intended marketing assertions are agreed.
