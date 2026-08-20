/**
 * The application's left-rail labels, for the marketing product previews.
 *
 * Deliberately a literal list rather than a map over `NAV_ITEMS`. That module
 * carries a `lucide-react` icon component per entry, and the product explorer
 * is a client island: importing it to read eleven strings would ship eleven
 * icon modules to every visitor for a decorative rail they cannot click.
 *
 * The cost of the copy is drift, so `tests/unit/marketing-content.test.ts`
 * asserts this list matches `NAV_ITEMS` exactly. A rail that shows a menu the
 * product does not have is a small lie, and this site does not get to tell
 * small lies about the product.
 */
export const NAV_LABELS = [
  "Command Centre",
  "Intelligence",
  "Relationships",
  "Supporters",
  "Funding",
  "Applications",
  "Grants",
  "Finance",
  "Programmes",
  "Impact",
  "Evidence",
  "Forms",
  "Automations",
  "Portals",
  "Integrations",
  "Organisation",
  "Team",
  "Trust Centre",
  "Settings",
] as const;
