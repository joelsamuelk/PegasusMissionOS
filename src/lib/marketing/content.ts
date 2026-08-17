/**
 * Marketing site copy, as data.
 *
 * Everything the public site says about the product lives here rather than
 * inside components, for two reasons. The first is ordinary: sections are
 * data-driven, so layout and wording change independently. The second matters
 * more — every capability claim on the site is checked against the register in
 * `docs/MARKETING_SITE_ARCHITECTURE.md` §9.2 before it ships, and that review
 * is only practical when the claims sit in one file instead of scattered
 * through twenty JSX trees.
 *
 * Product *figures* are deliberately NOT here. They are read from the seeded
 * workspace through `MissionRepository` in `preview.ts`, so no number on the
 * marketing site can drift away from the product or be invented.
 */

/**
 * The three permitted honesty labels (§9.4). Three, not a spectrum: a longer
 * vocabulary invites hedging every sentence, which reads as a product that is
 * not finished rather than one that is precise about what it has shipped.
 */
export type ProductStatus = "demo" | "in_development" | "planned";

export const STATUS_LABEL: Record<ProductStatus, string> = {
  demo: "Available in demo",
  in_development: "In development",
  planned: "Coming to Pegasus",
};

// --- Navigation ---------------------------------------------------------

export const NAV_LINKS = [
  { label: "Product", href: "#operating-system" },
  { label: "How it works", href: "#lifecycle" },
  { label: "Intelligence", href: "#intelligence" },
  { label: "Trust", href: "#trust" },
  { label: "Who it's for", href: "#personas" },
] as const;

// --- Hero ---------------------------------------------------------------

export const HERO = {
  eyebrow: "For charities, NGOs, foundations and social enterprises",
  headline: "Every mission deserves world-class technology.",
  body: "Pegasus Mission OS connects your funding, programmes, finances, relationships, evidence and reporting in one intelligent operating system, so your team spends less time managing administration and more time advancing the mission.",
  refrain: ["One organisation.", "One source of truth.", "One intelligence layer."],
  note: "No sign-up required. The demo workspace runs on Northstar Community Foundation, a fictional UK charity, with every record clearly labelled as sample data.",
} as const;

// --- Section 3: fragmentation ------------------------------------------

/**
 * Categories, never brands. Naming a competitor's product would be both
 * legally careless and beside the point: the argument is about the shape of
 * the problem, not about which spreadsheet you happen to use.
 */
export const FRAGMENTS = [
  { label: "Funding spreadsheet", detail: "Tabs per funder, one owner" },
  { label: "Documents", detail: "Last year's answers, somewhere" },
  { label: "Email", detail: "The funder conversation" },
  { label: "CRM", detail: "Contacts, no context" },
  { label: "Finance", detail: "A different system entirely" },
  { label: "Survey data", detail: "Exports nobody reopens" },
  { label: "Shared drive", detail: "Evidence, by folder" },
  { label: "Impact reports", detail: "Rebuilt from memory" },
] as const;

export const FRAGMENTATION_LINES = [
  "Funding lives in spreadsheets.",
  "Applications live in documents.",
  "Relationships disappear into inboxes and CRMs.",
  "Finance lives somewhere else.",
  "Evidence gets buried in folders.",
  "Reporting becomes a deadline exercise.",
] as const;

// --- Section 4: the operating system ------------------------------------

export interface Domain {
  id: string;
  name: string;
  role: string;
  detail: string;
  /**
   * Two or three words for the map tile. Distinct from `name` on purpose: an
   * earlier version printed `surfaces` under the tile, which for most domains
   * repeated the domain's own name back at the reader and looked like a bug.
   */
  hint: string;
  /** What the product surface is called, so the map matches the left rail. */
  surfaces: readonly string[];
  status?: ProductStatus;
}

