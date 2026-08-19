# Pegasus Mission OS — Marketing Site Architecture

**Status:** Active.
**Date:** 2026-08-17
**Scope:** the public marketing site at `mission.pegasus-studio.co` (the Next.js route `/`, plus `robots`, `sitemap` and metadata).
**Authority for product claims:** [`PEGASUS_PRODUCTION_BUILD_SPEC.md`](./PEGASUS_PRODUCTION_BUILD_SPEC.md) §7 and its per-slice verification records. Where this document and that one disagree about what exists, that one wins.

> The site's job is to make a visitor understand, in about sixty seconds, that Pegasus is an operating system for a mission-driven organisation rather than a grant tool with extra tabs — **without** claiming a single capability the repository cannot currently demonstrate.

---

## 1. What existed before this rebuild

### 1.1 Structure

`src/app/page.tsx` was a single 450-line server component holding eight sections inline:

| # | Section | Content |
|---|---|---|
| 1 | Sticky header | Wordmark · How it works / Modules / FAQ / Contact · Sign in · Enter demo |
| 2 | Hero | "Every mission deserves world-class technology." + two CTAs + demo-data disclaimer |
| 3 | Product preview | One static PNG (`preview-command-centre.png`) in `BrowserFrame` |
| 4 | Capabilities | Five checklist rows |
| 5 | How it works | Three steps (find funding / write with evidence / prove delivery) |
| 6 | Pipeline preview | Second static PNG (`preview-funding-board.png`) + four bullets |
| 7 | Modules | **"Six modules that share one source of truth."** — six cards |
| 8 | Studio / FAQ / Contact / Footer | Studio panel, four FAQs, contact form, two-column footer |

### 1.2 Marketing components

Three, all small:

- `BrowserFrame.tsx` — traffic-light chrome + `next/image`. Label hardcoded to `app.pegasus-studio.co`. **Deleted in this rebuild**; `AppFrame` supersedes it, taking children instead of an image and reading its address from configuration. The two PNG screenshots it displayed are left on disk unreferenced — removing a user's assets is their call, not the rebuild's.
- `Reveal.tsx` — client `IntersectionObserver` wrapper; resting state in CSS so `prefers-reduced-motion` and no-JS readers are handled. **Kept unchanged.**
- `ContactForm.tsx` — client form over the `submitEnquiry` server action (Zod validated, honeypot, rate-limited, `@public-action` marked). **Kept unchanged.**

### 1.3 Design tokens (`src/styles/globals.css`, `tailwind.config.ts`)

Already strong, already on-brand, and **entirely preserved**:

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `#fffcfa` | warm off-white canvas |
| `--color-ink` | `#14213d` | Pegasus navy |
| `--color-accent` | `#ff5757` | coral mark/fill |
| `--color-accent-ink` | `#c62f2b` | coral **text** on light (AA) |
| `--color-blue` | `#3079d8` | studio blue, the CTA colour |
| `--color-line` | `#e9e9e9` | fine borders |
| radii | 6 → 28px, `--radius: 10px` | rounded but restrained |
| shadows | `elev-1/2/3`, `card`, `coral`, `brand-blue` | low, warm, navy-tinted |
| type | Quicksand (headings, `300–700`) over Nunito Sans (body, `200–900`), both local `woff2` | brand character |

A full dark theme exists under `:root[data-theme="dark"]`. Motion primitives (`fade-up`, `float-slow`, `.reveal`, `.brand-wash`) exist and are already neutralised under `prefers-reduced-motion`.

### 1.4 Brand assets

`src/components/brand/Wordmark.tsx` — `Wordmark`, `PegasusGlyph` (coral arc + rising dot, `currentColor`), `BrandMotif` (oversized low-opacity decorative variant). No raster logo; nothing to replace.

### 1.5 Product UI the previews must match

`src/components/shared/ui.tsx` (`Button` pill variants, `Card`, `CardHeader`, `Pill`), `shared/misc.tsx` (`MetricPanel`, `ProgressMeter`, `VerificationBadge`, `DeadlineIndicator`), `StatusBadge`, `FitAssessmentPanel`, `RelationshipBriefPanel`, `ProvenanceDrawer`. The application chrome is a left rail of eleven items (`navigation/nav-items.ts`) — Command Centre, Relationships, Funding, Applications, Grants, Programmes, Impact, Evidence, Organisation, Team, Settings. **The old "six modules" line was already contradicted by the product's own navigation.**

### 1.6 Responsive behaviour

