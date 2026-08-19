import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Mail,
  Radio,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { rankedAccounts } from "@/lib/commercial/demo-data";
const metrics = [
  ["Pipeline value", "£286k", "+£42k this month"],
  ["Qualified opportunities", "8", "3 need a next action"],
  ["Meetings booked", "5", "Next 14 days"],
  ["Proposals open", "3", "£94k total"],
  ["Clients won", "2", "£68k revenue won"],
  ["Mission OS pipeline", "£112k", "4 opportunities"],
  ["Studio pipeline", "£174k", "6 opportunities"],
];
const priorities = [
  ["4 follow-ups due", "Two are overdue", Mail, "/control/outreach"],
  [
    "7 high-fit accounts discovered",
    "Four have strong evidence",
    Sparkles,
    "/control/prospects/discover",
  ],
  ["2 buying signals detected", "Both observed this week", Radio, "/control/outreach"],
  [
    "1 proposal needs attention",
    "No activity for 8 days",
    CircleAlert,
    "/control/pipeline",
  ],
] as const;
export default function ControlCommandCentrePage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Wednesday, 19 August</p>
          <h1 className="mt-2 text-3xl font-semibold">Who matters today?</h1>
          <p className="mt-2 text-sm text-ink-muted">
            A focused view of evidence, timing and the next commercial move.
          </p>
        </div>
        <Link
          href="/control/outreach"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-coral"
        >
          Start today&apos;s outreach <ArrowRight className="h-4 w-4" />
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {metrics.map(([l, v, n]) => (
          <div key={l} className="surface-card p-4">
            <p className="text-xs font-semibold text-ink-muted">{l}</p>
            <p className="mt-3 text-2xl font-semibold">{v}</p>
            <p className="mt-1 text-[11px] text-ink-subtle">{n}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="eyebrow">Today&apos;s priorities</p>
              <h2 className="mt-1 text-xl font-semibold">
                The work that can move revenue
              </h2>
            </div>
            <span className="text-xs text-ink-muted">Ranked by urgency + evidence</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {priorities.map(([title, note, Icon, href]) => (
              <Link
                href={href}
                key={title}
                className="surface-card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-card"
              >
                <span className="rounded-lg bg-blue-soft p-2 text-blue">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <strong className="block text-sm">{title}</strong>
                  <span className="text-xs text-ink-muted">{note}</span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 text-ink-subtle" />
              </Link>
            ))}
          </div>
        </section>
        <section className="surface-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Pipeline health</p>
              <h2 className="mt-1 text-lg font-semibold">£286k weighted</h2>
            </div>
            <TrendingUp className="h-5 w-5 text-success" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full w-[64%] rounded-full bg-success" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <strong>64%</strong>
              <span className="block text-[11px] text-ink-muted">has next action</span>
            </div>
            <div>
              <strong>21d</strong>
              <span className="block text-[11px] text-ink-muted">avg. cycle</span>
            </div>
            <div>
              <strong>2</strong>
              <span className="block text-[11px] text-ink-muted">at risk</span>
            </div>
          </div>
        </section>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <p className="eyebrow">Recommended accounts</p>
              <h2 className="mt-1 text-lg font-semibold">
                Strong evidence, useful timing
              </h2>
            </div>
            <Link href="/control/outreach" className="text-sm font-semibold text-blue">
              Open queue
            </Link>
          </div>
          {rankedAccounts.slice(0, 3).map((a, i) => (
            <Link
              href={`/control/outreach?account=${a.id}`}
              key={a.id}
              className="grid gap-3 border-b p-5 last:border-0 hover:bg-surface-sunken sm:grid-cols-[32px_1fr_auto]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <strong>{a.name}</strong>
                <span className="ml-2 rounded-full bg-blue-soft px-2 py-0.5 text-[10px] font-bold text-blue">
                  {a.icp}
                </span>
                <span className="mt-1 block text-sm text-ink-muted">{a.whyNow}</span>
              </span>
              <span className="flex gap-3 text-xs">
                <b>Fit {a.fit}</b>
                <b>Intent {a.intent}</b>
                <b>{a.confidence}% conf.</b>
              </span>
            </Link>
          ))}
        </section>
        <section className="space-y-4">
          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue" />
              <h2 className="font-semibold">Upcoming meetings</h2>
            </div>
            <div className="mt-4 border-l-2 border-blue pl-4">
              <p className="text-xs text-ink-muted">Today · 14:30</p>
              <p className="mt-1 text-sm font-semibold">Discovery · Alder Works</p>
              <p className="text-xs text-ink-muted">Brief ready · 3 unknowns to test</p>
            </div>
            <div className="mt-4 border-l-2 border-line pl-4">
              <p className="text-xs text-ink-muted">Friday · 10:00</p>
              <p className="mt-1 text-sm font-semibold">Proposal review · Fieldnote</p>
            </div>
          </div>
          <div className="rounded-xl bg-navy p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">
              This week&apos;s learning
            </p>
            <p className="mt-3 text-sm leading-6">
              Strategy-change signals are producing replies, but the sample is only{" "}
              <strong>n=7</strong>. Keep the current weighting and gather more evidence.
            </p>
            <Link
              href="/control/intelligence/growth"
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold"
            >
              View analysis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
