# MVP Scope

## In scope (built)

A charity or NGO can, end to end:

1. Enter a branded Pegasus Mission OS experience (landing, auth, onboarding).
2. Access a seeded demonstration workspace (Northstar Community Foundation).
3. See its position on the Command Centre, with AI-generated weekly priorities
   and an AI command bar.
4. View and manage funding opportunities (table and Kanban, search, filters,
   saved, stages, owner, probability, next action).
5. Assess eligibility and fit for an opportunity with an explainable,
   factor-by-factor assessment.
6. Open a grant application workspace (overview, documents, checklist, team).
7. Draft answers with organisation-aware AI, review candidates, view provenance,
   and approve them.
8. Track deadlines, stages, tasks and completion.
9. Convert a successful application into an active grant.
10. Manage grants with derived health (deliverables, payments, reports).
11. Run programmes with an activities/outputs/outcomes/impact framework and
    editable indicators.
12. Maintain a central, taggable evidence library and add evidence.
13. Generate a funder-ready impact report grounded in real data, edit it, mark
    it approved, and export to PDF.
14. Use Pegasus Intelligence through the command bar and contextual actions.

### Cross-cutting
- Design token system and Pegasus application shell (responsive, accessible).
- Role and permission model for seven roles.
- Verification states on profile fields and evidence.
- Audit log and AI-generation records.
- Supabase schema, RLS policies and seed SQL.
- Unit tests (Vitest) and critical-journey e2e tests (Playwright).
- Full documentation set.

## Runtime modes
- **Mock mode (default):** in-memory seeded store, deterministic mock AI. No
  external services required. This is what runs in the demonstration.
- **Live mode:** Supabase for data/auth/storage and Anthropic for AI, activated
  by environment variables. The schema, policies and provider abstraction are in
  place; wiring the live data-access layer to replace the mock store accessors
  is the first live-mode task (see `docs/ROADMAP.md`).

## Deliberately out of scope for this MVP
- Detailed beneficiary case records or any special category personal data. The
  product uses aggregate programme and impact data only, with privacy-safe
  placeholders for future beneficiary functionality.
- Billing and subscription management (the role model includes the capability).
- Real-time collaboration and presence.
- A public funding-opportunity ingestion pipeline (opportunities are seeded and
  clearly labelled as demonstration data).
- Native mobile apps. The web app is responsive with functional mobile views for
  approvals, tasks, deadlines and summaries.
- Full document parsing/OCR for AI extraction (the model exists; extraction is a
  future task).

## Definition of done
See the bottom of `docs/IMPLEMENTATION_PLAN.md`. Every item is met in mock mode:
the app is branded, the demo workspace is usable, funding/fit/applications/
grants/programmes/evidence/impact all work, AI runs via mock or live, data is
isolated (RLS), the app is responsive and accessible, and it passes linting,
type checking, unit tests and the critical e2e journeys.
