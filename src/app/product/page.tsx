import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { appConfig } from "@/lib/config";
import { loadMarketingPreview } from "@/lib/marketing/preview";
import { Section, SectionHeader } from "@/components/marketing/primitives";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { FragmentationSection } from "@/components/marketing/FragmentationSection";
import { MissionOSMap } from "@/components/marketing/MissionOSMap";
import { Lifecycle } from "@/components/marketing/Lifecycle";
import { IntelligenceDemo } from "@/components/marketing/IntelligenceDemo";
import { OrganisationIntelligenceDemo } from "@/components/marketing/OrganisationIntelligenceDemo";
import { FundingIntelligenceDemo } from "@/components/marketing/FundingIntelligenceDemo";
import { FinanceIntelligenceDemo } from "@/components/marketing/FinanceIntelligenceDemo";
import { RelationshipDemo } from "@/components/marketing/RelationshipDemo";
import { ImpactSection } from "@/components/marketing/ImpactSection";
import { PrinciplesSection } from "@/components/marketing/PrinciplesSection";
import { ProductExplorer } from "@/components/marketing/ProductExplorer";
import { StudioSection } from "@/components/marketing/StudioSection";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { ButtonLink } from "@/components/shared/ui";
import { BrandMotif } from "@/components/brand/Wordmark";

const TITLE = "How Pegasus Mission OS works";
const DESCRIPTION =
  "A walkthrough of Pegasus Mission OS: the shared organisational model underneath it, what is calculated rather than generated, and live previews of funding, finance, relationships and impact from the demo workspace.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/product" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: `${appConfig.marketingUrl}/product`,
    siteName: "Pegasus Mission OS",
    title: `${TITLE} | Pegasus Mission OS`,
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
    title: `${TITLE} | Pegasus Mission OS`,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

/**
 * The product walkthrough.
 *
 * This page exists so the home page can be six sections long. Everything here
 * used to sit on `/`, where it made the same argument five times over and
 * buried the FAQ under three thousand words of it — a visitor who wanted the
 * detail and a visitor who wanted to know what Pegasus is were being served
 * the same scroll.
 *
 * The split is by intent, not by importance. A reader arrives here having
 * already decided the product might be relevant, so the sections can be as
 * long as they need to be: the fragmentation argument, the shared model, the
 * lifecycle, four intelligence walkthroughs against real seeded records, and
 * the explorer that renders the actual application.
 *
 * Same data source as the home page. `loadMarketingPreview()` reads the seeded
 * workspace through `MissionRepository` and resolves at build time, so both
 * routes quote the same figures because they read the same records.
 */
export default async function ProductPage() {
  const { funding, relationship, provenance, explorer } =
    await loadMarketingPreview();

  return (
    <div className="min-h-screen bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-ink-inverse"
      >
        Skip to content
      </a>

      <MarketingNav />

      <main id="main">
        {/* A short header rather than a second hero. The page is the argument;
            this only has to say which argument it is. */}
        <section
          aria-labelledby="product-heading"
          className="relative overflow-hidden border-b border-line"
        >
          <div className="absolute inset-0 brand-wash" aria-hidden />
          <BrandMotif className="-right-28 top-1/2 hidden h-72 w-auto -translate-y-1/2 opacity-[0.06] lg:block" />
          <div className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <span className="eyebrow">How it works</span>
            <h1
              id="product-heading"
              className="mt-4 max-w-3xl text-balance font-heading text-[2rem] font-semibold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[2.75rem]"
            >
              One model of your organisation, and what it makes possible.
            </h1>
            <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-muted">
              This page is the long version. What the fragmented alternative
              costs you, how the shared model works, what Pegasus calculates
              instead of generating, and live previews from the demo workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/dashboard" variant="blue">
                Explore the demo
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="#explore" variant="secondary">
                Jump to the previews
              </ButtonLink>
            </div>
          </div>
        </section>

        <FragmentationSection />

        <Section id="operating-system">
          <SectionHeader
            id="operating-system"
            eyebrow="The operating system"
            title="One operating system for the organisation behind the mission."
            lead="Pegasus is not seven modules wired together. It is one model of your organisation, with an intelligence layer over it and a trust layer under it. That is why a fact entered in one place is useful everywhere else without anyone syncing anything."
          />
          <Reveal className="mt-12">
            <MissionOSMap />
          </Reveal>
          <p className="mt-8 max-w-2xl border-l-2 border-accent pl-5 font-heading text-[1.125rem] font-semibold leading-snug tracking-tight text-ink sm:text-[1.3rem]">
            Not integrations between modules. One shared organisational model.
          </p>
        </Section>

        <Lifecycle />
        <IntelligenceDemo funding={funding} />
        <OrganisationIntelligenceDemo />
        <FundingIntelligenceDemo funding={funding} />
        <FinanceIntelligenceDemo />
        {relationship && <RelationshipDemo relationship={relationship} />}
        {provenance && <ImpactSection provenance={provenance} />}
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

        <StudioSection />
        <FinalCTA />
      </main>

      <MarketingFooter />
    </div>
  );
}
