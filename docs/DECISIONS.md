# Decisions

A running log of significant decisions and their rationale.

## D1. Mock mode as a first-class runtime
**Decision:** Build the app to run fully without Supabase or an Anthropic key,
using an in-memory seeded store and a deterministic mock AI provider, selected
automatically when those services are unconfigured.
**Why:** The brief requires a working experience where credentials are
unavailable, and an impressive, immediately usable demonstration. Mock mode also
makes development and testing fast and deterministic. The Supabase schema, RLS
and seed are provided as first-class deliverables for live mode.

## D2. Provider abstraction for AI, mock by default
**Decision:** A single `AiProvider` interface with a deterministic mock and an
Anthropic implementation, resolved server-side, with mock fallback on failure.
**Why:** Keeps keys server-only, keeps the product working if a live call fails,
and makes the trust behaviours (grounding, provenance, no fabrication) testable.

## D3. Central prompt and policy layer
**Decision:** All prompts and the shared trust policy live in
`src/lib/ai/prompts.ts`, versioned per feature.
**Why:** The brief requires a central prompt/policy layer rather than prompts
scattered through components, and versioning supports auditability.

## D4. Deterministic, grounded weekly priorities
**Decision:** The Command Centre's "AI-generated priorities" are computed
deterministically from live data (deadlines, review states, grant health) rather
than free-form generated.
**Why:** They must never be fabricated and must always reflect real state. This
keeps them trustworthy and connected to actual models, per the brief's rule that
every metric maps to a real model.

## D5. Anthropic via fetch, not the SDK
**Decision:** Call the Anthropic Messages API directly with `fetch`.
**Why:** Avoids an extra dependency, keeps the call server-side and explicit, and
sidesteps SDK/version friction in a constrained build environment.

## D6. Tailwind v3 with CSS-variable tokens
**Decision:** Tailwind CSS v3 with the design system expressed as CSS custom
properties mapped into the Tailwind theme.
**Why:** Predictable tooling, runtime theming (light/dark), and a clean token
seam so the brand can be refined against the live site without touching
components.

## D7. Primary actions use ink, accent reserved
**Decision:** Primary buttons use near-black ink; the accent ink-blue is reserved
for links, focus, data and selective emphasis.
**Why:** Matches the premium, restrained, minimal-colour brand direction and
avoids a generic coloured-button SaaS look.

## D8. Status meaning never relies on colour alone
**Decision:** Every status badge carries an icon and a text label as well as
colour.
**Why:** WCAG 2.2 AA and the brief's explicit requirement.

## D9. Server components read the store directly; mutations via server actions
**Decision:** Pages are server components reading the typed store; all writes and
AI calls go through `"use server"` actions that revalidate.
**Why:** Fast, data-rich pages; a single, securable mutation surface; and a clean
path to swap the store for Supabase without rewriting the UI.

## D10. Brand built from written direction (site unreachable)
**Decision:** The visual system is derived from the brief's brand direction and
encoded as tokens, because the live Pegasus site was blocked by the sandbox
proxy (HTTP 403).
**Why:** Unblocks the build while keeping refinement cheap. Documented in
`docs/BRAND_SYSTEM.md`; adjusting to live screenshots is a token change.

## D11. Convert-to-grant is a confirmed, irreversible-feeling action
**Decision:** Marking an application successful and creating a grant requires a
confirmation dialogue.
**Why:** It creates a new tracked record and changes application state;
destructive or hard-to-reverse actions should confirm first.
