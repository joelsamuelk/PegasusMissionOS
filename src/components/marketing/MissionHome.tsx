import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  FileCheck2,
  Landmark,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";

export function MissionHome() {
  return (
    <>
      <section
        id="context"
        className="scroll-mt-24 border-y border-line bg-surface"
        aria-labelledby="context-heading"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:py-28">
          <Reveal>
            <span className="eyebrow text-accent-ink">The work behind the mission</span>
            <h2
              id="context-heading"
              className="mt-4 text-balance text-[2.15rem] font-semibold leading-[1.06] text-ink sm:text-[3rem]"
            >
              Your mission is connected. Your software should be too.
            </h2>
            <p className="mt-6 text-[1.0625rem] leading-relaxed text-ink-muted">
              Mission-driven teams should not have to carry the same context between
              funding spreadsheets, programme trackers, finance sheets, shared drives and
              board papers.
            </p>
            <div className="mt-8 border-l-2 border-accent pl-5">
              <p className="font-heading text-xl font-semibold text-ink">
                Tell Pegasus once. Use it everywhere.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                One trusted picture of your organisation makes every part of the work
                smarter.
              </p>
            </div>
            <a
              href="/product#operating-system"
              className="mt-8 inline-flex items-center gap-2 rounded text-sm font-semibold text-info hover:text-ink"
            >
              See how the context connects
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </Reveal>
          <Reveal delay={100} className="relative pb-5 sm:pr-5">
            <div className="overflow-hidden rounded-[1.75rem] bg-surface shadow-elev-3">
              <Image
                src="/photos/mission-team.png"
                alt="Four colleagues reviewing programme plans together around a table"
                width={1717}
                height={916}
                sizes="(min-width: 1024px) 34rem, 92vw"
                className="aspect-[4/3] w-full object-cover object-center sm:aspect-[16/10]"
              />
            </div>
            <div className="relative -mt-10 ml-auto mr-3 max-w-[17rem] rounded-2xl border border-line bg-paper p-4 shadow-elev-2 sm:-mt-14 sm:mr-0">
              <div className="flex items-center gap-2 text-success">
                <BadgeCheck className="h-4 w-4" aria-hidden />
                <span className="text-xs font-semibold">
                  Trusted organisational context
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Funding", "Programmes", "Finance", "Evidence"].map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-surface px-2 py-1 text-[0.65rem] font-semibold text-ink-muted"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="outcomes-heading">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <Reveal className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <span className="eyebrow">One operating system</span>
              <h2
                id="outcomes-heading"
                className="mt-4 text-balance text-[2.15rem] font-semibold leading-[1.06] text-ink sm:text-[3rem]"
              >
                Less system-wrangling. More mission.
              </h2>
            </div>
            <p className="max-w-2xl text-[1.0625rem] leading-relaxed text-ink-muted">
              Funding, programmes, finance, relationships, evidence, impact and reporting
              work from the same organisational picture.
            </p>
          </Reveal>
          <Reveal
            delay={100}
            className="relative mt-12 overflow-hidden rounded-[2rem] bg-blue-soft px-4 pb-10 pt-16 sm:px-10 sm:pb-14 lg:px-16 lg:pt-20"
          >
            <div
              className="absolute -left-10 -top-28 h-64 w-16 rotate-[-18deg] rounded-full bg-accent sm:left-8"
              aria-hidden
            />
            <div
              className="absolute -left-1 -top-24 h-72 w-16 rotate-[-18deg] rounded-full bg-blue sm:left-24"
              aria-hidden
            />
            <div
              className="absolute -bottom-32 -right-6 h-72 w-16 rotate-[-18deg] rounded-full bg-navy sm:right-20"
              aria-hidden
            />
            <div
              className="absolute -bottom-28 right-[-3rem] h-72 w-16 rotate-[-18deg] rounded-full bg-blue sm:right-4"
              aria-hidden
            />

            <div className="relative mx-auto grid max-w-3xl grid-cols-3 items-end gap-2 sm:gap-5">
              <PortraitArch position="left" className="h-64 sm:h-[24rem]" />
              <PortraitArch position="center" className="h-72 sm:h-[27rem]" />
              <PortraitArch position="right" className="h-64 sm:h-[24rem]" />

              <OutcomeCard
                className="-left-1 bottom-4 sm:-left-12 sm:bottom-10"
                icon={Target}
                eyebrow="Funding fit"
                title="Why this opportunity fits"
                detail="Eligibility confirmed"
                tone="text-info"
              />
              <OutcomeCard
                className="left-1/2 bottom-[-1rem] -translate-x-1/2 sm:bottom-2"
                icon={Landmark}
                eyebrow="Programme"
                title="Delivery on track"
                detail="Evidence connected"
                tone="text-success"
              />
              <OutcomeCard
                className="-right-1 bottom-6 sm:-right-12 sm:bottom-12"
                icon={Users}
                eyebrow="Relationship"
                title="Meeting brief ready"
                detail="Full history included"
                tone="text-accent-ink"
              />
            </div>
          </Reveal>
          <Reveal className="mt-8 flex justify-center">
            <a
              href="/product"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-5 py-3 text-sm font-semibold text-ink hover:border-blue/40"
            >
              Explore the full product
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </Reveal>
        </div>
      </section>

      <section
        id="intelligence"
        className="scroll-mt-24 overflow-hidden bg-navy text-white"
        aria-labelledby="intelligence-heading"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-28">
          <Reveal>
            <span className="eyebrow text-white/55">Pegasus Intelligence</span>
            <h2
              id="intelligence-heading"
              className="mt-4 text-balance text-[2.15rem] font-semibold leading-[1.06] text-white sm:text-[3rem]"
            >
              Intelligence that starts with your organisation.
            </h2>
            <p className="mt-6 text-[1.0625rem] leading-relaxed text-white/65">
              Ask what needs attention, which funding fits or what evidence is missing.
              Pegasus shows the context it used, what needs review and where every
              important answer came from.
            </p>
            <ul className="mt-8 grid grid-cols-2 gap-3 text-sm text-white/75">
              {["Grounded", "Traceable", "Explainable", "Human-controlled"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" aria-hidden />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </Reveal>
          <Reveal
            delay={100}
            className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 sm:p-7"
          >
            <div className="flex gap-3 rounded-xl bg-white/10 p-4">
              <Sparkles
                className="mt-0.5 h-5 w-5 shrink-0 text-accent-muted"
                aria-hidden
              />
              <p className="font-heading font-semibold">
                What should the leadership team focus on this week?
              </p>
            </div>
            <div className="mt-5 space-y-3">
              <IntelligenceItem text="Funding application closes in 9 days" />
              <IntelligenceItem text="Two programme indicators need updating" />
              <IntelligenceItem text="Three verified evidence items are ready" />
            </div>
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-warning/15 p-4 text-xs leading-relaxed text-warning">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              One financial change needs a person to review it before use.
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function PortraitArch({
  position,
  className,
}: {
  position: "left" | "center" | "right";
  className: string;
}) {
  const objectPosition =
    position === "left"
      ? "object-left"
      : position === "right"
        ? "object-right"
        : "object-center";
  return (
    <div
      className={`relative overflow-hidden rounded-t-full rounded-b-[5rem] bg-surface shadow-elev-2 ${className}`}
    >
      <Image
        src="/photos/mission-leaders-triptych.png"
        alt=""
        fill
        sizes="(min-width: 640px) 45rem, 90vw"
        quality={90}
        className={`object-cover ${objectPosition}`}
      />
    </div>
  );
}

function OutcomeCard({
  className,
  icon: Icon,
  eyebrow,
  title,
  detail,
  tone,
}: {
  className: string;
  icon: typeof Target;
  eyebrow: string;
  title: string;
  detail: string;
  tone: string;
}) {
  return (
    <div
      className={`absolute z-20 w-36 rounded-xl border border-line bg-surface p-3 shadow-elev-3 sm:w-48 sm:p-4 ${className}`}
    >
      <div className={`flex items-center gap-2 ${tone}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em]">
          {eyebrow}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold leading-snug text-ink sm:text-sm">
        {title}
      </p>
      <p className="mt-1 text-[0.62rem] text-ink-subtle sm:text-xs">{detail}</p>
    </div>
  );
}

function IntelligenceItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 p-4 text-sm text-white/75">
      <FileCheck2 className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
      {text}
    </div>
  );
}