export const DOMAINS: readonly Domain[] = [
  {
    id: "funding",
    hint: "Pipeline · applications · grants",
    name: "Funding",
    role: "Find opportunities, understand eligibility and decide what is worth pursuing.",
    detail:
      "Every opportunity sits in one pipeline with its deadline, its award band and its explicit eligibility criteria. Fit is assessed factor by factor against your objects, beneficiaries, regions and evidence — and the reasoning is shown, so your team can disagree with it.",
    surfaces: ["Funding", "Applications", "Grants"],
  },
  {
    id: "finance",
    hint: "Runway · economics · exposure",
    name: "Finance",
    role: "Understand runway, funding concentration, programme economics and grant exposure.",
    detail:
      "Money is held as integers, split by largest remainder, and every derived figure carries the method that produced it. Where the data cannot support a number, Pegasus withholds it and says what it would need — a blank with a reason, not a confident guess.",
    surfaces: ["Finance"],
    status: "in_development",
  },
  {
    id: "relationships",
    hint: "People · history · commitments",
    name: "Relationships",
    role: "Know your funders, partners and stakeholders and what needs to happen next.",
    detail:
      "People, organisations, interactions and commitments share one model, so a funder's four-year history, their live grant, the report they are waiting for and the thing you promised them appear on one page — assembled from your records, not summarised by a model.",
    surfaces: ["Relationships"],
  },
  {
    id: "programmes",
    hint: "Delivery · outputs · outcomes",
    name: "Programmes",
    role: "Connect delivery, activities and outputs to the outcomes they exist to create.",
    detail:
      "Activities roll up to outputs, outputs to outcomes, outcomes to indicators with baselines, targets and owners. The grant funding the work is linked to the work, so nobody has to reconstruct that relationship at reporting time.",
    surfaces: ["Programmes"],
  },
  {
    id: "evidence",
    hint: "Reusable organisational proof",
    name: "Evidence",
    role: "Keep organisational proof reusable, attributable and current.",
    detail:
      "Evaluations, statistics, testimonials, case studies, policies and accounts live in one library with a verification state on each. Evidence used once in an application is available for the next one, and it carries its provenance with it.",
    surfaces: ["Evidence"],
  },
  {
    id: "impact",
    hint: "Indicators · measurement",
    name: "Impact",
    role: "Track outcomes through indicators, measurements and evidence.",
    detail:
      "Indicators move as delivery happens rather than in the fortnight before a deadline. Each measurement records who owns it, where it came from and when it was last updated, so its age is a visible fact rather than an assumption.",
    surfaces: ["Impact"],
  },
  {
    id: "reports",
    hint: "Funder-ready, from records",
    name: "Reports",
    role: "Build reporting from live organisational knowledge rather than memory.",
    detail:
      "Reports draw on the indicators, evidence and programme records that already exist. Drafts return the references they actually drew on, and a reference that was never offered is rejected rather than logged as a warning.",
    surfaces: ["Impact reports", "Grant reports"],
  },
] as const;

export const OS_FOUNDATIONS = [
  {
    name: "Mission Graph",
    detail:
      "One shared organisational model. A funder, a grant, a programme, an indicator and a piece of evidence are the same records everywhere they appear.",
  },
  {
    name: "Trust",
    detail:
      "Provenance, verification state, permissions and tenant scope sit underneath every domain rather than beside them.",
  },
] as const;

// --- Section 5: intelligence -------------------------------------------

export const INTELLIGENCE = {
  headline: "AI that understands your organisation. And knows when not to guess.",
  body: "Most of what Pegasus knows is computed, not generated. Fit, grant health, relationship health, evidence strength and every financial figure are deterministic: the same inputs give the same answer, and the working is shown. AI operates around that — researching, drafting, summarising and explaining — over facts that were assembled for it.",
  /** The question is a real seeded opportunity, not an invented one. */
  question: "Should we apply for the Horizon Youth Opportunity Grant?",
} as const;

export const INTELLIGENCE_SPLIT = [
  {
    kind: "Deterministic",
    label: "Pegasus computes",
    items: [
      "Eligibility against stated criteria",
      "Fit, factor by factor, with weights",
      "Grant health and delivery progress",
      "Relationship health and its signals",
      "Evidence strength and currency",
      "Runway, concentration and funding gaps",
    ],
  },
  {
    kind: "Model",
    label: "AI assists",
    items: [
      "Researching public information about an opportunity",
      "Drafting an answer from your approved evidence",
      "Summarising a pipeline or a position",
      "Explaining what a deterministic result means",
    ],
  },
] as const;

export const INTELLIGENCE_RULES = [
  {
    title: "The model doesn't make the decision.",
    body: "A fit assessment is decision support. A low score is never a rejection, and every factor names the evidence it used and the assumptions that still need a person to confirm them.",
  },
  {
    title: "The model doesn't recompute what Pegasus already knows.",
    body: "Where repeatability matters, the answer comes from a tested function rather than a generation. A model that re-derives a runway is a model that can get it wrong differently each time.",
  },
  {
    title: "The model can't cite what it wasn't given.",
    body: "Generations return the references they actually drew on. A reference that was never offered fails validation and the output is discarded rather than published with a plausible-looking source.",
  },
] as const;

