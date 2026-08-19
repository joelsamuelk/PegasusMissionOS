import { DemoOutreachWorkbench } from "@/components/control-plane/demo/DemoOutreachWorkbench";
import { getControlRepository } from "@/server/control-plane";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import {
  approveOutreachAction,
  createOutreachDraftAction,
  recordContactComplianceAction,
  sendOutreachAction,
} from "@/server/actions/control-outreach";
export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const query = await searchParams;
  const ctx = await resolveControlRequestContext(),
    repo = await getControlRepository(ctx),
    prospects = await repo.prospects.list(ctx),
    people = (
      await Promise.all(prospects.map((p) => repo.prospects.people(ctx, p.id)))
    ).flat(),
    deliverablePeople = people.filter(
      (person) => person.email && person.verificationState === "verified",
    ),
    requests = await repo.outreach.sendRequests(ctx);
  return (
    <div className="space-y-10">
      {ctx.demoMode ? (
        <DemoOutreachWorkbench initialId={query.account} />
      ) : (
        <section className="surface-card p-5">
          <p className="eyebrow">Daily outreach</p>
          <h2 className="mt-2 text-lg font-semibold">No account queue yet</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            The queue is built from scored recommendations, and scoring does not run yet.
            Drafts below work against real prospects and verified contacts.
          </p>
        </section>
      )}
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Delivery queue</p>
            <h2 className="mt-1 text-xl font-semibold">Review, approve and send</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Every message is rechecked for provenance, lawful basis and suppression
              immediately before delivery.
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${process.env.OUTREACH_EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY ? "bg-success-soft text-success" : "bg-critical-soft text-critical"}`}
          >
            {process.env.OUTREACH_EMAIL_PROVIDER === "resend" &&
            process.env.RESEND_API_KEY
              ? "Resend configured"
              : "Delivery not configured"}
          </span>
        </div>
        <form
          action={createOutreachDraftAction}
          className="mt-5 grid gap-3 md:grid-cols-2"
        >
          <select
            name="personId"
            required
            className="rounded-lg border bg-surface px-3 py-2 text-sm"
          >
            <option value="">Choose verified recipient</option>
            {deliverablePeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.email}
              </option>
            ))}
          </select>
          <input
            name="subject"
            required
            placeholder="Subject"
            className="rounded-lg border bg-surface px-3 py-2 text-sm"
          />
          <textarea
            name="body"
            required
            placeholder="Founder-written message"
            className="min-h-32 rounded-lg border bg-surface p-3 text-sm md:col-span-2"
          />
          <button className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white md:col-span-2">
            Create approval request
          </button>
        </form>
        <details className="mt-5 rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-bold">
            Record contact provenance and lawful basis
          </summary>
          <form
            action={recordContactComplianceAction}
            className="mt-4 grid gap-3 md:grid-cols-2"
          >
            <select
              name="personId"
              required
              className="rounded-lg border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Choose verified recipient</option>
              {deliverablePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.email}
                </option>
              ))}
            </select>
            <input
              name="sourceUrl"
              type="url"
              required
              placeholder="Public source URL for this work email"
              className="rounded-lg border bg-surface px-3 py-2 text-sm"
            />
            <select
              name="lawfulBasis"
              required
              defaultValue="legitimate_interests"
              className="rounded-lg border bg-surface px-3 py-2 text-sm"
            >
              <option value="legitimate_interests">Legitimate interests</option>
              <option value="consent">Consent</option>
              <option value="contract">Contract</option>
              <option value="none_recorded">None recorded</option>
            </select>
            <input
              name="lawfulBasisNote"
              required
              placeholder="Why this outreach is relevant to their professional role"
              className="rounded-lg border bg-surface px-3 py-2 text-sm"
            />
            <button className="rounded-lg border px-4 py-2 text-sm font-bold md:col-span-2">
              Save compliance record
            </button>
          </form>
        </details>
        <div className="mt-6 space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-ink-muted">No persisted outreach requests yet.</p>
          ) : (
            requests.map((request) => (
              <article key={request.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <b className="text-sm">{request.subject}</b>
                    <p className="mt-1 text-xs text-ink-muted">
                      {people.find((p) => p.id === request.prospectPersonId)?.name ??
                        "Unknown recipient"}{" "}
                      · {request.state.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {request.state === "pending_approval" ? (
                      <form action={approveOutreachAction}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <button className="rounded-lg border px-3 py-2 text-xs font-bold">
                          Approve after compliance check
                        </button>
                      </form>
                    ) : null}
                    {request.state === "approved" || request.state === "failed" ? (
                      <form action={sendOutreachAction}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <button className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white">
                          {request.state === "failed" ? "Retry delivery" : "Send now"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
                {request.blockedReason ? (
                  <p className="mt-3 text-xs text-critical">{request.blockedReason}</p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
