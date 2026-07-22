# Pegasus Mission OS: Implementation Plan

## Status: MVP complete (mock mode)

## Context and constraints
- Greenfield repo (only README existed).
- Live Pegasus marketing site (pegasus-studio.co) is unreachable from this
  sandbox (proxy returns 403). The brand system is therefore built from the
  written direction in the brief and documented in `docs/BRAND_SYSTEM.md`. It can
  be refined against live screenshots later; the token layer makes this cheap.
- No live Supabase or Anthropic key assumed. The application runs fully in
  **mock mode**: an in-memory seeded store and a deterministic mock AI provider.
  Supabase SQL migrations, RLS policies and a seed script are provided as
  first-class deliverables and documented for activation.

## Build sequence (this session)
- [x] Discovery and plan
- [x] Foundation (Next.js, TS strict, Tailwind tokens, shell, navigation,
      shared primitives)
- [x] Domain model + mock store + full Northstar seed
- [x] AI abstraction + central prompt/policy layer + provenance
- [x] Module pages: Command Centre, Funding pipeline, Opportunity detail, Fit
      assessment, Applications + flagship answer editor, Grants, Programmes +
      outcomes, Evidence, Impact report builder, Organisation, Team, Settings,
      auth, onboarding
- [x] Supabase migrations (schema, indexes, FKs) + RLS policies + seed.sql
- [x] Tests: Vitest unit (fit, grant health, progress, permissions, AI mock,
      store, component) and Playwright e2e (8 critical journeys)
- [x] Lint, typecheck and production build all clean
- [x] Documentation set

## Verification results
- `npm run typecheck` — clean
- `npm run lint` — no warnings or errors
- `npm run build` — succeeds, 17 routes
- `npm run test` — 40 unit tests pass
- `npm run test:e2e` — 8 critical journeys pass

## Definition of done (all met in mock mode)
- Branded Pegasus Mission OS experience with demonstration access.
- Command Centre communicates the organisation's position clearly.
- Funding opportunities reviewed and managed (table/Kanban, filters, stages).
- Transparent, evidence-based fit assessments.
- Grant applications drafted and reviewed with an organisation-aware answer
  editor; AI works via mock or live.
- Successful applications convert into active grants.
- Programmes, outcomes, indicators and evidence managed.
- Impact reports generated, edited, approved and exported.
- Organisation data isolation (RLS in live mode; verified for the store).
- Responsive and accessible; passes linting, type checking and critical tests.
- Complete setup and architecture documentation.

## Next
See `docs/ROADMAP.md`. The first live-mode task is implementing the store
accessors against Supabase with RLS and wiring Supabase Auth.
