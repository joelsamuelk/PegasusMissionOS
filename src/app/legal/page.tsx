import type { Metadata } from "next";
import Link from "next/link";
import { appConfig } from "@/lib/config";
import { Wordmark } from "@/components/brand/Wordmark";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Pegasus Mission OS: current position on privacy, terms and cookies while the product is in development.",
  alternates: { canonical: "/legal" },
  robots: { index: true, follow: true },
};

/**
 * Legal.
 *
 * One page with three anchors rather than three documents, because publishing
 * a full privacy notice and terms of service for a product nobody can yet buy
 * would mean drafting commitments about processing that does not happen. The
 * honest version of that link is a page that states the current position and
 * says when the full documents arrive.
 *
 * Everything here is checkable against the codebase. The demo genuinely holds
 * no personal data beyond a seeded fictional charity; the enquiry form
 * genuinely collects four fields; there genuinely are no analytics or
 * advertising cookies, because there is no analytics script.
 */
const SECTIONS = [
  {
    id: "privacy",
    title: "Privacy",
    paragraphs: [
      "Pegasus Mission OS is in active development and is not yet available for production use with real beneficiary data. A full privacy notice will be published before the product is generally available, and before any organisation is asked to put its own records into it.",
      "The demo workspace contains no personal data about you or anyone else. It is seeded with records for Northstar Community Foundation, a fictional UK charity, and every contact point in it uses the reserved .example domain so nothing in it can reach a real inbox.",
      "The enquiry form on this site collects your name, work email, organisation and message, for the sole purpose of replying to you. It is not added to a mailing list, not shared with third parties and not used for advertising. Ask us to delete it and we will.",
      "When AI features are used, the provider is configurable and includes a deterministic offline mode that makes no external model call at all. Beneficiary data is never written to application logs.",
    ],
  },
  {
    id: "terms",
    title: "Terms",
    paragraphs: [
      "The demo workspace is provided as-is for evaluation. It is not a production service: data is held in the server process, changes do not persist indefinitely, and no availability or durability commitment is made or implied.",
      "Nothing shown in the demo constitutes financial, legal or regulatory advice. Fit assessments, grant health, financial figures and impact reporting are decision support for your team, and remain your organisation's responsibility to check before they are relied on or submitted to a funder.",
      "Full terms of service will be published alongside general availability.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies",
    paragraphs: [
      "This site sets no analytics, advertising or tracking cookies, because it runs no analytics or advertising scripts. Fonts are served from this domain rather than a font CDN, so loading a page here does not make a request to a third party.",
      "If cookies become necessary — for authenticated sessions once accounts exist — this page will be updated to name each one, what it does and how long it lasts, before it is set.",
    ],
  },
] as const;

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Pegasus Mission OS, home">
            <Wordmark showProduct />
          </Link>
          <Link
            href="/"
            className="rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Back to the site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-4 font-heading text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[2.5rem]">
          Where things currently stand.
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-ink-muted">
          Pegasus Mission OS is in development. Rather than publish a privacy notice and
          terms of service for a service that is not yet running, this page states the
          current position plainly. Both documents will be published before general
          availability.
        </p>

        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="mt-14 scroll-mt-24 border-t border-line pt-10"
          >
            <h2
              id={`${section.id}-heading`}
              className="font-heading text-[1.5rem] font-semibold tracking-tight text-ink"
            >
              {section.title}
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[0.9375rem] leading-relaxed text-ink-muted"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-14 border-t border-line pt-10 text-[0.9375rem] leading-relaxed text-ink-muted">
          Questions about any of this?{" "}
          <a
            href="mailto:hello@pegasus-studio.co"
            className="rounded font-medium text-info hover:underline"
          >
            hello@pegasus-studio.co
          </a>
          , or read more about the studio at{" "}
          <a
            href={appConfig.studioUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded font-medium text-info hover:underline"
          >
            pegasus-studio.co
          </a>
          .
        </p>
      </main>

      <MarketingFooter />
    </div>
  );
}
