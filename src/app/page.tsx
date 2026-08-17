import type { Metadata } from "next";
import { appConfig } from "@/lib/config";
import { loadMarketingPreview } from "@/lib/marketing/preview";
import { FAQS } from "@/lib/marketing/content";
import { Section, SectionHeader } from "@/components/marketing/primitives";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { ProductComposition } from "@/components/marketing/ProductComposition";
import { FragmentationSection } from "@/components/marketing/FragmentationSection";
import { MissionOSMap } from "@/components/marketing/MissionOSMap";
import { IntelligenceDemo } from "@/components/marketing/IntelligenceDemo";
import { Lifecycle } from "@/components/marketing/Lifecycle";
import { OrganisationIntelligenceDemo } from "@/components/marketing/OrganisationIntelligenceDemo";
import { FundingIntelligenceDemo } from "@/components/marketing/FundingIntelligenceDemo";
import { FinanceIntelligenceDemo } from "@/components/marketing/FinanceIntelligenceDemo";
import { RelationshipDemo } from "@/components/marketing/RelationshipDemo";
import { ImpactSection } from "@/components/marketing/ImpactSection";
import { TrustSection } from "@/components/marketing/TrustSection";
import { PersonaExplorer } from "@/components/marketing/PersonaExplorer";
import { PrinciplesSection } from "@/components/marketing/PrinciplesSection";
import { ProductExplorer } from "@/components/marketing/ProductExplorer";
import { FAQ } from "@/components/marketing/FAQ";
import { StudioSection } from "@/components/marketing/StudioSection";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";

const TITLE = "Pegasus Mission OS — the operating system for mission-driven organisations";
const DESCRIPTION =
  "Pegasus Mission OS connects funding, programmes, finances, relationships, evidence and reporting for charities, NGOs, foundations and social enterprises — one organisation, one source of truth, one intelligence layer.";

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
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * The public marketing site.
 *
 * A thin composition over `components/marketing/`. Two things about the shape
 * are deliberate:
 *
 * 1. **It is a server component and stays one.** Five client islands ship on
 *    this page — the nav, the Mission OS map, the provenance drill-down, the
 *    persona explorer and the product explorer — and everything else renders
 *    to HTML. The LCP element is the hero `<h1>`, in a local font, with no
 *    image above it.
 *
 * 2. **Product data is loaded once and passed down.** `loadMarketingPreview()`
 *    reads the seeded workspace through `MissionRepository` and runs the
 *    product's own deterministic engines, so every figure on this page is the
 *    product's rather than a copywriter's. It resolves at build time.
 *
 * Structured data claims only what is true: an Organisation and a
 * SoftwareApplication. No ratings, no reviews, no fabricated price.
 */
export default async function LandingPage() {
  const { command, funding, relationship, provenance, explorer } =
    await loadMarketingPreview();

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
          audienceType:
            "Charities, NGOs, foundations and social enterprises",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${appConfig.marketingUrl}#faq`,
        mainEntity: FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
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
        <ProductComposition
          command={command}
          funding={funding}
          provenance={provenance}
        />

        <FragmentationSection />

        {/* The centrepiece. */}
        <Section id="operating-system">
          <SectionHeader
            id="operating-system"
            eyebrow="The operating system"
            title="One operating system for the organisation behind the mission."
            lead="Pegasus is not six modules that talk to each other. It is one organisational model, with an intelligence layer over it and a trust layer under it — which is why a fact entered in one place is useful everywhere else without anyone syncing anything."
          />
          <Reveal className="mt-12">
            <MissionOSMap />
          </Reveal>
          <p className="mt-8 max-w-2xl border-l-2 border-accent pl-5 font-heading text-[1.125rem] font-semibold leading-snug tracking-tight text-ink sm:text-[1.3rem]">
            Not integrations between modules. One shared organisational model.
          </p>
        </Section>

        <IntelligenceDemo funding={funding} />
        <Lifecycle />
        <OrganisationIntelligenceDemo />
        <FundingIntelligenceDemo funding={funding} />
        <FinanceIntelligenceDemo />
        {relationship && <RelationshipDemo relationship={relationship} />}
        {provenance && <ImpactSection provenance={provenance} />}
        <TrustSection />

        <Section id="personas">
          <SectionHeader
            id="personas"
            eyebrow="Who it's for"
            title="Six people, one organisation, one system."
            lead="A chief executive, a fundraiser and a trustee are not using different products — they are looking at the same organisational truth from the seat they sit in."
          />
          <Reveal className="mt-12">
            <PersonaExplorer />
          </Reveal>
        </Section>

        <PrinciplesSection />

        <Section id="explore" tone="surface" bordered>
          <SectionHeader
            id="explore"
            eyebrow="Explore the product"
            title="This is the working application, not a mockup."
            lead="Every panel below is rendered from the demo workspace: Northstar Community Foundation, a fictional UK charity whose records are labelled as sample data throughout the product. Open the demo and you will find these exact screens."
          />
          <Reveal className="mt-12">
            <ProductExplorer
              explorer={explorer}
              funding={funding}
              relationship={relationship}
            />
          </Reveal>
        </Section>

        <FAQ />
        <StudioSection />
        <FinalCTA />
      </main>

      <MarketingFooter />
    </div>
  );
}
