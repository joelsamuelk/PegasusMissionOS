# Architecture

## Overview
Pegasus Mission OS is a Next.js (App Router) application in TypeScript strict
mode. Business logic is kept out of presentational components: pure logic lives
in `src/lib/logic`, data access behind a store abstraction in
`src/features/store`, and mutations behind server actions in
`src/server/actions`.

## Rendering model
- **Server components** render pages and read from the data layer directly (no
  client data fetching), producing fast, data-rich views.
- **Client components** are used only where interactivity is needed: the command
  bar, answer editor, indicator editor, report builder, pipeline view toggles,
  toasts, modals and the navigation shell.
- **Server actions** (`"use server"`) perform all mutations and AI calls. They
  validate/scope input, update the data layer, record audit and AI-generation
  events, and call `revalidatePath` so server components re-render.

## Layered structure
```
src/
  app/
    (auth)/                 login, signup + shared editorial auth layout
    (dashboard)/            authenticated shell + all module routes
    onboarding/             standalone multi-step onboarding
    layout.tsx              root layout (ToastProvider, metadata)
    not-found.tsx
  components/
    brand/                  Wordmark and glyph
    layout/                 ShellChrome (sidebar, topbar, mobile drawer)
    navigation/             nav item config
    ai/                     CommandBar, ProvenanceDrawer
    funding/ applications/ grants/ programmes/ evidence/ impact/ settings/
    shared/                 ui primitives, StatusBadge, PageHeader, misc, Modal,
                            Toast, ActivityFeed, TaskListWidget
  features/
    store/                  in-memory store + seed (mock mode)
    dashboard/              Command Centre selectors
    funding/                pipeline constants
  lib/
    ai/                     provider abstraction, mock, anthropic, prompts, types
    logic/                  fit, grant-health, progress (pure, tested)
    permissions/            role -> capability model
    config.ts formatting.ts utils.ts
  server/
    actions/                ai.ts, mutations.ts ("use server")
    services/               context.ts (grounded AI context builders)
  types/domain.ts           the domain model
```

## Data layer
The single source of truth in mock mode is `src/features/store`. It clones the
seed into a mutable singleton (stable across requests and hot reloads) and
exposes:
- `q` — typed read queries scoped to the demonstration organisation.
- `mutate` — in-memory mutations (approve answer, update indicator, convert to
  grant, save report section, add evidence, etc.).
- `recordAudit` / `recordAiGeneration` — append-only audit and AI logs.

This narrow query surface is the seam for live mode: a Supabase-backed
implementation of the same accessors (RLS-scoped) replaces the mock store
without touching pages or components. `src/lib/config.ts` exposes `isMockData`
to switch behaviour.

## AI layer
See `docs/AI_SYSTEM.md`. All AI runs server-side through `src/lib/ai`, behind a
provider interface with a deterministic mock and an Anthropic implementation.
Context is assembled from approved data by `src/server/services/context.ts`.

## State and interactivity
Because mock-mode mutations persist in the server process and actions call
`revalidatePath` (plus `router.refresh()` on the client), the demonstration has
real interactivity: approving an answer, updating an indicator, converting an
application to a grant, and generating report drafts all persist and reflect
immediately.

## Error, loading and empty states
- `src/app/(dashboard)/loading.tsx` renders skeletons.
- `src/app/(dashboard)/error.tsx` is an error boundary with recovery actions.
- `not-found.tsx` handles unknown routes and missing records (`notFound()`).
- Every list view has a purpose-built empty state with a next action.
- Mutations surface toast feedback; destructive/irreversible actions confirm
  first (e.g. converting an application into a grant).

## Testing
- Unit tests (Vitest + RTL) cover the pure logic, permissions, the AI mock, the
  store isolation/mutations and a component.
- E2e tests (Playwright) cover the eight critical journeys against a production
  build.
