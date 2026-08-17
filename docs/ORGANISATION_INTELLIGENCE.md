# Organisation Intelligence

**Status:** Design + Phase 1 slice implemented.
**Companions:** [`PEGASUS_ARCHITECTURE_AUDIT.md`](./PEGASUS_ARCHITECTURE_AUDIT.md), [`PEGASUS_TARGET_ARCHITECTURE.md`](./PEGASUS_TARGET_ARCHITECTURE.md), [`PEGASUS_IMPLEMENTATION_PLAN.md`](./PEGASUS_IMPLEMENTATION_PLAN.md)

> An organisation should not have to manually teach Pegasus everything it already publishes about itself.

---

## 1. Current onboarding architecture

`src/components/onboarding/OnboardingFlow.tsx` is a **hardcoded demonstration facade**:

- 8 steps whose every field value is a literal Northstar string
- no persistence — nothing is written on completion
- no state machine; step is `useState<number>`
- "Profile completeness 82%" is a hardcoded constant
- `/dashboard` is reachable directly, so onboarding is decorative

There is no organisation resolution, no research, no source model and no extraction. **Nothing here needs preserving except the visual shell**, which is well-built and reusable.

### What already exists and must be reused

| Existing | Reuse |
|---|---|
| `Attested<T>` + `VerificationState` | The trust wrapper for every extracted fact. `ai_extracted` and `needs_review` already exist and mean exactly what this pipeline needs. |
| `OrganisationProfile` (~25 attested fields) | The **destination** of approved candidates. No parallel onboarding profile. |
| `EvidenceItem` + `EvidenceLink` | Discovered documents become evidence, not a new entity. |
| `MissionRepository` + `RequestContext` (Phase 1A) | All persistence and tenant scoping. Research records are tenant-owned like everything else. |
| Deterministic `assessFit()` | Consumes the resulting profile unchanged. Organisation Intelligence produces *better input*, it does not replace the scorer. |
| `AIProvenance`, `ai_generations`, audit ledger | Extraction provenance and audit. |
| `SHARED_POLICY`, versioned prompts | Any AI extraction goes through the existing prompt layer. |

### What would duplicate existing functionality — explicitly avoided

- A separate "onboarding profile" store. Candidates flow into `OrganisationProfile`.
- A separate impact representation. Extracted outcomes/indicators feed the existing Impact model (§32 of the brief).
- A second document store. Discovered PDFs become `EvidenceItem`s.
- An AI-based eligibility engine. Eligibility stays deterministic.

---

## 2. Proposed pipeline

```text
RESOLVE ─→ DISCOVER ─→ FETCH ─→ NORMALISE ─→ CLASSIFY ─→ EXTRACT
   ─→ SANITISE ─→ VALIDATE ─→ DEDUPLICATE ─→ RECONCILE (conflicts)
   ─→ CANDIDATES ─→ HUMAN REVIEW ─→ ATTESTED PROFILE ─→ FUNDING PROFILE
```

Each stage is a separate, individually testable function. Deliberately **not** one large prompt.

The critical design choice: **stages before EXTRACT are entirely deterministic**, and much of EXTRACT is too. AI is reserved for semantic interpretation that rules genuinely cannot do (summarising a mission from prose, classifying a programme description). This makes the majority of the pipeline unit-testable without a network or a model, satisfying §51.

---

## 3. Source model

```ts
type SourceAuthority =
  | "regulator"      // official register, government registry, audited accounts
  | "organisation"   // the organisation's own site, official reports, strategy
  | "supporting"     // funder page, institutional partner, recognised research
  | "discovery";     // general web result, news, directory
```

Authority is **ordinal** and drives reconciliation. A random webpage is never equivalent to audited accounts.

`ResearchSource` records id, tenant, type, url, publisher, authority, discovered/retrieved/published timestamps, `contentHash` (for §37 change detection), extraction status and metadata. Sources are deduplicated by **normalised URL** (scheme/host lowercased, `www.` stripped, tracking params removed, trailing slash normalised, fragment dropped).

---