Single container (`max-w-6xl`, `px-5 sm:px-8`), one or two breakpoints per section, everything stacking at `md`. Correct but undesigned for mobile: the mobile experience was the desktop experience in a column.

---

## 2. What stays, what changes

### Stays

- Every design token, the type scale, the local fonts, the brand wash, the glyph and motif.
- `Reveal`, `ContactForm` and the `submitEnquiry` action untouched in behaviour.
- The hero headline **"Every mission deserves world-class technology."**
- The demo-data disclaimer, in the hero and near every product preview.
- The contact section's human tone: *"Tell us what your team is wrestling with."*
- Static-first rendering. The page remains a server component.

### Changes

| Before | After |
|---|---|
| One 450-line page component | ~20 focused components under `components/marketing/`, composed by a thin `page.tsx` |
| "Six modules that share one source of truth" | "One operating system for the organisation behind the mission" — seven domains over one shared model, with an intelligence layer above and Mission Graph + Trust below |
| Two static PNG screenshots | Responsive HTML/CSS product recreations rendered from **real seeded repository data** |
| Four FAQs | Nine |
| Nav: How it works / Modules / FAQ / Contact | Product / How it works / Intelligence / Trust / Who it's for |
| Hardcoded `app.pegasus-studio.co` | `marketingUrl` / `appUrl` from `appConfig` |
| No sitemap, robots, OG or structured data | All four |
| No roadmap honesty | An explicit, sparing status-chip vocabulary (§9) |

---

## 3. Narrative architecture

The site is **two routes**, split by what the visitor has already decided.

`/` answers *what is this and is it for me* in six sections. `/product` answers
*how does it actually work* at whatever length the argument needs. The split
replaced an eighteen-section home page: it made the same point — the domains
are connected, the figures are traceable — five separate times through five
separate demos, and a visitor had to scroll past all of it to reach the FAQ.

### 3.1 `/` — the home page

| # | Section | Answers |
|---|---|---|
| 1 | Navigation | — |
| 2 | Hero | 1. What is Pegasus? |
| 3 | What it does (seven domain tiles) | 3. Why isn't it just grant software? 4. Why an operating system? |
| 4 | See it working (live composition) | 8. What can I use today? |
| 5 | Who it's for | 2. Who is it for? |
| 6 | Trust | 6. Why trust it? |
| 7 | FAQ | 8, and every residual objection |
| 8 | Final CTA + contact + footer | 10. What next? |

**The spine:** here is what it is → here are the seven parts and the one model
under them → here it is running on real records → here is your seat in it →
here is why it is safe → here are your objections → here is what to do.

The section count is enforced. `tests/unit/marketing-content.test.ts` fails the
build if `src/app/page.tsx` composes more than eight marketing sections, because
nothing else stops the page growing back to eighteen one well-argued section at
a time. Depth goes on `/product`; if a section genuinely belongs on the home
page, something else comes off it.

### 3.2 `/product` — the walkthrough

| # | Section | Answers |
|---|---|---|
| 1 | Header | — |
| 2 | Fragmentation | 9. Why is this better than disconnected tools? |
| 3 | The operating system (Mission OS map) | 4, 7. How do the domains connect? |
| 4 | Mission lifecycle | 7. How does information compound? |
| 5 | Pegasus Intelligence | 5. What does the AI do? 6. Why trust it? |
| 6 | Organisation Intelligence | 3 |
| 7 | Funding Intelligence | 3, 5 |
| 8 | Finance Intelligence | 3, 7 |
| 9 | Relationships | 3, 7 |
| 10 | Impact & reporting (provenance) | 6, 7 |
| 11 | Product principles | 6, 8 |
| 12 | Product explorer | 8. What can I use today? |
| 13 | Pegasus Studio | credibility, deliberately low-prominence |
| 14 | Final CTA + contact + footer | 10. What next? |

**The spine:** fragmentation is the pain → one model is the answer →
the lifecycle is how value compounds → intelligence is what one model makes
possible → five vertical proofs → here is what you can touch today.

### 3.3 Cross-route links

Nav and footer hrefs are **root-relative**, not bare fragments: `/#trust`, not
`#trust`. The same nav renders on both routes, and a bare fragment silently
scrolls nowhere on the page that does not contain it. `NavLink` in
`MarketingNav.tsx` routes paths through `next/link` and leaves anything
containing a `#` as a plain anchor, so the browser handles the scroll it
already handles correctly. A unit test checks every link resolves: the fragment
against the rendered corpus, the path against the route that must exist.

