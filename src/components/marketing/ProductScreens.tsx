import Image from "next/image";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Real captures of the seeded demo, composed as product imagery rather than a
 * second textual explanation. The desktop canvases are deliberately cropped:
 * at marketing-page scale the useful detail is the work, not every pixel of
 * the application chrome.
 */
export function ProductScreens() {
  return (
    <Reveal className="relative mt-12 pb-12 sm:pb-20">
      <div className="absolute -inset-x-8 bottom-0 top-10 rounded-[2.5rem] bg-blue-soft/70" aria-hidden />

      <div className="relative ml-auto w-[94%] overflow-hidden rounded-2xl border border-line bg-surface shadow-elev-3 sm:w-[90%]">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-accent/60" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/45" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-success/45" aria-hidden />
          <span className="ml-3 text-[0.7rem] font-medium text-ink-subtle">Command Centre</span>
        </div>
        <div className="aspect-[16/8.4] overflow-hidden">
          <Image
            src="/preview-command-centre.png"
            alt="Pegasus Command Centre showing funding, grants, reports and weekly priorities"
            width={2800}
            height={1800}
            sizes="(min-width: 1024px) 64rem, 92vw"
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>

      <div className="relative -mt-10 w-[72%] overflow-hidden rounded-2xl border border-line bg-surface shadow-elev-3 sm:-mt-24 sm:w-[62%]">
        <div className="aspect-[16/9] overflow-hidden">
          <Image
            src="/preview-funding-board.png"
            alt="Pegasus funding pipeline arranged as a board from discovered opportunities to internal review"
            width={3200}
            height={1800}
            sizes="(min-width: 1024px) 42rem, 72vw"
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>

      <div className="absolute bottom-1 right-0 max-w-[15rem] rounded-xl border border-line bg-surface px-4 py-3 shadow-elev-2 sm:bottom-8 sm:right-5">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em]">Live demo data</span>
        </div>
        <p className="mt-1.5 text-[0.8rem] leading-snug text-ink-muted">
          Follow every figure into the open workspace.
        </p>
        <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-ink-subtle" aria-hidden />
      </div>
    </Reveal>
  );
}
