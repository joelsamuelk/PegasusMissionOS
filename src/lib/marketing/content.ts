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
 *
 * **Register.** Short sentences, everyday words, one idea per line. The site
 * is read by fundraisers, trustees and programme staff between other jobs, not
 * by people settling in with an essay. Where a sentence has to be long to stay
 * true — the isolation claim below is the clearest case — it stays long.
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

/**
 * Root-relative rather than bare fragments, because the same nav renders on
 * two routes now. `/#trust` scrolls without a reload when you are already on
 * `/`, and navigates then scrolls when you are on `/product` — a bare
 * `#trust` would silently do nothing on the second page.
 */
export const NAV_LINKS = [
  { label: "Product", href: "/product" },
  { label: "How it works", href: "/#context" },
  { label: "Intelligence", href: "/#intelligence" },
  { label: "Contact", href: "/#contact" },
] as const;

// --- Hero ---------------------------------------------------------------

export const HERO = {
  eyebrow: "The intelligent operating system for mission-driven organisations",
  headline: "Run your whole mission from one place.",
  body: "Funding. Programmes. Finance. Relationships. Evidence. Impact. Reporting. Pegasus brings the work behind your mission together, with intelligence that understands your organisation.",
  refrain: ["One organisation.", "One trusted context.", "Every part connected."],
  note: "No sign-up needed. The demo runs on Northstar Community Foundation, a fictional UK charity, and every record in it is labelled as sample data.",
} as const;

/** The home page's one-line answer to "so what does it actually do?". */
export const WHAT_IT_DOES = {
  eyebrow: "What it does",
  title: "Seven parts of the work. One system underneath.",
  lead: "Most teams run these on separate tools that do not talk to each other. In Pegasus they share one record of your organisation, so a funder you add to your pipeline is the same funder in your grant, your history and your report.",
} as const;

// --- The fragmentation problem (product page) ---------------------------

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
  "Relationships disappear into inboxes.",
  "Finance sits in another system.",
  "Evidence is buried in folders.",
  "Reporting becomes a scramble.",
] as const;

// --- The seven domains ---------------------------------------------------

export interface Domain {
  id: string;
  name: string;
  /** One plain sentence. This is what the home page shows. */
  role: string;
  /** The longer version, shown only on the product page. */
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
    role: "See every opportunity in one pipeline, and know which ones are worth your time.",
    detail:
      "Each opportunity carries its deadline, its award band and its eligibility rules. Pegasus scores the fit factor by factor and shows its working, so your team can disagree with it.",
    surfaces: ["Funding", "Applications", "Grants"],
  },
  {
    id: "finance",
    hint: "Runway · economics · exposure",
    name: "Finance",
    role: "Know your runway, where your money comes from, and what each programme costs.",
    detail:
      "Money is held in whole pence and split exactly, and every figure carries the method behind it. Where the data cannot support a number, Pegasus leaves it blank and says what it would need.",
    surfaces: ["Finance"],
    status: "in_development",
  },
  {
    id: "relationships",
    hint: "People · history · commitments",
    name: "Relationships",
    role: "Keep the full history with every funder, partner and supporter in one place.",
    detail:
      "People, organisations, conversations and promises share one model. A funder's history, their live grant, the report they are waiting for and the thing you promised them all sit on one page. It is assembled from your records, not summarised by a model.",
    surfaces: ["Relationships"],
  },
  {
    id: "programmes",
    hint: "Delivery · outputs · outcomes",
    name: "Programmes",
    role: "Link the work you deliver to the outcomes it exists to create.",
    detail:
      "Activities roll up to outputs, outputs to outcomes, outcomes to indicators with baselines, targets and owners. The grant paying for the work is linked to the work, so nobody has to reconstruct that at reporting time.",
    surfaces: ["Programmes"],
  },
  {
    id: "evidence",
    hint: "Reusable organisational proof",
    name: "Evidence",
    role: "Keep your proof in one library, ready to use again.",
    detail:
      "Evaluations, statistics, testimonials, case studies, policies and accounts, each with a verification state. Evidence used in one application is ready for the next, and it carries its source with it.",
    surfaces: ["Evidence"],
  },
  {
    id: "impact",
    hint: "Indicators · measurement",
    name: "Impact",
    role: "Track outcomes as the work happens, not the week before a deadline.",
    detail:
      "Every measurement records who owns it, where it came from and when it was last updated. How old a number is becomes a visible fact rather than a guess.",
    surfaces: ["Impact"],
  },
  {
    id: "reports",
    hint: "Funder-ready, from records",
    name: "Reports",
    role: "Build funder reports from what is already recorded.",
    detail:
      "Reports draw on the indicators, evidence and programme records you already have. Each draft returns the sources it actually used, and one it was never given is rejected rather than logged as a warning.",
    surfaces: ["Impact reports", "Grant reports"],
  },
] as const;