### 3.4 Register

Short sentences, everyday words, one idea per line. The audience reads this
between other jobs, not settled in with an essay. Where a sentence has to stay
long to stay true — §9.3's isolation claim is the clearest case — it stays
long, and no shortening pass touches it.

---

## 4. Component architecture

```text
src/lib/config.ts  marketingUrl / appUrl / studioUrl, from env (§10)

src/lib/marketing/
  content.ts     all copy as data: nav, domains, fragments, lifecycle, personas,
                 trust principles, principles, FAQs, footer, status vocabulary
  preview.ts     loaders that read REAL seeded data through MissionRepository
                 and run the product's own deterministic engines
  rail.ts        the application's left-rail labels for previews, kept in sync
                 with NAV_ITEMS by a unit test rather than by an import

src/components/marketing/
  primitives.tsx        Section, SectionHeader, StatusChip, AppFrame, PreviewSurface,
                        MiniMetric, KeyValue, Hairline    (server)
  MarketingNav.tsx      sticky nav + accessible mobile sheet             (client)
  Hero.tsx                                                              (server)
  WhatItDoes.tsx        seven domain tiles, the home page's whole product
                        argument in one scannable grid                   (server)
  ProductComposition.tsx Command Centre + satellite cards, no container
                        of its own — it renders inside a <Section>       (server)
  FragmentationSection.tsx converging fragments, CSS-only                (server)
  MissionOSMap.tsx      interactive domain map / mobile accordion        (client)
  IntelligenceDemo.tsx  deterministic-vs-AI split + real fit readout     (server)
  Lifecycle.tsx         12-stage progression, horizontal → vertical      (server)
  OrganisationIntelligenceDemo.tsx                                      (server)
  FundingIntelligenceDemo.tsx  real assessFit() output                   (server)
  FinanceIntelligenceDemo.tsx  fixture figures, labelled In development  (server)
  RelationshipDemo.tsx  real buildRelationshipView() brief               (server)
  ImpactProvenanceDemo.tsx  click-a-figure provenance drill-down         (client)
  TrustSection.tsx      five principles                                  (server)
  PersonaExplorer.tsx   six personas, tablist                            (client)
  ProductExplorer.tsx   six product previews, tablist                    (client)
  PrinciplesSection.tsx                                                  (server)
  FAQ.tsx               native <details>, no JS                          (server)
  StudioSection.tsx                                                      (server)
  FinalCTA.tsx                                                           (server)
  MarketingFooter.tsx                                                    (server)
  Reveal.tsx            unchanged                                        (client)
  ContactForm.tsx       unchanged                                        (client)

src/app/
  page.tsx          the home page: six sections, metadata + JSON-LD (§3.1)
  product/page.tsx  the walkthrough: everything the home page hands off (§3.2)
  legal/page.tsx    privacy / terms / cookies, current position (see §11)
  robots.ts         marketing indexed, application routes disallowed
  sitemap.ts        the three public URLs
```

**Five client islands only** — `MarketingNav`, `MissionOSMap`, `ImpactProvenanceDemo`, `PersonaExplorer`, `ProductExplorer` — plus the two pre-existing ones (`Reveal`, `ContactForm`). Everything else is a server component and ships zero JavaScript.

The home page loads three of them (`MarketingNav`, `PersonaExplorer`, `Reveal`) plus `ContactForm`; `MissionOSMap`, `ImpactProvenanceDemo` and `ProductExplorer` are only on `/product`, which is most of why `/` is the lighter route.

### 4.1 The rule that keeps the previews honest

Product previews are **not** hand-written fiction. `src/lib/marketing/preview.ts` resolves a `RequestContext` and reads the seeded Northstar workspace through `MissionRepository`, exactly as the application does, then runs the same deterministic functions the product runs:

It binds to the **demo** context and the **demo** repository explicitly —
`createDemoContext()` and `getDemoRepository()`, not `resolveRequestContext()`
and `getRepository()`. That is correctness, not convenience: a public marketing
page has no session and no tenant, so resolving the live context throws once
Supabase auth is the active path, and resolving the live repository would point
an anonymous page at a production database. `getDemoRepository()` was added to
the data layer for this, so the marketing site stays inside the data boundary
while being structurally unable to read tenant data.

| Preview | Source |
|---|---|
| Command Centre | `dashboardMetrics()`, `weeklyPriorities()`, `upcomingDeadlines()` |
| Funding fit | `assessFit()` over `opp-horizon` + the live profile and evidence count |
| Relationship brief | `buildRelationshipView(ctx, repo, "xorg-henderson")` |
| Impact provenance | `repo.claims.get("clm-participants-2025")` + `supportChain()` |
| Programme / impact | `repo.programmes`, `repo.grants`, `repo.evidence` |

