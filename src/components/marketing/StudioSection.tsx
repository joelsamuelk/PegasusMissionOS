import { ArrowUpRight } from "lucide-react";
import { appConfig } from "@/lib/config";
import { BrandMotif } from "@/components/brand/Wordmark";

/**
 * Pegasus Information Studio.
 *
 * Deliberately reduced in prominence relative to the previous site: a single
 * bordered panel rather than a full section with its own heading rhythm.
 * Mission OS has to read as a product with a parent, not as a studio case
 * study — a visitor evaluating software for a five-year commitment cares who
 * builds it, and cares more about whether it will still be built in five
 * years than about the agency's other work.
 */
export function StudioSection() {
  return (
    <section
      aria-labelledby="studio-heading"
      className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8"
    >
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-7 sm:p-10">
        <BrandMotif className="-right-8 -top-12 h-40 w-auto opacity-[0.05]" />
        <div className="relative grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12">
          <div>
            <div className="eyebrow mb-3">Who builds it</div>
            <h2
              id="studio-heading"
              className="font-heading text-[1.35rem] font-semibold tracking-tight text-ink sm:text-[1.6rem]"
            >
              Built by Pegasus Information Studio.
            </h2>
          </div>
          <div>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              Pegasus Information Studio designs and builds high-performance software,
              and embeds AI into everyday work where it earns its place. Mission OS is
              that practice turned toward the sector we care most about: the
              organisations doing the hardest work with the least slack. It is our own
              product, built in the open against a published architecture and a
              standard of evidence we hold ourselves to.
            </p>
            <a
              href={appConfig.studioUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 rounded text-[0.875rem] font-medium text-info transition-colors hover:text-ink"
            >
              Visit pegasus-studio.co
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