export const OS_FOUNDATIONS = [
  {
    name: "Mission Graph",
    detail:
      "One shared model of your organisation. A funder, a grant, a programme, an indicator and a piece of evidence are the same records wherever they appear.",
  },
  {
    name: "Trust",
    detail:
      "Sources, verification, permissions and organisation scope sit underneath every part of the product rather than beside them.",
  },
] as const;

// --- Intelligence --------------------------------------------------------

export const INTELLIGENCE = {
  headline: "AI that knows your organisation. And knows when not to guess.",
  body: "Most of what Pegasus knows is calculated, not generated. Fit, grant health, relationship health, evidence strength and every financial figure work out the same way every time, and the working is shown. AI helps around that: researching, drafting, summarising and explaining.",
  /** The question is a real seeded opportunity, not an invented one. */
  question: "Should we apply for the Horizon Youth Opportunity Grant?",
} as const;

export const INTELLIGENCE_SPLIT = [
  {
    kind: "Deterministic",
    label: "Pegasus calculates",
    items: [
      "Eligibility against stated criteria",
      "Fit, factor by factor, with weights",
      "Grant health and delivery progress",
      "Relationship health and its signals",
      "Evidence strength and how current it is",
      "Runway, concentration and funding gaps",
    ],
  },
  {
    kind: "Model",
    label: "AI assists",
    items: [
      "Researching public information about a funder",
      "Drafting an answer from your approved evidence",
      "Summarising a pipeline or a position",
      "Explaining what a calculated result means",
    ],
  },
] as const;

export const INTELLIGENCE_RULES = [
  {
    title: "The model doesn't decide.",
    body: "A fit score is advice, not a verdict. A low score is never a rejection, and every factor names the evidence it used and what still needs a person to confirm.",
  },
  {
    title: "The model doesn't redo the maths.",
    body: "Anything that has to come out the same way twice comes from a tested function, not a generation. A model that recalculates your runway can get it wrong differently each time.",
  },
  {
    title: "The model can't cite what it wasn't given.",
    body: "Every draft returns the sources it actually used. If it cites one it was never shown, the draft is discarded rather than published with a plausible-looking reference.",
  },
] as const;

// --- The mission lifecycle -----------------------------------------------

export interface LifecycleStage {
  name: string;
  outcome: string;
}

export const LIFECYCLE: readonly LifecycleStage[] = [
  {
    name: "Organisation",
    outcome: "Your objects, beneficiaries, regions and governance, recorded once.",
  },
  { name: "Funding need", outcome: "What the work costs, and what is not yet covered." },
  { name: "Opportunity", outcome: "Eligibility checked before anyone writes a word." },
  {
    name: "Application",
    outcome: "Answers drafted from evidence your team already approved.",
  },
  {
    name: "Grant",
    outcome: "Conditions, payments and deliverables tracked against the award.",
  },
  { name: "Finance", outcome: "Spend allocated to the programme it paid for." },
  { name: "Programme", outcome: "Activities and outputs captured as delivery happens." },
  { name: "Evidence", outcome: "Proof filed once, reusable everywhere." },
  { name: "Impact", outcome: "Indicators move with the work, not before the deadline." },
  { name: "Report", outcome: "Built from what is already recorded." },
  { name: "Relationship", outcome: "The funder history that makes the next ask easier." },
  { name: "Next cycle", outcome: "All of it becomes your starting position." },
] as const;

// --- Organisation intelligence -------------------------------------------

export const ORG_RESEARCH_SOURCES = [
  { label: "Website", authority: "Organisation" },
  { label: "Regulator record", authority: "Regulator" },
  { label: "Annual report", authority: "Organisation" },
  { label: "Published accounts", authority: "Regulator" },
  { label: "Impact reports", authority: "Supporting" },
  { label: "Programme information", authority: "Supporting" },
] as const;

// --- Funding intelligence ------------------------------------------------

export const FUNDING_CHAIN = [
  "Funding need",
  "Opportunity",
  "Eligibility",
  "Fit",
  "Evidence readiness",
  "Decision",
] as const;

// --- Finance intelligence ------------------------------------------------

export const FINANCE_REFUSALS = [
  {
    title: "Every figure shows its method.",
    body: "You cannot get a unit cost out of Pegasus without the method that produced it. There is no code path that returns a bare number.",
  },
  {
    title: "Not enough data means no number.",
    body: "Where delivery data is too thin to support a cost per outcome, Pegasus withholds the figure and lists what it would need. It does not publish it with a caveat underneath.",
  },
  {
    title: "A forecast is labelled a forecast.",
    body: "If a figure rests on an assumption, it is a forecast, however exact the arithmetic looks.",
  },
] as const;

