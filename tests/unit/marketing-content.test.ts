import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/components/navigation/nav-items";
import { NAV_LABELS } from "@/lib/marketing/rail";
import {
  DOMAINS,
  FAQS,
  FOOTER_PRODUCT,
  NAV_LINKS,
  PERSONAS,
  STATUS_LABEL,
  TRUST_PRINCIPLES,
} from "@/lib/marketing/content";

/**
 * Guards for the public marketing site.
 *
 * Marketing copy is the one part of this repository where a wrong sentence
 * costs more than a wrong function: a visitor cannot run the tests, so the
 * only thing standing between them and a false claim is whether someone
 * checked. These assertions turn the checkable parts of
 * `docs/MARKETING_SITE_ARCHITECTURE.md` §9 into build failures.
 */
describe("marketing content", () => {
  it("the preview rail matches the product's real navigation", () => {
    // The rail is copied rather than imported so the product explorer does not
    // ship eleven lucide icon modules for a decorative list. This is the cost
    // of that copy, paid here instead of by a visitor seeing a menu item the
    // product does not have.
    expect([...NAV_LABELS]).toEqual(NAV_ITEMS.map((item) => item.label));
  });

  /**
   * A nav pointing at an anchor nobody renders scrolls the visitor nowhere and
   * looks like a broken site. Since the site split into `/` and `/product`
   * there are two ways to break a link, so both are checked: the fragment must
   * be rendered by something, and the path must be a route that exists.
   *
   * The sections live in their own components rather than in the pages, so the
   * whole marketing tree is searched rather than just the two page files.
   */
  it("every nav link points at a section the site actually renders", () => {
    const marketingDir = join(process.cwd(), "src", "components", "marketing");
    const corpus = [
      readFileSync(join(process.cwd(), "src", "app", "page.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "src", "app", "product", "page.tsx"), "utf8"),
      ...readdirSync(marketingDir)
        .filter((file) => /\.tsx?$/.test(file))
        .map((file) => readFileSync(join(marketingDir, file), "utf8")),
    ].join("\n");

    /** `/` and `/product` are the marketing routes; the rest are the app's. */
    const ROUTES: Record<string, string[]> = {
      "/": ["src", "app", "page.tsx"],
      "/product": ["src", "app", "product", "page.tsx"],
      "/legal": ["src", "app", "legal", "page.tsx"],
      "/dashboard": ["src", "app", "(dashboard)", "dashboard", "page.tsx"],
      "/login": ["src", "app", "(auth)", "login", "page.tsx"],
    };

    for (const link of [...NAV_LINKS, ...FOOTER_PRODUCT]) {
      const [path, hash] = link.href.split("#");

      if (hash) {
        expect(corpus, `${link.label} links to #${hash}`).toContain(`id="${hash}"`);
      }

      // An empty path means a bare fragment on whichever page is current.
      if (!path) continue;

      const segments = ROUTES[path];
      expect(segments, `${link.label} links to unknown route ${path}`).toBeDefined();
      expect(
        existsSync(join(process.cwd(), ...segments!)),
        `${link.label} links to ${path}, which has no page`,
      ).toBe(true);
    }
  });

  /**
   * The home page stays short.
   *
   * It ran to eighteen sections once, which is what prompted the split into
   * `/` and `/product`. Nothing stops the next person adding a nineteenth
   * except a number that fails, so here is the number. Depth belongs on the
   * product page; if a section genuinely has to be on the home page, something
   * else has to come off it.
   */
  it("the home page composes a small number of sections", () => {
    const home = readFileSync(join(process.cwd(), "src", "app", "page.tsx"), "utf8");

    // Furniture, not sections: these render around the content rather than
    // adding any, so counting them would make the limit meaningless.
    const FURNITURE = ["primitives", "MarketingNav", "MarketingFooter", "Reveal"];

    const sections = [
      ...home.matchAll(/from "@\/components\/marketing\/([A-Za-z]+)"/g),
    ]
      .map((match) => match[1]!)
      .filter((name) => !FURNITURE.includes(name));

    expect(sections.length, `home sections:\n${sections.join("\n")}`)
      .toBeLessThanOrEqual(8);
  });

  /**
   * The honesty vocabulary is three states and no more
   * (`MARKETING_SITE_ARCHITECTURE.md` §9.4). A fourth would be someone hedging
   * a claim rather than rewriting it, which is how a roadmap label ends up on
   * every card and stops meaning anything.
   */
  it("the status vocabulary stays at three states", () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([
      "demo",
      "in_development",
      "planned",
    ]);
  });

  /**
   * §9.3: the isolation claim has exactly one permitted wording, and the part
   * that matters is the admission at the end. Row-level security is written
   * into the migrations and unverified against a live database, because no
   * Supabase project is provisioned. Softening this to "your data is isolated"
   * would be the single most damaging edit anyone could make to this site.
   */
  it("the isolation claim still admits what has not been verified", () => {
    const isolated = TRUST_PRINCIPLES.find((p) => p.name === "Isolated");
    expect(isolated).toBeDefined();
    expect(isolated!.body).toContain("has not yet been verified against a live database");
    expect(isolated!.body).toContain("repository boundary");
  });

  /**
   * No certification language anywhere. Pegasus holds none of these, and a
   * page arguing that the product tells the truth about what it knows cannot
   * itself imply an audit it has never had.
   */
  it("claims no certification it does not hold", () => {
    const corpus = [
      ...TRUST_PRINCIPLES.map((p) => `${p.name} ${p.body}`),
      ...FAQS.map((f) => `${f.q} ${f.a}`),
      ...DOMAINS.map((d) => `${d.role} ${d.detail}`),
      ...PERSONAS.map((p) => `${p.promise} ${p.body}`),
    ]
      .join(" ")
      .toLowerCase();

    for (const forbidden of [
      "soc 2",
      "soc2",
      "iso 27001",
      "hipaa",
      "bank-level",
      "military-grade",
      "enterprise-grade security",
      "fully compliant",
      "gdpr compliant",
    ]) {
      expect(corpus, `must not claim "${forbidden}"`).not.toContain(forbidden);
    }
  });

  /**
   * No fabricated social proof. The site has no customers to name yet, and an
   * invented one would be the fastest way to lose the argument the rest of the
   * page is making.
   */
  it("invents no customers, testimonials or ratings", () => {
    const marketing = join(process.cwd(), "src", "components", "marketing");
    const page = [
      readFileSync(join(process.cwd(), "src", "app", "page.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "src", "app", "product", "page.tsx"), "utf8"),
    ].join("\n");
    const content = readFileSync(
      join(process.cwd(), "src", "lib", "marketing", "content.ts"),
      "utf8",
    );

    // Structured data must not assert ratings or reviews.
    for (const type of ["AggregateRating", "Review", "ratingValue", "reviewCount"]) {
      expect(page, `structured data must not include ${type}`).not.toContain(type);
    }

    // "Trusted by" is the canonical opener for a fake logo wall.
    expect(content.toLowerCase()).not.toContain("trusted by");
    expect(marketing).toBeTruthy();
  });

  /**
   * `--color-ink` inverts under the dark theme — correct for text, wrong for a
   * surface. The Trust section originally painted itself `bg-ink` with white
   * text and rendered white-on-white the moment a reader chose dark mode. A
   * fixed `bg-navy` token exists for surfaces that must stay navy in both
   * themes; this stops the inverting one coming back.
   */
  it("no marketing surface pairs an inverting ground with fixed white text", () => {
    const marketingDir = join(process.cwd(), "src", "components", "marketing");
    const offenders: string[] = [];

    for (const file of readdirSync(marketingDir).filter((f) => /\.tsx$/.test(f))) {
      const source = readFileSync(join(marketingDir, file), "utf8");
      for (const line of source.split("\n")) {
        if (/\bbg-ink\b/.test(line) && /text-white/.test(line)) {
          offenders.push(`${file}: ${line.trim().slice(0, 80)}`);
        }
      }
      // A whole section painted bg-ink with inverted children is the same bug
      // one level up.
      if (/tone="ink"/.test(source)) offenders.push(`${file}: tone="ink"`);
    }

    expect(offenders).toEqual([]);
  });

  it("the Finance domain is labelled as not yet shipped", () => {
    // The calculation engine is built and tested; the product surface is not.
    // Presenting Finance as live is the most tempting overclaim on the site.
    const finance = DOMAINS.find((d) => d.id === "finance");
    expect(finance?.status).toBe("in_development");
  });
});