// --- Section 6: the mission lifecycle -----------------------------------

export interface LifecycleStage {
  name: string;
  outcome: string;
}

export const LIFECYCLE: readonly LifecycleStage[] = [
  { name: "Organisation", outcome: "Objects, beneficiaries, regions and governance recorded once." },
  { name: "Funding need", outcome: "What the work actually costs, and what is not yet covered." },
  { name: "Opportunity", outcome: "Eligibility checked before anyone writes a word." },
  { name: "Application", outcome: "Answers drafted from evidence your team already approved." },
  { name: "Grant", outcome: "Conditions, payments and deliverables tracked against the award." },
  { name: "Finance", outcome: "Spend allocated to the programme it paid for." },
  { name: "Programme", outcome: "Activities and outputs captured as delivery happens." },
  { name: "Evidence", outcome: "Proof filed once, reusable everywhere." },
  { name: "Impact", outcome: "Indicators move with the work, not before the deadline." },
  { name: "Report", outcome: "Built from what is already recorded." },
  { name: "Relationship", outcome: "The funder history that makes the next ask easier." },
  { name: "Next cycle", outcome: "Everything above becomes the starting position." },
] as const;

// --- Section 7: organisation intelligence -------------------------------

export const ORG_RESEARCH_SOURCES = [
  { label: "Website", authority: "Organisation" },
  { label: "Regulator record", authority: "Regulator" },
  { label: "Annual report", authority: "Organisation" },
  { label: "Published accounts", authority: "Regulator" },
  { label: "Impact reports", authority: "Supporting" },
  { label: "Programme information", authority: "Supporting" },
] as const;

// --- Section 8: funding intelligence ------------------------------------

export const FUNDING_CHAIN = [
  "Funding need",
  "Opportunity",
  "Eligibility",
  "Fit",
  "Evidence readiness",
  "Decision",
] as const;

// --- Section 9: finance intelligence ------------------------------------

export const FINANCE_REFUSALS = [
  {
    title: "Methodology travels with the figure.",
    body: "A unit cost cannot be constructed without the method that produced it. There is no code path in Pegasus that yields a bare number.",
  },
  {
    title: "Insufficient data is a refusal, not a grade.",
    body: "Where delivery data is too thin to support a cost per outcome, Pegasus withholds the figure and lists what it would need. It does not publish it with a caveat underneath.",
  },
  {
    title: "A calculation resting on a forecast is not a calculation.",
    body: "Certainty is inherited. A figure that stands on an assumption is labelled a forecast, however exact its arithmetic looks.",
  },
] as const;

// --- Section 11: impact and provenance ----------------------------------

export const PROVENANCE_CHAIN = [
  "Grant",
  "Programme",
  "Participants",
  "Output",
  "Outcome",
  "Impact report",
] as const;

// --- Section 12: trust ---------------------------------------------------

export interface TrustPrinciple {
  name: string;
  body: string;
}

/**
 * ISOLATED is quoted verbatim from `MARKETING_SITE_ARCHITECTURE.md` §9.3 and
 * must not be shortened. Row-level security is written into the migrations and
 * has not been verified against a live database, because no Supabase project
 * is provisioned (`PEGASUS_PRODUCTION_BUILD_SPEC.md` §6). Claiming otherwise
 * would be the exact failure the Trust section exists to argue against.
 */
export const TRUST_PRINCIPLES: readonly TrustPrinciple[] = [
  {
    name: "Grounded",
    body: "AI works from authorised organisational context. Generations are assembled from records your team has entered and approved, not from what a model recalls about charities in general.",
  },
  {
    name: "Traceable",
    body: "Important facts and figures connect to their sources. A claim carries the evidence it came from, the page it was read on, who verified it and when — and confidence never promotes something to verified.",
  },
  {
    name: "Explainable",
    body: "Scores and recommendations expose their reasoning. Every fit factor shows its weight, its rationale, the evidence it used and the assumptions it made.",
  },
  {
    name: "Human-controlled",
    body: "AI drafts and recommends. People remain responsible for consequential actions: every generation is a draft to accept, edit or throw away, and nothing is sent anywhere on a model's say-so.",
  },
  {
    name: "Isolated",
    body: "Pegasus is architected for tenant-scoped organisational data. Every read and write is scoped to one organisation at the repository boundary, proven by a two-tenant test suite and a build-failing boundary check. Database-level row-level security is written into the migrations but has not yet been verified against a live database.",
  },
] as const;