// --- Impact and provenance -----------------------------------------------

export const PROVENANCE_CHAIN = [
  "Grant",
  "Programme",
  "Participants",
  "Output",
  "Outcome",
  "Impact report",
] as const;

// --- Trust ---------------------------------------------------------------

export interface TrustPrinciple {
  name: string;
  body: string;
}

/**
 * ISOLATED is quoted verbatim from `MARKETING_SITE_ARCHITECTURE.md` §9.3 and
 * must not be shortened — not even in a pass whose whole purpose is shortening
 * sentences. Row-level security is written into the migrations and has not
 * been verified against a live database, because no Supabase project is
 * provisioned (`PEGASUS_PRODUCTION_BUILD_SPEC.md` §6). Claiming otherwise
 * would be the exact failure the Trust section exists to argue against.
 */
export const TRUST_PRINCIPLES: readonly TrustPrinciple[] = [
  {
    name: "Grounded",
    body: "AI works from your own records. Drafts are built from what your team has entered and approved, not from what a model recalls about charities in general.",
  },
  {
    name: "Traceable",
    body: "Important figures link back to their source. A claim carries the evidence it came from, the page it was read on, who verified it and when.",
  },
  {
    name: "Explainable",
    body: "Scores show their reasoning. Every fit factor shows its weight, why it scored that way, the evidence it used and what it assumed.",
  },
  {
    name: "Human-controlled",
    body: "AI drafts. People decide. Every generation is a draft to accept, edit or throw away, and nothing is sent anywhere on a model's say-so.",
  },
  {
    name: "Isolated",
    body: "Pegasus is architected for tenant-scoped organisational data. Every read and write is scoped to one organisation at the repository boundary, proven by a two-tenant test suite and a build-failing boundary check. Database-level row-level security is written into the migrations but has not yet been verified against a live database.",
  },
] as const;

// --- Personas ------------------------------------------------------------

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
    promise: "Know what needs your attention.",
    body: "One view instead of five logins: what is closing, what is at risk, what is owed and to whom. Every figure comes with its source, so a board question does not turn into a week of digging.",
    looksLike: [
      "Pipeline value and live opportunities",
      "Grants at risk and reports due",
      "Relationships that have gone quiet",
      "Where your evidence is thin",
    ],
  },
  {
    id: "fundraising",
    role: "Fundraising",
    promise: "Find better-fit funding. Write stronger applications.",
    body: "Eligibility is checked before you spend a day on it. Fit is explained factor by factor. Drafts start from evidence your organisation has already approved, so you begin from your track record instead of a blank page.",
    looksLike: [
      "Fit scores you can actually argue with",
      "Deadlines that surface before they hurt",
      "Answers drafted from approved evidence",
      "Every draft showing what it used",
    ],
  },
  {
    id: "programme",
    role: "Programme delivery",
    promise: "Run delivery and capture the evidence as you go.",
    body: "Activities, outputs and outcomes live where the work does. Indicators move during delivery, which is the only time recording them is cheap. The grant funding the work is already linked to it.",
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
    promise: "Understand the money across grants and programmes.",
    body: "Restricted and unrestricted funding, grant use, programme costs and funder concentration, all calculated from allocations that kept their working, and withheld where the data cannot support them.",
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
    promise: "Turn measurement into something the whole team can reuse.",
    body: "A measurement recorded once is available to every application, report and board pack that needs it. It carries its source, its period and its verification state, instead of being retyped and slowly drifting.",
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
    body: "You can see where a figure came from without asking the team to go and find out. Approval is a deliberate act on a draft that shows its sources, its assumptions and what could not be verified.",
    looksLike: [
      "Answers awaiting review, with their sources",
      "Assumptions stated rather than buried",
      "What Pegasus could not establish",
      "A record of who approved what",
    ],
  },
] as const;

// --- Photography ---------------------------------------------------------

export interface SitePhoto {
  /** Path under `public/`, e.g. `/photos/delivery-team.jpg`. */
  src: string;
  /** What is in the frame, for a reader who cannot see it. Never the caption. */
  alt: string;
  /** Shown under the image. Say who and where, not how it feels. */
  caption: string;
  width: number;
  height: number;
}

/**
 * Photographs for the "Who it's for" band.
 *
 * Empty on purpose, and the band renders nothing while it stays empty. The
 * site argues that Pegasus does not fabricate things, so it cannot itself run
 * stock photography of models captioned as if they were the organisations who
 * use it. That is the same failure as an invented testimonial, in a form the
 * FAQ's own answer about social proof would not survive.
 *
 * To turn the band on, drop the files in `public/photos/` and add an entry
 * each. Three reads best; two and four both work. Landscape, at least
 * 1200x900, and photographed at real delivery rather than posed at a desk.
 * Everyone identifiable in a frame needs to have agreed to appear on a public
 * website, which is a consent question rather than a licensing one and is why
 * this list is yours to fill rather than mine.
 */