Consequences, all deliberate:

1. **No invented customer data can appear on the site.** If a figure is on the page, it is in the seed.
2. If the seed changes, the marketing site changes with it — so no prose on the page restates a number that the component also renders. Numbers live in one place: the data.
3. The site must not import `@/features/store` directly — `tests/unit/data-boundary.test.ts` fails the build if it does. It goes through the repository like every other caller.

Two facts that surfaced from running the real engines, and that the copy now reflects rather than contradicts:

- The Horizon Youth Opportunity Grant scores **91 — strong match**, not the illustrative 82 in the brief. The site prints what `assessFit()` returns.
- There is no "Henderson Youth Fund" in the seed. The Henderson Trust is the *existing funder relationship* (two grants, £170,000). The intelligence demo therefore asks *"Should we apply for the Horizon Youth Opportunity Grant?"*, which is a real seeded opportunity, and the relationship section uses Henderson, which is a real seeded relationship.

---

## 5. Responsive strategy

Breakpoints: base (`<640`), `sm` (640), `md` (768), `lg` (1024), `xl` (1280). Container `max-w-6xl`, gutters `px-5 sm:px-8`, section rhythm `py-16 sm:py-20 lg:py-28`.

Six components are **designed twice**, not stacked:

| Component | Desktop | Mobile |
|---|---|---|
| Mission OS map | Radial/columnar map; hover or focus a domain, detail renders in a fixed panel so nothing reflows | A single accessible accordion (`aria-expanded` buttons) — nine rows, each expanding to its role. No shrunken diagram. |
| Lifecycle | Horizontal rail, 12 stages, connective line, `overflow-x: auto` with scroll-snap | Vertical timeline with a left spine; each stage a full-width card |
| Intelligence demo | Two columns: question/verdict left, factor grid + sources right | One column, factor list becomes a stacked definition list |
| Persona explorer | Vertical tablist left, panel right | Horizontal scrolling tablist, panel below |
| Product explorer | Tablist above a wide `AppFrame` with a fake left rail | Tab chips; the rail is hidden, the panel content reflows to one column |
| Provenance demo | Chain across the top, figure inline, panel opens beside it | Chain scrolls horizontally; the panel opens **below** the figure, focus moves to it |

`AppFrame` previews never scroll the page horizontally: any wide inner content sits in its own `overflow-x-auto` region.

---

## 6. Animation strategy

Motion explains relationships between information. Nothing loops forever, nothing follows the cursor, nothing parallaxes, and no number counts up.

| Where | Motion | Mechanism |
|---|---|---|
| Section entrances | 14–18px rise + fade, staggered ≤ 110ms | existing `Reveal` + `.reveal` CSS |
| Fragmentation | Eight labelled fragments translate from scattered offsets to a single column, once, on entry | `@keyframes converge-*`, CSS only, driven by `.reveal.is-visible` |
| Mission OS map | Connector lines brighten and the related domains lift when a domain is hovered/focused | CSS `:has()`-free sibling state via a React `activeId`, transition on `opacity`/`stroke` |
| Lifecycle | The connective line fills as the rail enters the viewport | `scaleX` transition on `.is-visible` |
| Provenance | Panel expands with a height/opacity transition; the trace path draws once | CSS transition; `stroke-dashoffset` |
| Product explorer | Cross-fade between panels, 180ms | CSS transition on `opacity` |

**Budget:** no animation library. Zero new dependencies. Total added CSS keyframes: five.

`prefers-reduced-motion: reduce` already zeroes durations and restores resting states globally in `globals.css`. Every new keyframe is additionally listed in that block so it resolves to its final state rather than its first frame. **Reduced motion must never hide content** — that is the specific failure the existing `.reveal` override guards, and the new rules follow the same pattern.

---

## 7. Performance strategy

- Server components by default; five client islands, each small and each below the fold except `MarketingNav`.
- **No new runtime dependencies.** Icons come from `lucide-react`, already in the bundle.
- Fonts are the two existing local `woff2` files with `display: swap` — no CDN, no new font.
- The two existing PNG screenshots are **retired from the critical path**. HTML/CSS recreations replace them, which removes ~2 large images from LCP contention and makes the previews responsive and readable at 375px.
- LCP element is the hero `<h1>` — text, in a local font, with no image above it.
- No layout shift: every preview surface has an intrinsic size from its content; the nav is fixed-height; the mobile sheet is `position: fixed` and does not reflow the page.
- The page stays statically rendered at build time (`resolveRequestContext()` is deterministic and the demo clock is pinned), so the seeded reads cost nothing at request time.

