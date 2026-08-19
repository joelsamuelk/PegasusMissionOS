# Mission OS domain architecture

## Decision

One repository and deployment artifact serves three product surfaces. Hosts select presentation and routing only; they never establish identity, membership, tenant, role, or capability.

| Host | Surface | Responsibility | Indexing |
| --- | --- | --- | --- |
| `mission.pegasus-studio.co` | Marketing | Public product story, product detail, trust, FAQ and conversion | Indexable and canonical |
| `app.pegasus-studio.co` | Customer application | Authentication, onboarding and organisation workspaces | No application data should be indexed |
| `control.pegasus-studio.co` | Control Plane | Pegasus internal operations | Noindex; separate internal identity |
| `www.pegasus-studio.co` | Corporate | Pegasus Studio, in its separate repository | Outside this repository |

`src/lib/domains.ts` is the sole domain configuration and URL-construction boundary. Absolute builders serve metadata and external destinations; surface paths keep combined previews local and let middleware perform custom-host transitions. `src/middleware.ts` resolves the request surface and applies the minimum host boundary. Business and data code must reason about identities and capabilities, never hostnames.

## Routes and host behaviour

Marketing owns `/`, `/product`, `/legal`, `robots.txt` and `sitemap.xml`. Links into sign-in or the demo use the configured application origin. Application routes retain their current paths (`/login`, `/signup`, `/onboarding`, `/dashboard`, and workspace areas). On the application host `/` intentionally enters `/dashboard`; live session and membership checks remain in the dashboard request context. Marketing routes requested on the app host return to the marketing origin.

The Control Plane retains its internal `/control` route tree. The control host rewrites `/` to `/control`; other non-control pages fail closed. Customer and marketing hosts cannot expose `/control`. Unknown hosts return 404. Static Next.js assets are host-neutral.

Preview and explicitly configured legacy origins use the existing combined route model. This keeps branch previews and staged migration usable without redirecting them to production.

## Authentication and tenant boundaries

Customer identity is validated with Supabase `getUser()`. Active `organisation_members` membership supplies `organisationId` and role; a client-selected organisation is still checked against membership. Mock mode supplies only the seeded demo context.

Control Plane requests resolve an authenticated user independently against `internal_users`. Customer organisation ownership does not imply internal access. Internal identity does not imply customer-content access; support access requires the explicit, scoped, expiring support-session model.

Cookies should remain host-only unless a later, documented single-sign-on design proves a wider scope is necessary. In particular, never set an auth cookie for `.pegasus-studio.co`: the Control Plane must not inherit customer sessions. Host selection is not an authentication factor.

There is currently no required browser-to-browser-host API communication. Cross-host navigation is by ordinary top-level links. If a future cross-origin API is introduced, allow only configured exact origins, validate `Origin`, retain SameSite/CSRF protections for mutations, and never use wildcard CORS with credentials.

## Request observability

Middleware adds `x-pegasus-surface` with `marketing`, `customer_app`, `control_plane`, or `preview`. Request logging may record this value, request ID, route and status, but not customer content, tokens, or submitted form bodies.

## SEO and canonical URLs

Marketing metadata, structured data, sitemap and robots use `missionMarketingUrl`. App and Control Plane layouts/routes must remain noindex. Do not publish duplicate marketing pages on app or control hosts; middleware sends known marketing routes to the canonical marketing origin and rejects unrelated control requests.

## Local and preview development

Run `npm run dev`, then use:

- `http://mission.localhost:3000` for marketing
- `http://app.localhost:3000` for the customer app
- `http://control.localhost:3000` for the internal shell
- `http://localhost:3000` for the backward-compatible combined demo

Modern browsers resolve `*.localhost` to loopback without DNS. Tests call the pure resolver and do not depend on production DNS. For branch deployments set `NEXT_PUBLIC_PREVIEW_URL` to that deployment origin; Vercel's `VERCEL_URL` is recognized automatically. Other hosts should expose their preview origin explicitly.

## Portability

Moving Mission OS to an independent domain requires changing configured origins, attaching the new domains, verifying auth/cookies and canonical metadata, then applying a separately reviewed SEO redirect plan. No tenant or product business logic changes. Permanent redirects are deliberately absent until target health has been proven.
