"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Lightbulb,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { rankedAccounts } from "@/lib/commercial/demo-data";
export function DemoOutreachWorkbench({ initialId }: { initialId?: string }) {
  const start = Math.max(
    0,
    rankedAccounts.findIndex((a) => a.id === initialId),
  );
  const [index, setIndex] = useState(start);
  const [draft, setDraft] = useState(false);
  const a = rankedAccounts[index]!;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            Daily outreach · {index + 1} of {rankedAccounts.length}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            A reason to start a conversation
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Small volume, strong evidence, human judgement.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={index === 0}
            onClick={() => {
              setIndex((i) => i - 1);
              setDraft(false);
            }}
            className="rounded-lg border bg-surface p-2 disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            disabled={index === rankedAccounts.length - 1}
            onClick={() => {
              setIndex((i) => i + 1);
              setDraft(false);
            }}
            className="rounded-lg border bg-surface p-2 disabled:opacity-30"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
        <aside className="surface-card overflow-hidden">
          <div className="border-b bg-navy p-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-white/55">Priority {a.priority}</p>
                <h2 className="mt-1 text-xl font-semibold">{a.name}</h2>
                <p className="text-xs text-white/60">
                  {a.domain} · {a.location}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold">
                {a.motion === "studio" ? "STUDIO" : "MISSION OS"}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ["Fit", a.fit],
                ["Intent", a.intent],
                ["Confidence", `${a.confidence}%`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-white/10 p-2 text-center">
                  <b className="block text-lg">{v}</b>
                  <span className="text-[10px] text-white/60">{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5">
            <p className="eyebrow">Who matters</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="rounded-full bg-blue-soft p-2 text-blue">
                <UserRound className="h-4 w-4" />
              </span>
              <div>
                <b className="text-sm">{a.person}</b>
                <p className="text-xs text-ink-muted">
                  {a.role} · likely{" "}
                  {a.role.includes("Technology") ? "technical buyer" : "champion"}
                </p>
              </div>
            </div>
            <button className="mt-4 text-xs font-bold text-blue">
              Who can introduce me?
            </button>
            <div className="my-5 border-t" />
            <p className="eyebrow">Unknowns: do not assume</p>
            <ul className="mt-3 space-y-2">
              {a.unknowns.map((x) => (
                <li key={x} className="flex gap-2 text-xs text-ink-muted">
                  <span>?</span>
                  {x}
                </li>
              ))}
            </ul>
            <div className="my-5 border-t" />
            <p className="text-xs text-ink-muted">Last interaction</p>
            <p className="mt-1 text-sm font-semibold">{a.lastInteraction}</p>
            <Link
              href="/control/prospects"
              className="mt-5 flex items-center gap-2 text-xs font-bold text-blue"
            >
              Open full account <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </aside>
        <main className="space-y-4">
          <section className="surface-card p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">What happened</p>
              <span className="rounded-full bg-success-soft px-2 py-1 text-[10px] font-bold text-success">
                SOURCED FACT
              </span>
            </div>
            <p className="mt-3 text-lg font-semibold">{a.whyNow}</p>
            <a
              href={a.sourceUrl}
              className="mt-3 inline-flex items-center gap-1 text-xs text-blue"
            >
              {a.source} <ExternalLink className="h-3 w-3" />
            </a>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="surface-card p-5">
              <p className="eyebrow">Why they fit</p>
              <h3 className="mt-2 font-semibold">{a.icp}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                The organisation matches the sector and maturity rules, with current
                evidence for both need and timing.
              </p>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-bold text-blue">
                  Why this is ranked
                </summary>
                <div className="mt-2 space-y-2">
                  <p>ICP alignment · {a.fit}/100</p>
                  <p>Current trigger · {a.intent}/100</p>
                  <p>Evidence coverage · {a.confidence}%</p>
                </div>
              </details>
            </section>
            <section className="surface-card p-5">
              <p className="eyebrow">Suggested hypothesis</p>
              <div className="mt-3 flex gap-3">
                <Lightbulb className="h-5 w-5 flex-none text-warning" />
                <p className="text-sm leading-6">{a.angle}</p>
              </div>
              <p className="mt-3 text-[11px] text-ink-muted">
                A question to test, not a known problem.
              </p>
            </section>
          </div>
          <section className="surface-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Relevant Pegasus proof</p>
                <h3 className="mt-1 font-semibold">
                  A credible reason for Pegasus to help
                </h3>
              </div>
              <span className="rounded-lg bg-accent-soft p-2 text-accent-ink">
                <Check className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              {a.motion === "mission_os"
                ? "Mission OS connects funding, delivery, evidence and relationships without replacing human judgement."
                : "Pegasus designs and delivers complex digital products and intelligent systems alongside leadership teams."}
            </p>
          </section>
          {draft ? (
            <section className="surface-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Draft email</p>
                  <h3 className="mt-1 font-semibold">Review before use</h3>
                </div>
                <span className="flex items-center gap-1 text-[11px] text-success">
                  <ShieldCheck className="h-3 w-3" />
                  Human approval required
                </span>
              </div>
              <input
                className="mt-4 w-full rounded-lg border bg-surface px-3 py-2 text-sm font-semibold"
                defaultValue={`A question about ${a.name}`}
              />
              <textarea
                className="mt-3 min-h-48 w-full rounded-lg border bg-surface p-3 text-sm leading-6"
                defaultValue={`Hi ${a.person.split(" ")[0]},\n\nI noticed ${a.whyNow.charAt(0).toLowerCase() + a.whyNow.slice(1)}\n\nIt made me wonder whether ${a.angle.charAt(0).toLowerCase() + a.angle.slice(1)}\n\nWe work with teams on precisely this intersection, while keeping delivery grounded in the operating reality. Would a 20-minute conversation be useful to compare notes?\n\nJoel`}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
                  <Copy className="h-4 w-4" />
                  Copy draft
                </button>
                <button className="rounded-lg border px-4 py-2 text-sm font-bold">
                  Save for approval
                </button>
                <span className="self-center text-xs text-ink-muted">
                  Sending is not configured.
                </span>
              </div>
            </section>
          ) : (
            <button
              onClick={() => setDraft(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-coral"
            >
              <Mail className="h-4 w-4" />
              Draft grounded outreach
            </button>
          )}
          <div className="flex justify-between text-xs">
            <button className="text-ink-muted">Skip for today</button>
            <div className="flex gap-4">
              <button>Nurture</button>
              <button>Find another person</button>
              <button className="text-critical">Disqualify</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