---

## 8. Accessibility strategy

| Requirement | Implementation |
|---|---|
| Semantic headings | One `<h1>`; every section is `<section aria-labelledby>` with a single `<h2>`; sub-items use `<h3>`. No level is skipped. |
| Landmarks | `<header>`, `<nav aria-label>`, `<main>`, `<footer>`; a skip link to `#main`. |
| Keyboard | Every interactive element is a real `<button>` or `<a>`. The Mission OS map, persona explorer and product explorer are `role="tablist"` with roving `tabindex`, arrow-key/Home/End support and `aria-selected`. |
| Visible focus | The global `:focus-visible` ring is inherited; no component removes an outline without replacing it. |
| Interactive diagrams | The Mission OS map exposes the same content as a `<ul>` of labelled controls with `aria-controls` on a live panel. The SVG connectors are `aria-hidden` decoration — **the diagram is never the only carrier of meaning.** |
| Accordions | FAQ uses native `<details>/<summary>` (works with JS disabled). The mobile Mission OS accordion uses `aria-expanded` + `aria-controls` on `<button>`s. |
| Mobile navigation | Sheet is `role="dialog" aria-modal="true"`, focus is trapped and restored, `Escape` closes, the trigger reflects `aria-expanded`, and body scroll is locked while open. |
| Reduced motion | §6. |
| Contrast | Coral **text** uses `accent-ink` (`#c62f2b`), never `accent`. Status chips carry a label and an icon shape, never colour alone. Muted body copy stays at `ink-muted` (`#6b7280`) on paper — 5.6:1. |
| Meaning not by colour | Every status chip, fit factor and verification state pairs its colour with a word and an icon, matching the product's own `StatusBadge` contract. |

---

## 9. Truthful-product-claims rules

### 9.1 The rules

1. **Present tense means production-live.** If a sentence uses "does", "connects", "shows" with no qualifier, the capability must be demonstrable in the repository today.
2. **A capability that only exists in the demo is labelled `Available in demo`.** The demo is real software over a seeded in-memory workspace — that is not a lesser claim, but it is a different one from "your data, persisted".
3. **A capability whose engine exists but whose product surface does not is labelled `In development`,** and the copy says which half exists.
4. **A capability that is designed but not built is labelled `Coming to Pegasus`,** and is never shown as a working screen without that label adjacent to it.
5. **Never describe a deterministic calculation as AI, and never describe a model output as analysis.** Fit, grant health, relationship health, evidence strength and every finance figure are deterministic. AI researches, drafts, summarises and explains.
6. **No fabricated social proof.** No customer logos, no testimonials, no ratings, no counts of users, no "trusted by". No `AggregateRating` or `Review` structured data. The site has none of these and must acquire none until they are real.
7. **Security claims are architectural, not certified.** See 9.3.
8. **Every product figure on the page comes from the seed via the repository** (§4.1).
9. **Labels are used sparingly.** At most one chip per section, placed on the artefact it qualifies, never scattered across a grid.

### 9.1a House style: no em dash, anywhere a customer can read it

The em dash is prohibited in customer-facing copy. Not discouraged: prohibited,
and enforced by `tests/unit/customer-facing-copy.test.ts`, which fails the
build on one.

The reason is the same reason the rest of §9 exists. The em dash is the most
recognisable tell of machine-written prose, and a site whose whole argument is
that Pegasus does not fabricate things cannot read as though it was fabricated.
An absolute is also cheaper to hold than a guideline: a rule with exceptions
gets re-argued at every review, and a failing test gets fixed.

**Scope.** Every string literal and JSX text node under `src/`. That covers the
marketing copy, the application's own labels, and strings assembled at runtime
such as `allocationNote` or a relationship health signal, because a customer
reads those too. Code comments are exempt. Regular expressions are exempt: an
em dash inside one is matching somebody else's text rather than writing ours,
and the organisation research parser splits third-party page titles on it.

**Replacing one.** Use what it was standing in for, and reread the sentence:

| The dash was doing | Use |
|---|---|
| Fusing two sentences | A full stop |
| Introducing a list or a label | A colon |
| Wrapping an aside | Commas, or brackets |
| Standing in for an empty value in a table | The word: `None`, `Not set`, `Not stated` |

