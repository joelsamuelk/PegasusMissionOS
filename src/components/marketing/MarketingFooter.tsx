import Link from "next/link";
import { appConfig } from "@/lib/config";
import { FOOTER_LEGAL, FOOTER_PRODUCT } from "@/lib/marketing/content";
import { PegasusGlyph } from "@/components/brand/Wordmark";
import { domainPaths } from "@/lib/domains";

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="rounded-2xl bg-navy px-6 py-8 text-white shadow-elev-2 sm:px-10 sm:py-10">
          <div className="grid gap-9 lg:grid-cols-[1.35fr_1px_0.8fr_0.8fr_0.8fr] lg:items-start lg:gap-9">
            <div className="max-w-sm">
              <Link
                href="/"
                className="inline-flex items-center gap-3 rounded-md"
                aria-label="Pegasus Mission OS, home"
              >
                <PegasusGlyph className="h-14 w-auto text-accent" />
                <span className="inline-flex flex-col leading-none">
                  <span className="font-heading text-xl font-semibold tracking-tight text-blue">
                    Pegasus
                  </span>
                  <span className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-white/55">
                    Mission OS
                  </span>
                </span>
              </Link>
              <p className="mt-5 text-sm leading-relaxed text-white/65">
                The operating system for mission-driven organisations. One organisation,
                one source of truth, one intelligence layer.
              </p>
            </div>

            <div
              className="h-px w-full bg-accent lg:h-full lg:min-h-36 lg:w-px"
              aria-hidden
            />

            <FooterColumn title="Product">
              {FOOTER_PRODUCT.map((item) => (
                <FooterItem key={item.href} href={item.href}>
                  {item.label}
                </FooterItem>
              ))}
            </FooterColumn>

            <FooterColumn title="Pegasus">
              <li>
                <a
                  href={appConfig.studioUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded transition-colors hover:text-white"
                >
                  Pegasus Studio
                </a>
              </li>
              <FooterItem href="/#contact">Contact</FooterItem>
              <li>
                <a
                  href={domainPaths.app("/login")}
                  className="rounded transition-colors hover:text-white"
                >
                  Sign in
                </a>
              </li>
            </FooterColumn>

            <FooterColumn title="Legal">
              {FOOTER_LEGAL.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </FooterColumn>
          </div>

          <div className="mt-9 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-2xl text-xs leading-relaxed text-white/45">
              <span className="font-semibold text-white/65">Product status.</span>{" "}
              Funding, applications, grants, programmes, impact, evidence and
              relationships are working in the demo workspace. Finance Intelligence,
              organisation research at onboarding and external integrations are in
              development. The demo uses seeded data for a fictional charity.
            </p>
            <p className="shrink-0 text-xs text-white/45">
              © {new Date().getFullYear()} Pegasus Information Studio.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-accent-muted">
        {title}
      </h2>
      <ul className="flex flex-col gap-2 text-sm text-white/65">{children}</ul>
    </div>
  );
}

function FooterItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      {href.includes("#") ? (
        <a href={href} className="rounded transition-colors hover:text-white">
          {children}
        </a>
      ) : (
        <Link href={href} className="rounded transition-colors hover:text-white">
          {children}
        </Link>
      )}
    </li>
  );
}
