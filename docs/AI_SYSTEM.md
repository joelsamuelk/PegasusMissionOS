# AI System

Pegasus Intelligence is an organisation-aware assistant that reduces
administrative work. It never makes unsupported decisions, and every output is a
draft a person reviews, edits and approves.

## Principles
- Use only approved organisation data and selected evidence.
- Never fabricate funders, statistics, outcomes, beneficiary quotes or financial
  figures. Where information is missing, say so and suggest what to add.
- Distinguish verified information from inferred suggestions.
- Calm, direct UK English; no em dashes; no marketing language.
- Every generation is recorded with its provenance and shown for approval.

## Layers
```
src/lib/ai/
  prompts.ts     Central prompt + policy layer. Versioned per feature.
  types.ts       AiContext, AiResult, AiProvider interface.
  mock.ts        Deterministic mock provider (grounded, testable).
  anthropic.ts   Anthropic Messages API via fetch (server-side, no SDK dep).
  index.ts       Provider resolution + runAi() with mock fallback.
src/server/services/context.ts   Builds grounded AiContext from the store.
src/server/actions/ai.ts         Server actions that call runAi and log.
```

### Prompt and policy layer
`prompts.ts` holds a single `SHARED_POLICY` (the trust rules above) and a
versioned `FEATURE_PROMPTS` entry per feature. Nothing else in the codebase
writes prompts. `PROMPT_VERSION` is stored on every generation so outputs can be
audited against the exact instructions used.

### Provider abstraction
`AiProvider` has one method, `generate(feature, context)`. Two implementations:
- **MockAiProvider** composes grounded output from the structured context. It is
  deterministic (no randomness), never introduces figures not present in the
  context, and is unit tested. This is the default and the fallback.
- **AnthropicAiProvider** calls the Messages API with `fetch`, server-side only,
  reading `ANTHROPIC_API_KEY` from the environment. No key ever reaches the
  browser and no extra SDK dependency is required.

`getAiProvider()` resolves the provider from `AI_PROVIDER` and key presence;
`runAi()` wraps the call so that any live failure falls back to the mock (with
the fallback noted transparently in the result's model name).

### Grounded context
`context.ts` builds `AiContext` from the store: approved profile fields, selected
evidence summaries, and relevant programme/indicator data. Report generation only
includes indicators and evidence that the report references. The command bar
context includes pipeline value, deadlines and reports due, so answers reflect
real state.

### Provenance
Every AI result carries an `AIProvenance`: profile fields used, documents used,
programme data used, assumptions made, and what could not be verified. In the UI
this is a private drawer (`ProvenanceDrawer`) attached to each draft. It is never
included in an exported application or report unless the user explicitly adds it.

## Features
- Draft an application answer; improve clarity; make more specific; strengthen
  with evidence; shorten to word limit; review against funder criteria.
- Generate impact report sections from programme and indicator data.
- Summarise the funding pipeline.
- Answer command-bar questions using approved data.
- Weekly priorities on the Command Centre are derived deterministically from
  live data (deadlines, review states, grant health) rather than generated, so
  they are always grounded.

## Safety behaviours (tested)
- The mock provider is deterministic and respects word limits.
- It refuses to invent evidence when none is selected, and marks it in
  `couldNotVerify`.
- For beneficiary stories with no qualitative evidence, it states that no stories
  have been added rather than inventing quotes.
- The user must explicitly accept an AI candidate before it becomes the active
  answer.

See `tests/unit/ai-mock.test.ts`.
