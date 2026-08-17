import type { PageKind, SourceAuthority, SourceType } from "./types";

/**
 * Source authority.
 *
 * Ordinal, so reconciliation can prefer a regulator record over a marketing
 * page without pretending the difference is a fine-grained score.
 */
const RANK: Record<SourceAuthority, number> = {
  regulator: 4,
  organisation: 3,
  supporting: 2,
  discovery: 1,
};

export function authorityRank(authority: SourceAuthority): number {
  return RANK[authority];
}

/** Descending authority: highest first. */
export function compareAuthority(a: SourceAuthority, b: SourceAuthority): number {
  return RANK[b] - RANK[a];
}

export function isAtLeast(authority: SourceAuthority, floor: SourceAuthority): boolean {
  return RANK[authority] >= RANK[floor];
}

const AUTHORITY_BY_TYPE: Record<SourceType, SourceAuthority> = {
  regulator: "regulator",
  government: "regulator",
  accounts: "regulator",
  annual_report: "organisation",
  impact_report: "organisation",
  strategy: "organisation",
  website: "organisation",
  evaluation: "supporting",
  research: "supporting",
  funder: "supporting",
  partner: "supporting",
  news: "discovery",
  other: "discovery",
};

/**
 * Authority for a source.
 *
 * A document only carries organisation authority when it is published on the
 * organisation's own site. The same PDF mirrored on a third-party directory is
 * supporting evidence at best, because we cannot show the organisation stands
 * behind that copy.
 */
export function authorityFor(type: SourceType, onOwnDomain: boolean): SourceAuthority {
  const base = AUTHORITY_BY_TYPE[type];
  if (base === "regulator") return base;
  if (!onOwnDomain && base === "organisation") return "supporting";
  return base;
}

/** How much a page kind is worth extracting from, used to order the crawl. */
const PAGE_PRIORITY: Record<PageKind, number> = {
  about: 10,
  mission: 10,
  impact: 9,
  programmes: 9,
  governance: 8,
  reports: 8,
  financials: 8,
  home: 7,
  policies: 6,
  team: 5,
  funders: 5,
  partners: 4,
  contact: 4,
  careers: 2,
  news: 2,
  unknown: 1,
};

export function pagePriority(kind: PageKind): number {
  return PAGE_PRIORITY[kind];
}
