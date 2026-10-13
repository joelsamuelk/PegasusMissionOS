import { notFound } from "next/navigation";
import { ArrowDown, Info } from "lucide-react";
import {
  analyseProcessAction,
  getCapturedProcess,
  isProcessAnalysisAvailable,
} from "@/server/actions/process-intelligence";

export const maxDuration = 300;

const EVIDENCE_LABELS: Record<string, string> = {
  process_name: "process name",
  narrative: "narrative",
  friction: "friction",
  human_judgement: "human judgement",
  would_remove: "would remove",
  systems: "systems",
  sensitive_data: "sensitive data",
  effort: "effort estimate",
};

function analysisNotice(flag?: string): { tone: "ok" | "warn"; text: string } | null {
  if (!flag) return null;
  if (flag === "complete") return { tone: "ok", text: "Analysis complete." };
  if (flag === "in_progress")
    return { tone: "warn", text: "An analysis of this process is already running." };
  if (flag === "reviewed")
    return {
      tone: "warn",
      text: "An opportunity here has been reviewed, so re-analysis would discard that review.",
    };
  return { tone: "warn", text: `Analysis failed (${flag.replace("failed:", "")}). Try again.` };
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <dt className="font-semibold">{title}</dt>
      <dd>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-muted">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

export default async function ProcessDetail({
  params,
  searchParams,
}: {
  params: Promise<{ processId: string }>;
  searchParams: Promise<{ analysis?: string }>;
}) {
  const { processId } = await params,
    { analysis: flag } = await searchParams,
    [p, analysisAvailable] = await Promise.all([
      getCapturedProcess(processId),
      isProcessAnalysisAvailable(),
    ]);
  if (!p) notFound();
  const notice = analysisNotice(flag);
  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">
          {p.department ?? "Department not provided"} · Participant submission
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{p.name}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Submitted {new Date(p.submittedAt).toLocaleString("en-GB")}
          {p.participantName ? ` by ${p.participantName}` : ""}
        </p>
        {analysisAvailable && p.analysisStatus !== "processing" ? (
          <form action={analyseProcessAction} className="mt-4">
            <input type="hidden" name="processId" value={p.id} />
            <button className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">
              {p.analysis ? "Re-analyse" : "Analyse process"}
            </button>
          </form>
        ) : null}
      </header>
      {notice ? (
        <section
          className={`rounded-xl border p-4 text-sm ${notice.tone === "ok" ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
        >
          {notice.text}
        </section>
      ) : p.analysisStatus === "failed" ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The last analysis failed ({p.analysisErrorCode ?? "unknown error"}).
        </section>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Frequency", p.frequency.replaceAll("_", " ")],
          ["Duration", `${p.durationMinutes} min`],
          ["People", p.peopleCount],
          ["Annual effort", `≈ ${p.annualHours}h`],
          ["Analysis", p.analysisStatus],
        ].map(([k, v]) => (
          <div className="surface-card p-4" key={k}>
            <p className="text-xs text-ink-muted">{k}</p>
            <strong className="mt-1 block capitalize">{v}</strong>
          </div>
        ))}
      </section>
      {p.analysis ? (
        <section className="surface-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Analysis</h2>
            <p className="text-xs text-ink-muted">
              {p.analysis.model} · {p.analysis.analysisVersion} ·{" "}
              {new Date(p.analysis.createdAt).toLocaleString("en-GB")}
              {p.analysis.confidence != null
                ? ` · ${Math.round(p.analysis.confidence * 100)}% confidence`
                : ""}
            </p>
          </div>
          {p.analysis.summary ? <p className="mt-3 text-sm leading-6">{p.analysis.summary}</p> : null}
          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <List title="Evidence gaps" items={p.analysis.evidenceGaps} />
            <List title="Questions for the participant" items={p.analysis.clarifyingQuestions} />
          </dl>
        </section>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="surface-card p-5">
          <h2 className="text-lg font-semibold">Process flow</h2>
          {p.steps.length ? (
            <div className="mx-auto mt-5 max-w-xl">
              {p.steps.map((s, i) => (
                <div key={s.id}>
                  <article className="rounded-xl border border-line p-4">
                    <div className="flex justify-between">
                      <strong>{s.title}</strong>
                      <span className="rounded-full bg-blue-soft px-2 py-1 text-xs font-bold">
                        {s.classification}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">
                      {s.order}. {[s.actor, s.system].filter(Boolean).join(" · ")}
                    </p>
                    {s.reasoning ? <p className="mt-2 text-xs">{s.reasoning}</p> : null}
                  </article>
                  {i < p.steps.length - 1 ? (
                    <ArrowDown className="mx-auto my-2 h-4 w-4" />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-line p-6 text-sm text-ink-muted">
              <Info className="mb-2 h-5 w-5" />
              Awaiting structured analysis. Pegasus has not invented steps from
              insufficient evidence.
            </div>
          )}
        </section>
        <section className="surface-card p-5">
          <h2 className="text-lg font-semibold">Captured context</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-semibold">Systems</dt>
              <dd className="text-ink-muted">
                {p.systems.join(", ") || "None provided"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Friction</dt>
              <dd className="text-ink-muted">{p.friction || "Not provided"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Human judgement</dt>
              <dd className="text-ink-muted">{p.humanJudgement || "Not provided"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Sensitive information</dt>
              <dd className="text-ink-muted">
                {p.sensitiveData.join(", ") || "None declared"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Would remove</dt>
              <dd className="text-ink-muted">{p.magicRemoval || "Not provided"}</dd>
            </div>
          </dl>
        </section>
      </div>
      {p.opportunities.length ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Opportunities</h2>
            <p className="text-sm text-ink-muted">
              Drafts for review. Scores use {p.opportunities[0]?.components?.methodologyVersion ?? "pi-score-v1"};
              hours are a share of the participant&apos;s ≈ {p.annualHours}h/year estimate.
            </p>
          </div>
          {p.opportunities.map((o) => (
            <article id={`opportunity-${o.id}`} key={o.id} className="surface-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">
                    {o.type.replaceAll("_", " ")} · {o.complexity ?? "unknown"} complexity
                    {o.stepOrders.length ? ` · steps ${o.stepOrders.join(", ")}` : ""}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{o.title}</h3>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-blue">{o.score}</p>
                  <p className="text-xs text-ink-muted">
                    {o.recoverableHours != null ? `≈ ${o.recoverableHours}h/year` : ""}
                    {o.confidence != null ? ` · ${Math.round(o.confidence * 100)}% confidence` : ""}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <dt className="font-semibold">Problem</dt>
                  <dd className="text-ink-muted">{o.problem}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Proposed change</dt>
                  <dd className="text-ink-muted">{o.proposedState || "Not described"}</dd>
                </div>
                {o.benefit ? (
                  <div>
                    <dt className="font-semibold">Expected benefit</dt>
                    <dd className="text-ink-muted">{o.benefit}</dd>
                  </div>
                ) : null}
                {o.systems.length ? (
                  <div>
                    <dt className="font-semibold">Systems</dt>
                    <dd className="text-ink-muted">{o.systems.join(", ")}</dd>
                  </div>
                ) : null}
                <List title="Integrations" items={o.integrationRequirements} />
                <List title="Data needed" items={o.dataRequirements} />
                <List title="Human oversight" items={o.oversightRequirements} />
                <List title="Risks" items={o.risks} />
                <List title="Controls" items={o.controls} />
              </dl>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-semibold">How this was scored</summary>
                <ul className="mt-2 space-y-1">
                  <li className="flex justify-between gap-4 text-ink-muted">
                    <span>Baseline</span>
                    <span>+20</span>
                  </li>
                  {(o.components?.components ?? []).map((c) => (
                    <li key={c.signal} className="flex justify-between gap-4 text-ink-muted">
                      <span>{c.explanation}</span>
                      <span className={c.points < 0 ? "text-red-700" : ""}>
                        {c.points > 0 ? `+${c.points}` : c.points}
                      </span>
                    </li>
                  ))}
                </ul>
                {o.evidenceFields.length ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    Based on: {o.evidenceFields.map((f) => EVIDENCE_LABELS[f] ?? f).join(", ")}
                  </p>
                ) : null}
              </details>
            </article>
          ))}
        </section>
      ) : null}
      <details className="surface-card p-5" open>
        <summary className="cursor-pointer text-lg font-semibold">
          Source evidence
        </summary>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{p.narrative}</p>
        <p className="mt-4 text-xs text-ink-muted">
          Annual effort is an estimate based on participant-provided frequency, duration
          and people.
        </p>
      </details>
    </div>
  );
}