// --- Section 13: personas ------------------------------------------------

export interface Persona {
  id: string;
  role: string;
  promise: string;
  body: string;
  looksLike: readonly string[];
}

export const PERSONAS: readonly Persona[] = [
  {
    id: "executive",
    role: "Executive / CEO",
    promise: "Know what needs attention across the organisation.",
    body: "One position rather than five system logins: what is closing, what is at risk, what is owed and to whom. The figures come with their sources, so a board question does not become a week of reconstruction.",
    looksLike: [
      "Pipeline value and live opportunities",
      "Grants at risk and reports due",
      "Relationships that have gone quiet",
      "Where the organisation's evidence is thin",
    ],
  },
  {
    id: "fundraising",
    role: "Fundraising",
    promise: "Find better-fit funding and build stronger applications.",
    body: "Eligibility is checked before effort is spent. Fit is explained factor by factor. Drafts start from the evidence your organisation has already approved, so the writing begins from your track record rather than a blank page.",
    looksLike: [
      "Explainable fit with weighted factors",
      "Deadlines that surface before they hurt",
      "Answers drafted from approved evidence",
      "Every draft showing what it drew on",
    ],
  },
  {
    id: "programme",
    role: "Programme delivery",
    promise: "Run delivery while capturing the evidence as it happens.",
    body: "Activities, outputs and outcomes live where the work does. Indicators move during delivery, which is the only time capturing them is cheap — and the grant funding the work is already linked to it.",
    looksLike: [
      "Activities, outputs and outcomes in one place",
      "Indicators with owners and update history",
      "Deliverables tracked against the award",
      "Delivery partners and programme risks",
    ],
  },
  {
    id: "finance",
    role: "Finance",
    promise: "Understand money across grants and programmes.",
    body: "Restricted and unrestricted funding, grant utilisation, programme economics and funding concentration computed from allocations that kept their working — with figures withheld where the underlying data cannot support them.",
    looksLike: [
      "Unrestricted runway and funding cliffs",
      "Concentration by funder",
      "Cost per participant, with its method",
      "Projected gaps by financial year",
    ],
  },
  {
    id: "impact",
    role: "Impact / MEL",
    promise: "Turn measurement into reusable organisational knowledge.",
    body: "A measurement recorded once becomes available to every application, report and board pack that needs it — carrying its source, its period and its verification state rather than being retyped and slowly diverging.",
    looksLike: [
      "Outcomes, indicators and measurement frequency",
      "Evidence library with verification states",
      "Figures traceable to their source document",
      "Reusable proof across applications and reports",
    ],
  },
  {
    id: "trustee",
    role: "Trustee / Board",
    promise: "Review, question and approve with confidence.",
    body: "A trustee can see where a figure came from without asking the team to go and find out. Approval is a deliberate act on a draft that shows its sources, its assumptions and what could not be verified.",
    looksLike: [
      "Answers awaiting review, with provenance",
      "Assumptions stated rather than buried",
      "What Pegasus could not establish",
      "An audit trail of who approved what",
    ],
  },
] as const;

// --- Section 14: product principles --------------------------------------

export interface Principle {
  name: string;
  body: string;
  status?: ProductStatus;
}

export const PRINCIPLES: readonly Principle[] = [
  {
    name: "Explainable funding assessment",
    body: "Eight weighted factors, each with a rationale, the evidence it used and the assumptions it made. No opaque score.",
  },
  {
    name: "Source-level provenance",
    body: "A figure carries its evidence item, the locator within it, its period and its verification state.",
  },
  {
    name: "Human approval by design",
    body: "Every AI output is a draft. Approval is an explicit act by a named person, and it is recorded.",
  },
  {
    name: "Deterministic financial intelligence",
    body: "Integer money, exact splitting, mandatory methodology, and refusals where the data will not carry a figure.",
    status: "in_development",
  },
  {
    name: "Organisation-aware AI",
    body: "Context is assembled from your organisation's own records, and a generation that cites something it was not given is rejected.",
  },
  {
    name: "Permission-aware context",
    body: "Capabilities are enforced on every mutating action, and a build-failing check stops a new action shipping without a gate.",
  },
] as const;

