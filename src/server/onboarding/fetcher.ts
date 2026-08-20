import type { FetchedPage, PageFetcher } from "@/lib/organisation-intelligence/types";
import { normaliseUrl } from "@/lib/organisation-intelligence/url";

/**
 * The live implementation of the `PageFetcher` port.
 *
 * Organisation Intelligence Phase 1 shipped the port with fixtures behind it
 * so the suite could stay hermetic. This is what goes behind it in production,
 * and everything it adds is about being a well-behaved guest on someone else's
 * server rather than about extraction:
 *
 * - **robots.txt is obeyed**, fetched once per origin and cached for the run.
 * - **Requests are paced.** A crawl that hammers a small charity's shared
 *   hosting is a denial of service performed on a customer.
 * - **Responses are capped** in size and time, because a 400MB PDF served as
 *   `text/html` should cost us one truncated read, not the process.
 * - **Redirects stay on-site.** Following one off-origin is how a crawler ends
 *   up extracting a hosting company's boilerplate as an organisation's mission.
 *
 * It is deliberately not a general crawler. It reads a handful of pages from
 * one site, once.
 */

export interface FetcherOptions {
  /** Injected for tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
  /** Minimum gap between requests to the same origin. */
  minIntervalMs?: number;
  perRequestTimeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  /** Injected so pacing is instant under test rather than actually sleeping. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_USER_AGENT =
  "PegasusMissionOS/1.0 (+https://mission.pegasus-studio.co/about-our-research)";

/**
 * A deliberately small robots.txt reader.
 *
 * Handles `User-agent`, `Disallow` and `Allow` with the longest-match rule.
 * It does not implement wildcards or `Crawl-delay`, and where it is unsure it
 * treats the path as **disallowed** — the failure that costs us a page is much
 * cheaper than the one that ignores an operator's explicit instruction.
 */
export function parseRobots(text: string, userAgent: string): (path: string) => boolean {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim());

  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      // Consecutive user-agent lines share one group of rules.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow") current.rules.push({ allow: false, path: value });
    if (key === "allow") current.rules.push({ allow: true, path: value });
  }

  const agent = userAgent.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const group = specific ?? wildcard;

  if (!group) return () => true;

  return (path: string) => {
    let decision = true;
    let matched = -1;

    for (const rule of group.rules) {
      // An empty Disallow means "allow everything" and matches nothing.
      if (rule.path === "") continue;
      if (!path.startsWith(rule.path)) continue;
      // Longest match wins; Allow beats Disallow at equal length.
      if (rule.path.length > matched || (rule.path.length === matched && rule.allow)) {
        matched = rule.path.length;
        decision = rule.allow;
      }
    }
    return decision;
  };
}

export class PolitePageFetcher implements PageFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly perRequestTimeoutMs: number;
  private readonly maxBytes: number;
  private readonly userAgent: string;
  private readonly sleep: (ms: number) => Promise<void>;

  /** One robots decision function per origin, resolved once per run. */
  private readonly robots = new Map<string, (path: string) => boolean>();
  private lastRequestAt = 0;

  constructor(options: FetcherOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.perRequestTimeoutMs = options.perRequestTimeoutMs ?? 8000;
    this.maxBytes = options.maxBytes ?? 2_000_000;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private async pace(): Promise<void> {
    const since = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && since < this.minIntervalMs) {
      await this.sleep(this.minIntervalMs - since);
    }
    this.lastRequestAt = Date.now();
  }

  private async allowedByRobots(url: URL): Promise<boolean> {
    const origin = url.origin;
    let decide = this.robots.get(origin);

    if (!decide) {
      try {
        await this.pace();
        const response = await this.fetchImpl(`${origin}/robots.txt`, {
          headers: { "User-Agent": this.userAgent },
          signal: AbortSignal.timeout(this.perRequestTimeoutMs),
          redirect: "follow",
        });
        // No robots.txt means no restrictions. A 5xx does not: a server that
        // is failing has not granted permission, so we stay off it.
        if (response.status === 404 || response.status === 410) {
          decide = () => true;
        } else if (!response.ok) {
          decide = () => false;
        } else {
          decide = parseRobots(await response.text(), this.userAgent);
        }
      } catch {
        // Unreachable robots.txt is treated the same way as a failing one.
        decide = () => false;
      }
      this.robots.set(origin, decide);
    }

    return decide(url.pathname);
  }

  async fetch(rawUrl: string): Promise<FetchedPage | null> {
    const normalised = normaliseUrl(rawUrl);
    if (!normalised) return null;

    let url: URL;
    try {
      url = new URL(normalised);
    } catch {
      return null;
    }

    // Only ever ordinary web traffic. `file:` and `data:` reaching a fetcher
    // that takes a user-supplied address is a server-side request forgery.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    if (!(await this.allowedByRobots(url))) {
      return { url: normalised, status: 999, html: "", retrievedAt: new Date().toISOString() };
    }

    try {
      await this.pace();
      const response = await this.fetchImpl(normalised, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(this.perRequestTimeoutMs),
        redirect: "follow",
      });

      // A redirect that leaves the origin is not this organisation's content.
      const finalUrl = new URL(response.url || normalised);
      if (finalUrl.origin !== url.origin) {
        return { url: normalised, status: 998, html: "", retrievedAt: new Date().toISOString() };
      }

      const contentType = response.headers.get("content-type") ?? undefined;
      const body = await response.text();

      return {
        url: normalised,
        status: response.status,
        html: body.slice(0, this.maxBytes),
        contentType,
        retrievedAt: new Date().toISOString(),
      };
    } catch {
      // Timeouts, DNS failures and resets are all the same to the caller: this
      // page could not be read, and the run continues without it.
      return null;
    }
  }
}

/** Why a fetch returned one of the non-HTTP status codes above. */
export function describeFetchStatus(status: number): string | undefined {
  if (status === 999) return "The site's robots.txt asks automated readers not to read this page.";
  if (status === 998) return "The address redirected to a different site, so it was not read.";
  return undefined;
}
