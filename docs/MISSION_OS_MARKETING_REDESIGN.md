# Mission OS marketing redesign

## Current-state critique

The current public site has a strong base: a warm Pegasus palette, local fonts, accessible focus states, reduced-motion support, semantic headings, a keyboard-safe mobile menu, real seeded product captures, careful capability labels and honest trust copy. It is fast, server-rendered and avoids fabricated social proof.

Its weakness is product comprehension. The homepage was intentionally reduced to five sections, so it explains that the product is connected without letting a buyer see enough of funding, delivery, finance, relationships, evidence and reporting to understand how the operating system changes their work. Organisational context, reporting and Pegasus Intelligence are stronger on the product page than in the first journey. The hero also leads with a broad brand line rather than the clearest product outcome.

## Beacon lessons worth adopting

- Say what the product changes in the first screen.
- Pair warm, plain language with large, legible product proof.
- Move from the recognisable problem to the connected outcome.
- Build depth through a few editorial chapters rather than a feature-card catalogue.
- Repeat proof in different product contexts, not the same screenshot.
- Keep calls to action simple and appropriate to visitor intent.

## Patterns deliberately not copied

No Beacon copy, illustration, layout, interaction or asset is reproduced. Mission OS keeps its Pegasus coral, blue and navy identity, trust architecture, product windows and organisation-context motif. It does not position itself as a conventional CRM.

## Three explored directions

### A. Warm Editorial

Large friendly type, generous cream space and soft coral chapters. Very approachable and strong on sector fit, but insufficiently distinctive for the product's intelligence proposition.

### B. Premium Product

Tighter editorial grid, dark product stage, dense interface details and restrained motion. Strong product comprehension and premium feel, but risks feeling like enterprise operations software.

### C. Mission Intelligence

Warm editorial copy combined with a central organisational-context visual, real product windows, provenance cues and a navy intelligence chapter. Best balance of clarity, distinctiveness, trust and mobile potential.

### Chosen direction

Mission Intelligence, softened by Warm Editorial typography and pacing and strengthened by Premium Product's large UI composition. This makes the shared organisational context the visual idea, not a technical diagram.

## Information architecture and homepage narrative

Navigation: Product, How it works, Intelligence, Trust and Questions, followed by Sign in and a real demo/contact action.

Homepage sequence: outcome-led hero and command-centre proof; fragmented reality; one organisational context; editorial product chapters for funding/applications, delivery/finance and relationships/evidence; standalone reporting; Pegasus Intelligence; AI trust; onboarding/readiness; whole-system map and audiences; trust; FAQ; conversion and human contact.

The detailed `/product` route remains the evaluation journey around UNDERSTAND → FIND → FUND → DELIVER → CAPTURE → PROVE → LEARN.

## Content hierarchy

1. Run the whole mission from one place.
2. The organisation is connected even when its software is not.
3. Trusted context entered once becomes useful everywhere.
4. Show concrete outcomes across funding, delivery and reporting.
5. Explain intelligence as grounded assistance, not autonomy.
6. Close with trust, suitability and a human route to early access.

## Component plan

- Retain `MarketingNav`, `Reveal`, `ProductScreens`, `TrustSection`, `FAQ`, `FinalCTA` and `MarketingFooter`.
- Refocus `Hero` around the category and primary outcome.
- Add a homepage narrative component made from reusable editorial chapters, product-detail panels, context map, reporting workspace, intelligence prompt and onboarding readiness panel.
- Keep detailed data-driven demos on `/product` and link into them rather than duplicating every walkthrough.

## Real product visual plan

The hero uses the real Command Centre and funding-board captures. The homepage's smaller interface compositions represent supported product concepts without invented customer results. The deeper page continues to render seeded repository data for funding, relationships and impact. Future captures should be added for applications, programmes, relationship 360, evidence, report builder and onboarding as those surfaces stabilise.

## Responsive strategy

Copy stays first. Desktop product windows crop to meaningful work areas; mobile panels use selected details rather than scaled-down application shells. Context nodes become a two-column list, editorial chapters become single-column, touch targets remain at least 44px, and decorative connections disappear when they stop clarifying the story.

## Accessibility

Use semantic sections, one logical heading sequence, labelled navigation and status text that does not rely on colour. Preserve visible focus, reduced motion, contrast-safe accent text and server-rendered core content. Decorative interface elements are hidden from assistive technology; meaningful mock panels retain text equivalents.

## SEO

The homepage title and description should own the operating-system category while naturally naming charity/NGO software, funding, grant management, programmes, impact and reporting. `/product` remains the substantive lifecycle page. Future domain routes should only ship when they contain genuine, differentiated product content.

## Conversion strategy

High intent uses the contact form as the truthful early-access route. Evaluation uses the open seeded demo and `/product`. Learning uses anchored intelligence, trust and FAQ sections. Pricing is omitted because no verified public pricing exists.

## Implementation slices

1. Foundation, navigation and hero.
2. Fragmentation and organisational context.
3. Outcome-led product chapters and reporting.
4. Intelligence, AI trust and onboarding.
5. Operating-system breadth, audiences, trust and conversion.
6. Responsive, accessibility, SEO, performance and regression polish.

## Capability labels

Finance Intelligence's calculation engine is built but its screen remains in development. Automatic public-source onboarding research, live-claim report rebuilding and external email/calendar/accounting integrations are planned and must be labelled accordingly. No certifications, customer outcomes, logos or testimonials are claimed.

## Reusable existing components

`ProductScreens`, `MissionOSMap`, `FragmentationSection`, `IntelligenceDemo`, `OrganisationIntelligenceDemo`, `FundingIntelligenceDemo`, `FinanceIntelligenceDemo`, `RelationshipDemo`, `ImpactSection`, `ProductExplorer`, `TrustSection`, `FAQ`, `ContactForm`, `MarketingNav`, `MarketingFooter`, `Reveal`, `Section`, `SectionHeader`, `ButtonLink` and the Pegasus wordmark/motif.
