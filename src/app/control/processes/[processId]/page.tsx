import { notFound } from "next/navigation";
import { ArrowDown, Info } from "lucide-react";
import { getCapturedProcess } from "@/server/actions/process-intelligence";
export default async function ProcessDetail({
  params,
}: {
  params: Promise<{ processId: string }>;
}) {
  const { processId } = await params,
    p = await getCapturedProcess(processId);
  if (!p) notFound();
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
      </header>
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
                      {[s.actor, s.system].filter(Boolean).join(" · ")}
                    </p>
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