Dropping a comma in where the dash was and changing nothing else is how the
tic survives a search-and-replace. The point is the sentence, not the glyph.

### 9.2 Claims register

Status is derived from `PEGASUS_PRODUCTION_BUILD_SPEC.md` §7 and the per-slice verification records.

| # | Claim made on the site | State | Evidence | Label |
|---|---|---|---|---|
| 1 | Funding pipeline, eligibility and explainable fit | Live | `lib/logic/fit.ts`, 8 factors, `tests/unit/fit.test.ts` | none |
| 2 | Applications with organisation-aware drafting | Live | `server/actions/ai.ts`, `AnswerEditor` | none |
| 3 | Grants: health, deliverables, payments, reports | Live | `lib/logic/grant-health.ts` | none |
| 4 | Programmes, outcomes, indicators | Live | `programmes/[id]`, `IndicatorEditor` | none |
| 5 | Evidence library with verification states | Live | `EvidenceLibrary`, `VerificationBadge` | none |
| 6 | Relationships: people, orgs, interactions, commitments, briefs assembled from records | Live | Relationships Phase 1, criteria 1–12 all ✅ | none |
| 7 | Claims: immutable, sourced, `supersedes`, `claim_usages` reverse index, confidence never promotes verification | Live **in the model**; persisted only in the in-memory workspace | Slice B ✅, 313 tests, 3 mutation tests | `Available in demo` on the provenance panel |
| 8 | Every AI generation returns the references it actually used; fabricated references are rejected | Live | `lib/knowledge/grounding.ts`, `GroundingViolationError` | none |
| 9 | Tenant scoping on every repository read and write | Live | Slice A ✅, 33-test two-tenant suite, build-failing boundary test | none |
| 10 | Permission enforcement on every mutating action | Live | Slice C partial ✅, `authorise()` + build-failing grep test | none |
| 11 | Database-level RLS blocking cross-tenant access | **Written, unverified** | Migrations 0002/0004; §6 "no provisioned Supabase project" | never stated as verified — see 9.3 |
| 12 | Authentication / accounts | **Not built** (S3, Slice C) | `resolveRequestContext()` returns the demo owner | site offers a demo, not an account |
| 13 | Reports built from live claims rather than copied numbers | **Not built** (Invariant 5 violated, Slice D) | `ImpactReportSection` stores copied prose | `Coming to Pegasus` on the report-rebuild claim; the provenance demo is framed on Evidence + Claims, which do exist |
| 14 | Finance: runway, concentration, cliffs, forecast, unit economics, funding need | **Engine live, no product surface** | `lib/finance-intelligence/`, 80 tests; §17 "UI … deliberately not in this slice" | `In development` |
| 15 | Finance ingestion — statements, transactions, classification | **Not built** (Slice E) | §17 Foundation ⏳ | covered by the same `In development` label |
| 16 | Organisation research at onboarding — website, regulator, accounts | **Extraction core live, no crawler, no UI** | Org Intelligence Phase 1 ✅ (41 tests); Phase 2 = crawler + review UI | `Coming to onboarding` |
| 17 | Email/calendar sync, bank feeds, accounting integrations | **Not built** (Slice I) | provider interfaces declared only | never shown; the FAQ says so plainly |
| 18 | Attention system / role-aware "what needs attention today" | **Not built** (Slice G) | Command Centre is metrics + priorities today | not claimed; the Command Centre preview shows what exists |
| 19 | Intelligence orchestrator calling deterministic tools | **Not built** (Slice F) | four isolated AI entry points today | the Intelligence section describes the *boundary* (which is real) and labels orchestration `Coming to Pegasus` |

### 9.3 The isolation sentence, written once and reused verbatim

> **ISOLATED** — Pegasus is architected for tenant-scoped organisational data. Every read and write is scoped to one organisation at the repository boundary, and that is proven by a two-tenant test suite and a build-failing boundary check. Database-level row-level security is written into the migrations but has not yet been verified against a live database.

This is the only wording permitted for the isolation claim. It must not be shortened to "your data is isolated", "enterprise-grade security", "SOC 2", "encrypted at rest", or any certification language. Invariant 1 is upheld at the layer we can prove and the sentence says which layer that is.

### 9.4 Status chip vocabulary

Exactly three, defined in `content.ts` and used nowhere else:

