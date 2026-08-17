import Link from "next/link";
import { appConfig } from "@/lib/config";
import { FOOTER_LEGAL, FOOTER_PRODUCT } from "@/lib/marketing/content";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * The footer.
 *
 * Richer than the previous two-column version, and still restrained. The
 * product-status line is the part worth keeping honest: a visitor who has read
 * the whole page and reached the bottom deserves the one-sentence summary of
 * what state the software is actually in, rather than having to reassemble it
 * from five chips.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Wordmark showProduct />
            <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-muted">
              The operating system for mission-driven organisations. One organisation,
              one source of truth, one intelligence layer.
            </p>
          </div>

          <FooterColumn title="Product">
            {FOOTER_PRODUCT.map((link) =>
              link.href.startsWith("#") ? (
                <FooterLink key={link.href} href={link.href}>
                  {link.label}
                </FooterLink>
              ) : (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ),
            )}
          </FooterColumn>

          <FooterColumn title="Company">
            <li>
              <a
                href={appConfig.studioUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded transition-colors hover:text-ink"
              >
                Pegasus Studio
              </a>
            </li>
            <FooterLink href="#contact">Contact</FooterLink>
            <li>
              <Link href="/login" className="rounded transition-colors hover:text-ink">
                Sign in
              </Link>
            </li>
          </FooterColumn>

          <FooterColumn title="Legal">
            {FOOTER_LEGAL.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded transition-colors hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </FooterColumn>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-ink-subtle">
            <span className="font-medium text-ink-muted">Product status.</span> Funding,
            applications, grants, programmes, impact, evidence and relationships are
            working in the demo workspace. Finance Intelligence, organisation research
            at onboarding and external integrations are in development. The demo runs
            on seeded sample data for a fictional charity.
          </p>
          <p className="flex-shrink-0 text-xs text-ink-subtle">
            © {new Date().getFullYear()} Pegasus Information Studio.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="eyebrow mb-3">{title}</h2>
      <ul className="flex flex-col gap-2 text-[0.875rem] text-ink-muted">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} className="rounded transition-colors hover:text-ink">
        {children}
      </a>
    </li>
  );
}
