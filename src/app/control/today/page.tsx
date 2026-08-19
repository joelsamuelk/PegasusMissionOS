import Link from "next/link";
import { canControl } from "@/lib/control-plane/permissions";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";
import { DemoToday } from "@/components/control-plane/demo/DemoToday";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export default async function TodayPage() {
  const ctx = await resolveControlRequestContext();
  if (ctx.demoMode) return <DemoToday />;

  const repo = await getControlRepository(ctx);
  if (!canControl(ctx.role, "prospect:view"))
    throw new Error("Prospect access required.");
  const prospects = await repo.prospects.list(ctx);
  const discovered = prospects.filter((prospect) => prospect.status === "discovered");
  const researchable = discovered.filter((prospect) => prospect.website);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Focus</p>
          <h1 className="mt-2 text-3xl font-semibold">
            Who deserves your attention today?
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {plural(prospects.length, "organisation")} recorded · {discovered.length}{" "}
            awaiting research · {researchable.length} with a website research can run
            against.
          </p>
        </div>
        <Link
          href="/control/prospects/discover"
          className="rounded-lg border bg-surface px-4 py-2 text-sm font-bold"
        >
          Manage discovery
        </Link>
      </header>

      <section className="surface-card p-6">
        <p className="eyebrow">Recommendations</p>
        <h2 className="mt-2 text-xl font-semibold">Nothing is ranked yet</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Ranking needs a scored recommendation, and scoring does not run yet. Discovery
          records organisations; nothing has assessed fit, intent or confidence for them,
          so this page will not put an order on them.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          {discovered.length === 0
            ? "No organisations have been discovered yet either. Run a pilot discovery job to create some."
            : `${plural(discovered.length, "organisation")} awaiting research. Research each one to gather the evidence a score would need.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/control/prospects/discover"
            className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white"
          >
            Discover organisations
          </Link>
          <Link
            href="/control/prospects"
            className="rounded-lg border px-4 py-2 text-sm font-bold"
          >
            Open prospects
          </Link>
        </div>
      </section>

      {discovered.length > 0 && (
        <section className="surface-card overflow-hidden">
          <div className="border-b p-5">
            <h2 className="font-semibold">Awaiting research</h2>
            <p className="text-xs text-ink-muted">
              Listed in the order they were discovered, not by priority.
            </p>
          </div>
          {discovered.slice(0, 10).map((prospect) => (
            <Link
              key={prospect.id}
              href={`/control/prospects/${prospect.id}`}
              className="flex flex-wrap items-center justify-between gap-3 border-b p-5 last:border-0 hover:bg-surface-sunken"
            >
              <span>
                <strong>{prospect.name}</strong>
                <span className="mt-1 block text-xs text-ink-muted">
                  {prospect.country ?? "Country not recorded"} · {prospect.source}
                </span>
              </span>
              <span className="text-xs text-ink-muted">
                {prospect.website ? "Ready to research" : "No website recorded"}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