| Chip | Meaning | Used on |
|---|---|---|
| `Available in demo` | Works today over the seeded workspace; not yet over your own persisted data | Provenance/claims panel |
| `In development` | The deterministic engine is built and tested; the product surface is not | Finance Intelligence |
| `Coming to Pegasus` / `Coming to onboarding` | Designed and specified; not built | Organisation research, report rebuild-from-claims, orchestration |

Total across both routes: **five chips.** Any sixth is a signal the copy has over-reached and should be rewritten instead of labelled. Finance carries one on each route — the same claim on the home page's domain grid and on the product page's principles — which is one claim, labelled wherever it appears, not two.

---

## 9.5 Imagery and brand assets

The site carries **no photographs and no screenshots**, and that is a decision
rather than an omission. Product surfaces are HTML recreations (§4.1), which
are responsive, themable, legible to a screen reader and incapable of going
stale. Everything else visual is drawn in the page.

| Asset | Where | How it is made |
|---|---|---|
| Brand mark | `components/brand/Wordmark.tsx` | Inline SVG, `currentColor` |
| Hero figure | `components/marketing/MissionGraphic.tsx` | Inline SVG, Tailwind colour utilities |
| Domain icons | `WhatItDoes.tsx`, keyed by domain id | `lucide-react` |
| Dot lattice | `.dot-grid` in `globals.css` | CSS gradient, masked, theme-tinted |
| Favicon / touch icon | `app/icon.svg`, `app/apple-icon.svg` | The mark on the fixed navy plate |
| Share card | `public/og.png` | `scripts/build-og-image.mjs` |

**The hero figure** draws seven nodes on a ring, each joined to one centre and
none joined to each other. The missing node-to-node edges are the argument:
integrations between modules would be a mesh, and this is a hub because there
is one record underneath. It is decorative and hidden from assistive
technology, because the claim it illustrates is made in words beside it.

**The share card** is the one asset that cannot be drawn live, because crawlers
do not render SVG. It is therefore the one that can go stale silently, which is
why it is generated by a committed script rather than exported by hand:

```bash
node scripts/build-og-image.mjs   # after any change to the palette, fonts or card
```

Chromium renders it rather than Satori (`next/og`), because the brand faces
ship as WOFF2 and Satori cannot read WOFF2 — rendering in a browser gets real
Quicksand instead of a substituted system sans. A unit test asserts the PNG
exists and is still 1200x630, since `summary_large_image` was declared with no
image behind it for months and nothing caught it.

### Photography

`PHOTOS` in `content.ts` is empty, and `PhotoBand` renders nothing while it
stays empty. Stock photography of models captioned as though they were the
organisations who use Pegasus is the same claim as an invented testimonial, and
is ruled out by the same rule. Real photographs go in `public/photos/` with an
entry each: landscape, at least 1200x900, shot at real delivery. Everyone
identifiable needs to have agreed to appear on a public website, which is a
consent question rather than a licensing one.

### Unused

`public/preview-command-centre.png` and `public/preview-funding-board.png` are
genuine screenshots of the running product, kept but referenced nowhere. The
HTML recreations replaced them on every count that matters (§4.1). They are
retained because they are real product assets rather than stock, and are worth
having for a deck or a README that is not subject to §4.1.

---

## 10. SEO, structured data and domains

- `metadataBase` from `appConfig.marketingUrl`; `alternates.canonical` set per route.
- OpenGraph (`type: website`, `locale: en_GB`, site name, title, description) and `summary_large_image` Twitter card.
- `app/robots.ts` allows `/`, disallows the application routes (`/dashboard`, `/funding`, `/applications`, `/grants`, `/programmes`, `/impact`, `/evidence`, `/relationships`, `/organisation`, `/team`, `/settings`, `/onboarding`, `/login`, `/signup`) — a seeded demo workspace should not be indexed as content.
- `app/sitemap.ts` lists the three public URLs: `/`, `/product` and `/legal`. Section anchors are not listed — padding a sitemap with fragments does not create pages, it creates duplicates of one.
- JSON-LD, on `/` only: `Organization` (Pegasus Information Studio, with `sameAs` to the studio site), `SoftwareApplication` (Pegasus Mission OS, `applicationCategory: BusinessApplication`) and `FAQPage` built from the FAQs that page actually renders. `/product` declares none, so there is one `FAQPage` on the site rather than two competing copies. **No `AggregateRating`, no `Review`, no `offers` with a fabricated price.**

### Domain configuration

