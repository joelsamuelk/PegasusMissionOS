import Link from "next/link";
import { ArrowRight, CircleAlert, ClipboardList, Search, Sparkles } from "lucide-react";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";
import {
  formatPounds,
  summariseCommandCentre,
} from "@/server/control-plane/command-centre";
import { DemoCommandCentre } from "@/components/control-plane/demo/DemoCommandCentre";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export default async function ControlCommandCentrePage() {
  const ctx = await resolveControlRequestContext();
  if (ctx.demoMode) return <DemoCommandCentre />;

  const repo = await getControlRepository(ctx);
  const [prospects, opportunities, tasks] = await Promise.all([
    repo.prospects.list(ctx),
    repo.sales.opportunities(ctx),
    repo.tasks.list(ctx),
  ]);
  const now = ctx.now();
  const summary = summariseCommandCentre({ prospects, opportunities, tasks, now });

  const metrics: [string, string, string][] = [
    [
      "Pipeline value",
      formatPounds(summary.pipelineValue),
      summary.pipelineValue === null
        ? "No opportunity carries a value"
        : `${summary.openOpportunities} open opportunities`,
    ],
    [
      "Weighted pipeline",
      formatPounds(summary.weightedPipelineValue),
      summary.weightedPipelineValue === null
        ? "Needs a value and a probability"
        : "Value multiplied by probability",
    ],
    [
      "Qualified opportunities",
      String(summary.qualifiedOpportunities),
      `of ${plural(summary.openOpportunities, "open opportunity", "open opportunities")}`,
    ],
    ["Proposals open", String(summary.proposalsOpen), "Stage: proposal"],
    ["Clients won", String(summary.clientsWon), "Stage: won"],
    [
      "Prospects",
      String(summary.prospects),
      `${summary.awaitingResearch} awaiting research`,
    ],
    [
      "Open tasks",
      String(summary.openTasks),
      summary.overdueTasks ? `${summary.overdueTasks} overdue` : "None overdue",
    ],
  ];

  const priorities: [string, string, typeof Search, string][] = [];
  if (summary.overdueTasks)
    priorities.push([
      `${plural(summary.overdueTasks, "overdue task")}`,
      "Past their due date",
      CircleAlert,
      "/control/tasks",
    ]);
  if (summary.openTasks - summary.overdueTasks > 0)
    priorities.push([
      `${plural(summary.openTasks - summary.overdueTasks, "open task")}`,
      "Not yet due",
      ClipboardList,
      "/control/tasks",
    ]);
  if (summary.awaitingResearch)
    priorities.push([
      `${plural(summary.awaitingResearch, "organisation")} awaiting research`,
      "Discovered, not yet assessed",
      Search,
      "/control/prospects",
    ]);
  if (summary.openOpportunities - summary.opportunitiesWithNextAction > 0)
    priorities.push([
      `${plural(summary.openOpportunities - summary.opportunitiesWithNextAction, "opportunity", "opportunities")} without a next action`,
      "Open with nothing planned",
      Sparkles,
      "/control/pipeline",
    ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {now.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Who matters today?</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Every figure below is counted from records in this Control Plane. Nothing is
            estimated.
          </p>
        </div>
        <Link
          href="/control/prospects/discover"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-coral"
        >
          Manage discovery <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {metrics.map(([label, value, note]) => (
          <div key={label} className="surface-card p-4">
            <p className="text-xs font-semibold text-ink-muted">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-[11px] text-ink-subtle">{note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="eyebrow">Today&apos;s priorities</p>
              <h2 className="mt-1 text-xl font-semibold">
                What the records are asking for
              </h2>
            </div>
          </div>
          {priorities.length === 0 ? (
            <p className="surface-card p-5 text-sm text-ink-muted">
              Nothing is outstanding. No overdue tasks, no unassessed organisations and no
              open opportunity without a next action.
            </p>
          ) : (
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
          )}
        </section>

        <section className="surface-card p-5">
          <p className="eyebrow">Recommended accounts</p>
          <h2 className="mt-2 text-lg font-semibold">Not ranked yet</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Ranking needs scored recommendations, and scoring does not run yet. Discovered
            organisations are listed in date order on Today.
          </p>
          <Link
            href="/control/today"
            className="mt-4 inline-block text-sm font-semibold text-blue"
          >
            Open Today
          </Link>
        </section>
      </div>
    </div>
  );
}
