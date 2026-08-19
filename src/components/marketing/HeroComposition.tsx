import Image from "next/image";
import { BadgeCheck, Sparkles } from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";

export function HeroComposition() {
  return (
    <Reveal className="relative mx-auto mt-14 max-w-6xl sm:mt-16">
      <div className="relative h-[29rem] overflow-hidden rounded-[1.75rem] bg-blue shadow-elev-3 sm:h-[36rem] lg:h-[40rem]">
        <div
          className="absolute -left-24 top-12 h-64 w-64 rounded-full border-[4.5rem] border-accent sm:-left-16 sm:h-80 sm:w-80"
          aria-hidden
        />
        <div
          className="absolute left-[38%] top-0 h-full w-[44%] -skew-x-12 bg-accent-muted"
          aria-hidden
        />
        <div
          className="absolute -bottom-28 right-[-5rem] h-80 w-80 rounded-full border-[5rem] border-navy/90"
          aria-hidden
        />

        <div className="absolute left-3 top-5 z-20 w-[58%] overflow-hidden rounded-xl border border-white/30 bg-surface shadow-elev-3 sm:left-7 sm:top-8 sm:w-[48%] lg:w-[43%]">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-[0.62rem] font-semibold text-ink-subtle">
              Command Centre
            </span>
          </div>
          <div className="aspect-[16/9] overflow-hidden">
            <Image
              src="/preview-command-centre.png"
              alt="Mission OS Command Centre"
              width={2800}
              height={1800}
              sizes="(min-width: 1024px) 28rem, 55vw"
              className="h-full w-full object-cover object-top"
            />
          </div>
        </div>

        <div className="absolute bottom-5 right-3 z-30 w-[58%] overflow-hidden rounded-xl border border-white/30 bg-surface shadow-elev-3 sm:bottom-8 sm:right-7 sm:w-[46%] lg:w-[40%]">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <span className="text-[0.62rem] font-semibold text-ink-subtle">
              Funding intelligence
            </span>
            <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden />
          </div>
          <div className="aspect-[16/9] overflow-hidden">
            <Image
              src="/preview-funding-board.png"
              alt="Mission OS funding pipeline"
              width={3200}
              height={1800}
              sizes="(min-width: 1024px) 26rem, 55vw"
              className="h-full w-full object-cover object-top"
            />
          </div>
        </div>

        <Image
          src="/photos/hero-team-cutout.png"
          alt="Two mission-driven organisation colleagues reviewing a programme folder"
          width={1024}
          height={1536}
          priority
          sizes="(min-width: 1024px) 33rem, 75vw"
          className="absolute bottom-[-5.5rem] left-1/2 z-20 h-[31rem] w-auto max-w-none -translate-x-1/2 object-contain drop-shadow-[0_22px_24px_rgba(20,33,61,0.28)] sm:bottom-[-7rem] sm:h-[40rem] lg:bottom-[-8rem] lg:h-[46rem]"
        />

        <div className="absolute right-4 top-5 z-30 max-w-[11rem] rounded-xl border border-white/30 bg-surface px-3.5 py-3 shadow-elev-2 sm:right-7 sm:top-8 sm:max-w-[14rem] sm:px-4">
          <div className="flex items-center gap-2 text-info">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.1em]">
              Pegasus Intelligence
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-snug text-ink sm:text-sm">
            What needs our attention this week?
          </p>
        </div>
      </div>
      <p className="mt-4 text-center text-xs leading-relaxed text-ink-subtle">
        Original editorial image with real product views from the Northstar demo
        workspace.
      </p>
    </Reveal>
  );
}
