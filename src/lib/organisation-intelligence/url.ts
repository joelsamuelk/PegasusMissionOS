/**
 * URL normalisation.
 *
 * Source deduplication is only as good as this: `https://Example.org/About/`,
 * `http://www.example.org/about`, and `https://example.org/about?utm_source=x#top`
 * are one page, and must collapse to one `ResearchSource`.
 */

/** Query parameters that never change what a page says. */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

/**
 * Normalise a URL for comparison and storage.
 *
 * Returns null when the input is not an http(s) URL — mailto:, tel:,
 * javascript: and malformed values are rejected rather than half-parsed.
 */
export function normaliseUrl(input: string, base?: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    // Bare hosts like "example.org" are common in user input.
    if (!base && /^[\w-]+(\.[\w-]+)+/.test(raw)) {
      try {
        url = new URL(`https://${raw}`);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";

  // Drop default ports and tracking noise.
  if (url.port === "80" || url.port === "443") url.port = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  // Collapse a trailing slash, but keep the root path as "/".
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

/** The registrable-ish host, used to decide whether a link is on-site. */
export function domainOf(input: string): string | null {
  const normalised = normaliseUrl(input);
  if (!normalised) return null;
  return new URL(normalised).hostname;
}

/**
 * Same-site test.
 *
 * Subdomains of the organisation's domain count as the organisation's own site
 * (`impact.example.org` belongs to `example.org`), because charities routinely
 * split reports onto a subdomain.
 */
export function isSameSite(candidate: string, siteUrl: string): boolean {
  const a = domainOf(candidate);
  const b = domainOf(siteUrl);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** Deduplication key for a source. */
export function sourceKey(url: string): string | null {
  return normaliseUrl(url);
}

/** True when the URL points at a document rather than a web page. */
export function looksLikeDocument(url: string): boolean {
  const normalised = normaliseUrl(url);
  if (!normalised) return false;
  return /\.(pdf|docx?|xlsx?|pptx?|csv)(\?|$)/i.test(new URL(normalised).pathname);
}
