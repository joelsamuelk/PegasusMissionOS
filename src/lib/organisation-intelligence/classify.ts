import type { PageKind, SourceType } from "./types";
import { looksLikeDocument, normaliseUrl } from "./url";

/**
 * Deterministic page classification from URL path and link/page title.
 *
 * No model is involved: charity websites use a small, remarkably consistent
 * vocabulary for these sections, and rules are cheaper, faster and auditable.
 * Patterns are ordered — the first match wins — so more specific kinds are
 * tested before broader ones.
 */
const PATTERNS: { kind: PageKind; patterns: RegExp[] }[] = [
  {
    kind: "impact",
    patterns: [/\bimpact\b/, /\boutcomes?\b/, /\bdifference\b/, /\bresults\b/, /\bevaluation/],
  },
  {
    kind: "reports",
    patterns: [/\bannual[-\s_]?report/, /\breports?\b/, /\bpublications?\b/, /\bdownloads?\b/],
  },
  {
    kind: "financials",
    patterns: [/\bfinanc/, /\baccounts?\b/, /\bincome\b/, /\bexpenditure\b/],
  },
  {
    kind: "governance",
    patterns: [/\bgovernance\b/, /\btrustees?\b/, /\bboard\b/, /\bconstitution\b/],
  },
  {
    kind: "policies",
    patterns: [
      /\bpolic(y|ies)\b/,
      /\bsafeguard/,
      /\bprivacy\b/,
      /\bcomplaints?\b/,
      /\bequality\b/,
      /\baccessibility\b/,
      /\bwhistleblow/,
    ],
  },
  {
    kind: "programmes",
    patterns: [
      /\bprogramme?s?\b/,
      /\bprojects?\b/,
      /\bservices?\b/,
      /\bwhat[-\s_]we[-\s_]do\b/,
      /\bour[-\s_]work\b/,
    ],
  },
  { kind: "team", patterns: [/\bteam\b/, /\bstaff\b/, /\bpeople\b/, /\bleadership\b/] },
  { kind: "partners", patterns: [/\bpartners?\b/, /\bsupporters?\b/, /\bnetworks?\b/] },
  { kind: "funders", patterns: [/\bfunders?\b/, /\bfunding\b/, /\bdonors?\b/] },
  { kind: "contact", patterns: [/\bcontact\b/, /\bget[-\s_]in[-\s_]touch\b/, /\bfind[-\s_]us\b/] },
  { kind: "careers", patterns: [/\bcareers?\b/, /\bjobs?\b/, /\bvacanc/, /\bwork[-\s_]for[-\s_]us\b/] },
  { kind: "news", patterns: [/\bnews\b/, /\bblog\b/, /\bstories\b/, /\bpress\b/, /\barticles?\b/] },
  { kind: "mission", patterns: [/\bmission\b/, /\bvision\b/, /\bvalues\b/, /\bpurpose\b/] },
  {
    kind: "about",
    patterns: [/\babout\b/, /\bwho[-\s_]we[-\s_]are\b/, /\bour[-\s_]story\b/, /\bhistory\b/],
  },
];

function haystack(url: string, title?: string): string {
  let path = "";
  const normalised = normaliseUrl(url);
  if (normalised) {
    const parsed = new URL(normalised);
    path = decodeURIComponent(parsed.pathname);
  }
  // Separators become spaces so `\b` boundaries behave on slugs.
  return `${path} ${title ?? ""}`.toLowerCase().replace(/[-_/.]+/g, " ");
}

export function classifyPage(url: string, title?: string): PageKind {
  const normalised = normaliseUrl(url);
  if (normalised) {
    const path = new URL(normalised).pathname;
    if (path === "/" || path === "") return "home";
  }

  const text = haystack(url, title);
  for (const { kind, patterns } of PATTERNS) {
    if (patterns.some((p) => p.test(text))) return kind;
  }
  return "unknown";
}

/**
 * Classify a linked document by filename and link text.
 *
 * Deliberately conservative: an unrecognised PDF is `other`, not a guess.
 * Mislabelling a leaflet as audited accounts would give it regulator authority.
 */
export function classifyDocument(url: string, linkText?: string): SourceType {
  if (!looksLikeDocument(url)) return "website";
  const text = haystack(url, linkText);

  if (/\baudited\b|\bstatutory accounts\b|\bfinancial statements\b/.test(text)) return "accounts";
  if (/\bannual report\b|\btrustees.? report\b/.test(text)) return "annual_report";
  if (/\bimpact report\b|\bimpact review\b/.test(text)) return "impact_report";
  if (/\bstrateg/.test(text)) return "strategy";
  if (/\bevaluation\b|\bresearch\b/.test(text)) return "evaluation";
  if (/\bpolic(y|ies)\b|\bsafeguard/.test(text)) return "other";
  if (/\baccounts?\b/.test(text)) return "accounts";
  return "other";
}