// --- Section 16: FAQ -----------------------------------------------------

export const FAQS = [
  {
    q: "What makes Pegasus an operating system rather than another grant tool?",
    a: "A grant tool manages applications. Pegasus holds one organisational model that funding, finance, programmes, relationships, evidence, impact and reporting all read from and write to. A funder is the same record in your pipeline, your grant, your relationship history and your report. Information entered once becomes useful everywhere, which is a property of the model rather than of an integration between modules.",
  },
  {
    q: "Does AI make decisions for us?",
    a: "No. Fit assessments, grant health, relationship health, evidence strength and every financial figure are deterministic calculations, not model output — the same inputs always give the same answer, and the working is shown. AI researches, drafts, summarises and explains around those systems. Every generation is a draft for a person to accept, edit or discard.",
  },
  {
    q: "Where does Pegasus get organisational information?",
    a: "From your own records: the organisation profile, programmes, grants, indicators and the evidence library your team has added and approved. Automatic research of your website, regulator record and published accounts at onboarding is designed and specified, and is not yet available — it is marked as coming on the site rather than shown as working.",
  },
  {
    q: "Can we see where a figure came from?",
    a: "Yes. A claim in Pegasus records its value, its verification state, the evidence item it came from, the locator within that source, the period it covers and where it has been used. Claims are immutable: a correction supersedes the original rather than editing it, so a report published in March still shows the figure as it stood in March, alongside its successor.",
  },
  {
    q: "Do we need to replace our existing tools?",
    a: "No, and most teams should not try to at once. Teams usually start with the funding pipeline, because that is where deadlines hurt most, then bring in applications, delivery and reporting as the habit establishes. Email, calendar, accounting and banking integrations are designed but not built, so today Pegasus sits alongside those systems rather than replacing them.",
  },
  {
    q: "Can we try it before committing?",
    a: "Yes. The demo workspace is open with no sign-up. It runs on Northstar Community Foundation, a fictional UK charity, and every record in it is labelled as sample data. It is the real application over a seeded workspace rather than a click-through prototype.",
  },
  {
    q: "How does Pegasus handle our data?",
    a: "Every read and write is scoped to a single organisation at the repository boundary, which is proven by a two-tenant test suite and by a check that fails the build if any part of the application reaches around it. Database-level row-level security is written into the migrations and has not yet been verified against a live database. Beneficiary data is never written to logs, and the AI provider is configurable — including a deterministic offline mode with no model call at all.",
  },
  {
    q: "Is Pegasus only for UK charities?",
    a: "The model is not UK-specific: organisation types, regulators, currencies and funding structures are data rather than assumptions. The demo is a UK charity because that is the sector we know best and the one the seeded data represents, and UK charity structures are what the current fixtures exercise most thoroughly.",
  },
  {
    q: "What parts of Pegasus are available today?",
    a: "Funding, applications, grants, programmes, impact, evidence and relationships are working in the demo, along with explainable fit, provenance and the claims model behind it. Finance Intelligence has a built and tested calculation engine but no product surface yet. Organisation research at onboarding, reports rebuilt from live claims, and email, calendar and accounting integrations are designed and not yet built. The site labels each of these where it shows them.",
  },
] as const;

// --- Section 18: final CTA ----------------------------------------------

export const FINAL_CTA = {
  headline: "Give your mission the operating system it deserves.",
  body: "Bring your funding, programmes, finances, relationships, evidence and impact together, and give your team intelligence that actually understands the organisation behind the work.",
} as const;

// --- Footer --------------------------------------------------------------

export const FOOTER_PRODUCT = [
  { label: "How it works", href: "#lifecycle" },
  { label: "Intelligence", href: "#intelligence" },
  { label: "Trust", href: "#trust" },
  { label: "Demo", href: "/dashboard" },
] as const;

/**
 * These resolve to a single `/legal` page with three anchored sections rather
 * than to three separate documents. Publishing a full privacy notice and terms
 * of service before general availability would mean drafting commitments for a
 * service nobody can yet buy; the page states the current position plainly
 * instead, which is the honest version of the same link.
 */
export const FOOTER_LEGAL = [
  { label: "Privacy", href: "/legal#privacy" },
  { label: "Terms", href: "/legal#terms" },
  { label: "Cookies", href: "/legal#cookies" },
] as const;