| Config | Env var | Default | Used for |
|---|---|---|---|
| `appConfig.marketingUrl` | `NEXT_PUBLIC_MARKETING_URL` | `https://mission.pegasus-studio.co` | `metadataBase`, canonical, sitemap, JSON-LD |
| `appConfig.appUrl` | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | the browser-chrome label on previews, absolute app links |
| `appConfig.studioUrl` | `NEXT_PUBLIC_STUDIO_URL` | `https://www.pegasus-studio.co/` | studio section, footer, JSON-LD `sameAs` |

No component hardcodes a host. Internal navigation to the application stays relative (`/dashboard`) so the demo works on any origin; only display labels and metadata use the configured hosts.

---

## 11. Deliberately not done

| Not done | Why |
|---|---|
| Separate `/product`, `/trust`, `/pricing` routes | The nav targets in-page sections. Splitting before there is enough distinct content produces thin pages. The section IDs are already route-shaped, so promoting any of them later is a move, not a rewrite. |
| Blog / changelog | No content to put in it. |
| Pricing | Not decided. Inventing one would violate §9. |
| Animation library | Five CSS keyframes cover every motion in §6. |
| Screenshot pipeline | HTML recreations are responsive, themable, accessible and always current; PNGs are none of those. |
| A claims-backed report demo | Invariant 5 is still violated (Slice D). The provenance demo is built on Evidence + Claims, which exist, and the section is structured so the Slice D upgrade is a data change, not a redesign. |

---

## 12. Verification

Run after any change to the marketing site:

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
```

Marketing-specific checks:

- `tests/e2e/marketing.spec.ts` — nine journeys: the hero answers "what is this", the home page's domain grid leads to `/product` and the detail is still reachable, the Mission OS map is operable by arrow keys, the mobile sheet traps focus and restores it on Escape, a figure opens its provenance and a forecast is still labelled a forecast, the persona explorer switches panels, the product explorer renders seeded records, the Trust section still states what has not been verified, and `robots.txt` keeps the demo out of the index.
- `tests/unit/customer-facing-copy.test.ts` — two guards: no em dash in any string literal or JSX text under `src/` (§9.1a), and the assets the metadata promises (`og.png` at 1200x630, `icon.svg`, `apple-icon.svg`) are all present.
- `tests/unit/marketing-content.test.ts` — nine guards over §3 and §9: the preview rail matches the product's real navigation, every nav link resolves (fragment to a rendered section, path to a route that exists), the home page composes no more than eight marketing sections, the status vocabulary stays at three states, the isolation claim still admits the unverified layer, no certification language, no fabricated social proof or rating structured data, no inverting `bg-ink` ground under fixed white text, and Finance stays labelled.
- `npm run test:e2e` reuses whatever is already on port 3000. A `next dev` server left running there serves stale chunks once `npm run build` has overwritten `.next`, and every JS-dependent test fails with the static assertions still passing. Stop the dev server before running the suite; the failure looks like broken hydration and is not.
- Manual: 375px / 768px / 1280px / 1440px / 1680px; `prefers-reduced-motion: reduce` (asserted: zero elements left below full opacity); full keyboard traverse; dark theme via `data-theme="dark"`.
- Any new sentence about capability is checked against the §9.2 register before it ships. If a row does not exist for it, add the row first.

### Verification record — this rebuild

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **378 passed** (was 350; +8 marketing guards, +20 from concurrent work on `src/server`) |
| `npm run test:e2e` | **19/19** (11 product journeys unchanged, 8 new marketing journeys) |
| `npm run build` | succeeds; `/` stays statically prerendered at 28.8 kB / 152 kB first load |

**Defects found by review and fixed, worth recording because none was visible in the code:**

1. **Dark theme rendered the Trust section white-on-white.** It painted `bg-ink` with `text-white`, and `--color-ink` inverts to near-white under `[data-theme="dark"]`. A fixed `--color-navy` token now exists for surfaces that must stay navy in both themes, and a unit test fails the build if an inverting ground is paired with fixed white text again.
2. **The hero satellites covered the Command Centre's priorities list.** Absolute positioning made the composition look layered by hiding the part of the product worth reading. They sit below the frame now, joined by hairlines.
3. **`supportChain()` includes the claim it is called on** — it is a derivation trace, not a dependency list — so the provenance panel showed a verified fact standing on itself. Filtered at the preview boundary.
4. **The lifecycle rail drew one line across the grid**, which joined the first row and abandoned the second. Each stage now carries its own connector.
5. Duplicated map tile labels ("Finance / Finance"), a filler tile that read as an eighth domain, an invisible convergence arrow, and chains that wrapped mid-flow on mobile rather than scrolling.
