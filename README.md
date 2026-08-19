# Pegasus Mission OS

**The operating system for mission-driven organisations.**

> Every mission deserves world-class technology.

Pegasus Mission OS gives charities, NGOs, foundations, community organisations
and social enterprises one intelligent place to discover funding, manage grant
applications, run funded programmes, track outcomes, demonstrate impact and
manage the operational work around their mission.

This repository contains the first production-quality MVP. It runs fully in a
**mock mode** with a seeded demonstration workspace (Northstar Community
Foundation) so you can explore every module without any external services, and
it is structured to connect to Supabase and the Anthropic API when configured.

---

## Product overview

Ten integrated modules:

1. **Command Centre** — the organisation's position at a glance, with an AI
   command bar and AI-generated weekly priorities derived from live data.
2. **Organisation Profile** — a structured knowledge base with a verification
   state on every field and a constructive completeness score.
3. **Funding Pipeline** — table and Kanban views, search, filters and staged
   opportunities.
4. **Funding Fit Assessment** — explainable, factor-by-factor decision support.
5. **Grant Application Workspace** — a structured workspace with a flagship
   answer editor.
6. **Grant Management** — award, deliverables, payments, reporting and derived
   grant health.
7. **Programmes and Outcomes** — an activities/outputs/outcomes/impact framework
   with editable indicators.
8. **Evidence Library** — a central, taggable evidence store.
9. **Impact Reporting** — an evidence-grounded report builder with PDF export.
10. **Pegasus Intelligence** — an organisation-aware AI assistant behind a
    server-side provider abstraction (mock or Anthropic).

## Technology stack

- **Next.js 15** (App Router) and **React 19**
- **TypeScript** in strict mode (`noUncheckedIndexedAccess` on)
- **Tailwind CSS** with a tokenised Pegasus design system
- **lucide-react** icons, **class-variance-authority**, **date-fns**, **zod**
- **Supabase** (PostgreSQL, Auth, Storage, Row Level Security) — schema,
  policies and seed provided; the app runs without it in mock mode
- **Anthropic** Messages API behind a server-side abstraction, with a
  deterministic mock provider fallback
- **Vitest** + **React Testing Library** for unit tests, **Playwright** for the
  critical user journeys

## Local setup

Requires Node 20+ (developed on Node 22).

```bash
npm install
cp .env.example .env.local   # optional; the app runs with defaults in mock mode
npm run dev                  # http://localhost:3000
```

Open `http://localhost:3000` and choose **Enter demonstration** (or sign in at
`/login`, no credentials required) to land in the seeded workspace.

## Environment variables

See `.env.example`. All are optional in mock mode.

| Variable                               | Purpose                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | Absolute app URL for links and redirects.                                       |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL. Unset ⇒ mock data.                                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase public browser/server key. Unset with the legacy anon key ⇒ mock data. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | Legacy public-key fallback.                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`            | Server-only. Admin/seed operations. Never exposed to the browser.               |
| `AI_PROVIDER`                          | `mock` (default) or `anthropic`.                                                |
| `ANTHROPIC_API_KEY`                    | Server-only. Required when `AI_PROVIDER=anthropic`.                             |

**When Supabase variables are unset, the app runs in mock mode**: an in-memory
seeded workspace with real interactivity (mutations persist for the lifetime of
the server process).

## Supabase setup

1. Create a Supabase project.
2. Apply the migrations, in order:
   ```bash
   supabase db push
   # or run the SQL directly:
   psql "$DATABASE_URL" -f supabase/migrations/0001_schema.sql
   psql "$DATABASE_URL" -f supabase/migrations/0002_rls.sql
   ```
3. Seed the demonstration workspace:
   ```bash
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and
   `SUPABASE_SERVICE_ROLE_KEY` for server-side/admin operations).

For passwordless sign-in, callback template configuration and account
provisioning, follow [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md).

Row Level Security is enabled on every organisation-owned table. See
`docs/DATA_MODEL.md` and `docs/SECURITY_AND_PRIVACY.md`.

## AI provider configuration

- **Mock mode (default):** `AI_PROVIDER=mock`. Deterministic, grounded, no
  network, no key. Ideal for demos, development and tests.
- **Live mode:** `AI_PROVIDER=anthropic` and set `ANTHROPIC_API_KEY`. All calls
  run server-side through `src/lib/ai`. The key is never sent to the browser.

Prompts and policy live in one place: `src/lib/ai/prompts.ts`. If a live call
fails, the layer falls back to the mock provider so the product never breaks.

## Test commands

```bash
npm run test        # Vitest unit tests (logic, permissions, AI mock, store)
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # production build
npm run test:e2e    # Playwright critical journeys (builds and starts the app)
```

In this sandboxed environment the Playwright browser is pre-installed at a
pinned path; run e2e with:

```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e
```

## Deployment guidance

- Deploy the Next.js app to any Node host (Vercel recommended for App Router).
- Provision a Supabase project, apply migrations and set the environment
  variables above. Keep `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY`
  server-only (never in `NEXT_PUBLIC_*`).
- Set `AI_PROVIDER=anthropic` in production if you want live AI, otherwise the
  mock provider is used.

## Documentation

- `docs/PRODUCT_VISION.md` — vision, positioning, principles
- `docs/MVP_SCOPE.md` — what is in and out of the MVP
- `docs/BRAND_SYSTEM.md` — the Pegasus design system and tokens
- `docs/ARCHITECTURE.md` — structure, data flow, rendering model
- `docs/DATA_MODEL.md` — entities, relationships, RLS
- `docs/AI_SYSTEM.md` — provider abstraction, prompts, provenance, trust
- `docs/SECURITY_AND_PRIVACY.md` — data boundaries, auth, storage, limitations
- `docs/ROADMAP.md` — what comes next
- `docs/DECISIONS.md` — key decisions and their rationale
- `docs/IMPLEMENTATION_PLAN.md` — build plan and status

### Platform evolution

- `docs/PEGASUS_PRODUCTION_BUILD_SPEC.md` — **the plan of record**: six foundational systems, the
  Knowledge/Claims layer, and the ordered slices from demonstration to production
- `docs/PEGASUS_ARCHITECTURE_AUDIT.md` — full repository audit, weaknesses and security findings
- `docs/PEGASUS_TARGET_ARCHITECTURE.md` — the architecture being built toward
- `docs/PEGASUS_IMPLEMENTATION_PLAN.md` — superseded by the build spec; retained for its
  verification records
- `docs/FINANCE_INTELLIGENCE.md` — impact economics and funding need intelligence
- `docs/ORGANISATION_INTELLIGENCE.md` — onboarding, discovery and extraction
- `docs/RELATIONSHIPS_COMMUNICATIONS_ARCHITECTURE.md` — relationships, communications, collaboration

## Repository layout

```
src/
  app/                     App Router routes ((auth), (dashboard), api)
  components/              Brand, layout, navigation and per-module components
  features/                Store (mock data), dashboard selectors, funding constants
  lib/                     ai, config, formatting, logic, permissions, utils
  server/                  Server actions and context services
  types/                   Domain model
  styles/                  Global styles and tokens
supabase/                  migrations, RLS, seed.sql
tests/                     unit (Vitest) and e2e (Playwright)
docs/                      Product and engineering documentation
```