## 4. Trust model — confidence vs verification (§35)

These are orthogonal and modelled separately:

| Concept | Question | Range |
|---|---|---|
| `confidence` | How confident is the *extraction* that the source says this? | 0–1, produced by the extractor |
| `verificationState` | What is the *organisational trust status* of this statement? | existing `VerificationState` enum |

A JSON-LD `Organization.name` extraction can be confidence 1.0 — the markup states it unambiguously — while remaining `ai_extracted`/`needs_review` because nobody at the organisation has confirmed it is current and correct. **High confidence never auto-promotes to verified.**

Promotion happens only through human action:

```text
ai_extracted ──confirm──→ verified   (records verifiedBy, verifiedAt)
             ──edit─────→ provided   (human-supplied value supersedes)
             ──reject───→ discarded  (retained in history, not in profile)
```

---

## 5. Extraction architecture

Three extractor families, tried in authority order per field:

1. **Structured** — JSON-LD `schema.org/Organization`, microdata, OpenGraph. Highest confidence, zero ambiguity, no model needed.
2. **Pattern** — registration numbers, contact details, dates, currency amounts. Deterministic regex with jurisdiction-aware formats.
3. **Semantic** — mission/vision prose, programme descriptions. AI, via structured output schemas validated before persistence.

The first slice implements (1) and (2) only. That is a deliberate ordering: it delivers real extraction with **zero** model dependency, and establishes the provenance contract that (3) must satisfy.

Every extraction carries an `ExtractionMethod` (`json-ld` | `meta` | `microdata` | `pattern` | `heading` | `ai`) and a `locator` describing *where in the source* it came from, so §43 ("where did you get this?") is answerable precisely.

---

## 6. Prompt-injection defence (§42)

Website and document text is **untrusted input**. Defences implemented in the pipeline, not left to prompt wording:

- Extracted text is **sanitised** before it ever reaches a model: instruction-shaped content is neutralised and flagged.
- Sanitised values carry an `injectionSuspected` flag, which forces `needs_review` regardless of confidence, and surfaces in the review UI.
- Content is passed as clearly delimited **data**, never concatenated into the instruction channel.
- The system policy is never assembled from fetched content.

---

## 7. Conflict detection (§12)

Candidates are grouped by `(field, normalised value)`. Where the same field has materially different values across sources, a `Conflict` is raised as a first-class review item rather than silently resolved.

Recommendation is by **authority, then recency, then agreement count** — and the reason is always shown ("two higher-authority sources agree"). Conflicts never auto-overwrite.

---

## 8. Website audit and the gap distinction (§20)

The audit is a **mission-organisation readiness audit**, not SEO. Its most important rule is a modelling one:

```text
state: "not_publicly_found"   ≠   state: "missing"
```

"We could not find a safeguarding policy on your public website" is a *website* gap. Whether the organisation *has* one is unknown until asked. The `OrganisationGap.state` enum encodes this distinction so the UI cannot accidentally collapse it, and every not-found gap prompts: *Yes, upload it / Yes but not public / No / Not applicable.*

---

## 9. Failure handling (§45, §46)

Every stage degrades rather than fails. No website, blocked crawling, JS-only site, unparseable documents, unavailable AI provider, or a newly formed organisation with a one-page site all fall back to guided manual onboarding. Language is "Not available yet" / "Recommended next step", never "FAILED".

---

## 10. Security and privacy (§41)

Public information is still data: respect robots.txt, rate limits and copyright; minimise collection; do not build profiles of individual staff or trustees beyond legitimate organisational context (name and role, not biography). Fetching is server-side only — the AI provider is never given a URL to retrieve (§44).

---

## 11. How this feeds existing deterministic fit (§13 of the task)

`assessFit()` already reads `organisation.type`, `operatingRegions`, `profile.strategicPriorities`, `coreActivities`, `communitiesServed`, governance readiness signals and evidence count. Today those are hand-entered or seeded.

Organisation Intelligence populates exactly those fields **with provenance**, so:

- the existing 8-factor scorer is unchanged,
- but its `evidenceUsed` and `assumptions` become traceable to real sources,
- and the readiness factor stops being a guess about profile completeness.

No change to `fit.ts` is required or made.

---

## 12. Implementation phases

| Phase | Scope | State |
|---|---|---|
| **1** | Onboarding foundation: identity, source model, URL normalisation, authority, classification, **deterministic extraction**, sanitisation, dedup, conflicts, candidate → attested approval | ✅ **This slice** |
| 2 | Website Intelligence: real crawler behind the fetcher port, robots.txt, rate limiting, link discovery at depth | ⏳ |
| 3 | Review & Trust UI: guided review, conflicts, freshness, completeness | ⏳ |
| 4 | Document Intelligence: annual/impact/strategy/accounts extraction | ⏳ |
| 5 | Website Audit + Gap engine + actions | ⏳ |
| 6 | Funding Profile + eligibility profile + taxonomy | ⏳ |
| 7 | Funding Intelligence activation | ⏳ |
| 8 | Continuous refresh + source change detection | ⏳ |

---

## 13. Phase 1 slice — what was built

A pure, dependency-free extraction core under `src/lib/organisation-intelligence/`:

| Module | Responsibility |
|---|---|
| `types.ts` | Source, authority, candidate, conflict, extraction-method model |
| `url.ts` | URL normalisation, origin comparison, dedup keys |
| `authority.ts` | Ordinal authority + reconciliation ordering |
| `classify.ts` | Page kind from URL and title (about, programmes, impact, governance, …) |
| `sanitise.ts` | Prompt-injection neutralisation; `injectionSuspected` flagging |
| `extract.ts` | JSON-LD / OpenGraph / meta / pattern extractors with locators |
| `reconcile.ts` | Dedup, grouping, conflict detection, authority-weighted recommendation |
| `approve.ts` | Candidate → `Attested<T>` transitions (confirm / edit / reject) |
| `pipeline.ts` | Orchestration over an injected `PageFetcher` port |

The `PageFetcher` port is what keeps the suite hermetic: tests supply a fixture website, so **no test touches the network or a model**.

Deliberately **not** in this slice: funding recommendations. Per §53, the foundation must be trustworthy first.

### Verification record

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **102 passed** (was 61; +41 Organisation Intelligence) |
| `npm run test:e2e` | 8/8 passed — no regression |
| `npm run build` | succeeds |

The fixture site (`tests/fixtures/fixture-website.ts`) deliberately contains the awkward cases, so the suite exercises them rather than a happy path: contradictory charity numbers on two pages, a prompt-injection attempt in a meta description, malformed JSON-LD, a linked PDF, an off-site link, a 404, and a one-page site with no links.

### The vertical proven end to end

```text
name + website → source discovered → pages classified → candidates extracted
   → every fact carries source, locator, method, confidence
   → conflicts raised, not resolved → review decision → Attested profile value
```

### Design decisions worth flagging

1. **No AI in this slice.** JSON-LD `schema.org/Organization`, OpenGraph and labelled patterns carry the first slice entirely. This gives real extraction with zero model dependency and a fully deterministic test suite, and forces the provenance contract to be honest *before* semantic extraction arrives.
2. **Confidence never promotes.** A JSON-LD name extraction is 0.98 confident and still `ai_extracted`. Only a human produces `verified`.
3. **An edit yields `provided`, not `verified`.** The value became the human's, not the source's — but the original source reference is retained so the correction stays traceable.
4. **Registration numbers need an explicit label.** A bare six-digit number is never read as a charity number; fabricating a regulatory identifier on a funder-facing profile is a serious failure mode.
5. **Unrecognised documents are `other`.** Guessing a leaflet into `accounts` would hand it regulator authority.
6. **Documents are recorded but not parsed.** `extractionStatus: "skipped"` with a reason, rather than pretending to have read a PDF.

### Next slice (Phase 2)

Real crawler behind `PageFetcher` (robots.txt, rate limiting, redirects), persistence of sources and candidates through `MissionRepository`, and the review UI that replaces the hardcoded 8-step onboarding facade.