export const PHOTOS: readonly SitePhoto[] = [];

// --- Product principles --------------------------------------------------

export interface Principle {
  name: string;
  body: string;
  status?: ProductStatus;
}

export const PRINCIPLES: readonly Principle[] = [
  {
    name: "Fit you can argue with",
    body: "Eight weighted factors, each with a reason, the evidence it used and what it assumed. No score without an explanation.",
  },
  {
    name: "Figures that name their source",
    body: "A figure carries the evidence item it came from, where in it, the period it covers and whether it has been verified.",
  },
  {
    name: "Approval by a named person",
    body: "Every AI output is a draft. Approving it is an explicit act by someone, and it is recorded.",
  },
  {
    name: "Financial maths that refuses to guess",
    body: "Whole-pence money, exact splitting, a method on every figure, and a blank where the data will not carry one.",
    // The calculation engine is built and tested; the screen is not.
    status: "in_development",
  },
  {
    name: "AI that only sees your records",
    body: "Context is built from your own organisation's data, and a draft that cites something it was not given is rejected.",
  },
  {
    name: "Permissions checked on every action",
    body: "Every action that changes data is gated, and a build-failing check stops a new one shipping without a gate.",
  },
] as const;

// --- FAQ -----------------------------------------------------------------

export const FAQS = [
  {
    q: "How is this different from a grant tool?",
    a: "A grant tool manages applications. Pegasus holds one model of your whole organisation that funding, finance, programmes, relationships, evidence, impact and reporting all read from and write to. A funder is the same record in your pipeline, your grant, your history and your report, so something entered once is useful everywhere.",
  },
  {
    q: "Does AI make decisions for us?",
    a: "No. Fit, grant health, relationship health, evidence strength and every financial figure are calculations, not model output. The same inputs always give the same answer, and the working is shown. AI researches, drafts, summarises and explains around that, and every generation is a draft for a person to accept, edit or discard.",
  },
  {
    q: "Where does Pegasus get information about us?",
    a: "From your own records: your organisation profile, programmes, grants, indicators and the evidence your team has added and approved. Researching your website, regulator record and accounts automatically at sign-up is designed but not built yet, and the site marks it as coming rather than showing it working.",
  },
  {
    q: "Can we see where a figure came from?",
    a: "Yes. Every claim records its value, whether it has been verified, the evidence it came from, where in that source, the period it covers and where it has been used. Claims never change: a correction replaces the original rather than overwriting it, so a report published in March still shows the figure as it stood in March.",
  },
  {
    q: "Do we have to replace our existing tools?",
    a: "No, and most teams should not try to at once. Teams usually start with the funding pipeline, because that is where deadlines hurt most, then add applications, delivery and reporting. Email, calendar, accounting and banking integrations are designed but not built, so Pegasus sits alongside those systems today.",
  },
  {
    q: "Can we try it first?",
    a: "Yes. The demo is open with no sign-up. It runs on Northstar Community Foundation, a fictional UK charity, and every record in it is labelled as sample data. It is the real application over a seeded workspace, not a click-through prototype.",
  },
  {
    q: "How is our data handled?",
    a: "Every read and write is scoped to a single organisation at the repository boundary, proven by a two-tenant test suite and by a check that fails the build if any part of the application reaches around it. Database-level row-level security is written into the migrations and has not yet been verified against a live database. Beneficiary data is never written to logs, and the AI provider is configurable, including an offline mode with no model call at all.",
  },
  {
    q: "Is Pegasus only for UK charities?",
    a: "No. Organisation types, regulators, currencies and funding structures are data rather than assumptions. The demo is a UK charity because that is the sector we know best and what the seeded data represents.",
  },
  {
    q: "What works today, and what doesn't?",
    a: "Funding, applications, grants, programmes, impact, evidence and relationships work in the demo, along with fit scoring and the sourcing behind every figure. Finance Intelligence has a built and tested calculation engine but no screen yet. Automatic research at sign-up, reports rebuilt from live claims, and email, calendar and accounting integrations are designed and not yet built. The site labels each of these where it shows them.",
  },
] as const;

// --- Final CTA -----------------------------------------------------------

export const FINAL_CTA = {
  headline:
    "Spend less time running the organisation. More time moving the mission forward.",
  body: "Bring funding, programmes, finance, relationships, evidence, impact and reporting into one intelligent operating system built for mission-driven work.",
} as const;

// --- Footer --------------------------------------------------------------

export const FOOTER_PRODUCT = [
  { label: "How it works", href: "/product" },
  { label: "Intelligence", href: "/#intelligence" },
  { label: "Contact", href: "/#contact" },
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
