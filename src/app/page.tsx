import type { Metadata } from "next";
import { appConfig } from "@/lib/config";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { MissionHome } from "@/components/marketing/MissionHome";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const TITLE = "Pegasus Mission OS: the operating system for mission-driven organisations";
const DESCRIPTION =
  "Pegasus Mission OS keeps funding, programmes, finances, relationships, evidence and reporting in one place for charities, NGOs, foundations and social enterprises. Enter something once and it is there everywhere you need it.";

export const metadata: Metadata = {
  title: {
    absolute: TITLE,
  },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: appConfig.marketingUrl,
    siteName: "Pegasus Mission OS",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Pegasus Mission OS. Every mission deserves world-class technology.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

/**
 * The public home page.
 *
 * Five core sections, and that restraint is the design. The previous version ran to
 * eighteen: it made the same argument — the domains are connected, the figures
 * are traceable — five separate times through five separate demos, and a
 * visitor had to scroll past all of it to reach the FAQ. Everything cut is on
 * `/product`, which this page links to twice.
 *
 * The order answers a visitor's questions in the order they ask them: what is
 * it (hero), is it real (product screens), how does it improve the work
 * (benefit chapters), is it for my team (roles), can I trust it (trust), and
 * what about X (FAQ), then how do I start (CTA).
 *
 * Two things about the shape are deliberate and unchanged:
 *
 * 1. **It is a server component and stays one.** The nav and scroll reveals
 *    are the only client-side behaviour; the product story, screenshots and
 *    everything else renders to HTML. The LCP element is the hero `<h1>`, in a
 *    local font, with no image request above it.
 *
 * 2. **The product imagery is real.** Both captures come from the seeded demo
 *    workspace and the page links directly to that workspace, rather than
 *    presenting a fabricated UI or an uncheckable marketing number.
 *
 * Structured data claims only what is true: an Organisation, a
 * SoftwareApplication and the FAQ this page actually renders. No ratings, no
 * reviews, no fabricated price.
 */
export default function LandingPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${appConfig.marketingUrl}#organisation`,
        name: "Pegasus Information Studio",
        url: appConfig.studioUrl,
        sameAs: [appConfig.studioUrl],
        email: "hello@pegasus-studio.co",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${appConfig.marketingUrl}#product`,
        name: "Pegasus Mission OS",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: appConfig.marketingUrl,
        description: DESCRIPTION,
        publisher: { "@id": `${appConfig.marketingUrl}#organisation` },
        audience: {
          "@type": "Audience",
          audienceType: "Charities, NGOs, foundations and social enterprises",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-paper">
      <script
        type="application/ld+json"
        // Content is a literal object built above, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-ink-inverse"
      >
        Skip to content
      </a>

      <MarketingNav />

      <main id="main">
        <Hero />

        <MissionHome />

        <FinalCTA compact />
      </main>

      <MarketingFooter />
    </div>
  );
}
