import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  FileText,
  Handshake,
  Landmark,
  Library,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { formatCurrencyCompact } from "@/lib/formatting";
import { profileCompleteness } from "@/lib/logic/progress";
import {
  dashboardMetrics,
  upcomingDeadlines,
  weeklyPriorities,
} from "@/features/dashboard/selectors";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { DeadlineIndicator, MetricPanel, ProgressMeter } from "@/components/shared/misc";
import { ActivityFeed } from "@/components/shared/ActivityFeed";
import { TaskListWidget } from "@/components/shared/TaskListWidget";
import { RelationshipHealthBadge } from "@/components/relationships/RelationshipBadges";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { buildRelationshipPortfolio } from "@/server/services/relationships";

export const metadata: Metadata = { title: "Command Centre" };

const TONE_DOT: Record<string, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  info: "bg-accent",
};

export default async function DashboardPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const now = ctx.now();

  // Relationship attention feeds Mission Control. Only relationships with an
  // overdue commitment, a missed next action or live work that has gone quiet
  // appear — nothing is surfaced merely to generate activity.
  const [org, profile, m, priorities, allDeadlines, tasks, users, activity, portfolio] =
    await Promise.all([
      repo.organisations.get(ctx),
      repo.organisations.profile(ctx),
      dashboardMetrics(ctx, repo),
      weeklyPriorities(ctx, repo),
      upcomingDeadlines(ctx, repo),
      repo.workspace.openTasks(ctx),
      repo.organisations.users(ctx),
      repo.workspace.activity(ctx),
      buildRelationshipPortfolio(ctx, repo),
    ]);

  if (!org || !profile) return null;

  const deadlines = allDeadlines.slice(0, 5);
  const needsAttention = portfolio.needsAttention.slice(0, 4);

  return (
    <div>
      <PageHeader
        eyebrow="Command Centre"
        title={`Good morning. Here is where ${org.name} stands.`}
        description="Your organisation's funding, delivery and reporting position for the week. Ask Pegasus Intelligence anything using the command bar above."
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricPanel
          label="Funding pipeline"
          value={formatCurrencyCompact(m.pipelineValue)}
          hint={`${m.pipelineCount} live opportunities`}
          icon={Target}
          href="/funding"
        />
        <MetricPanel
          label="Applications in progress"
          value={m.inProgressCount}
          hint="Being drafted or reviewed"
          icon={FileText}
          href="/applications"
        />
        <MetricPanel
          label="Active grants"
          value={m.activeGrantsCount}
          hint={`${formatCurrencyCompact(m.securedThisYear)} secured this year`}
          icon={Landmark}
          href="/grants"
        />
        <MetricPanel
          label="Reports due"
          value={m.reportsDue}
          hint={`${m.outcomesAwaitingEvidence} outcomes awaiting evidence`}
          tone={m.reportsDue > 0 ? "warning" : "neutral"}
          icon={TrendingUp}
          href="/impact"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left: priorities + deadlines */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* AI priorities */}
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h2 className="text-title font-semibold text-ink">Priorities for the week</h2>
              </div>
              <span className="eyebrow">AI generated</span>
            </div>
            <CardBody className="pt-2">
              <p className="mb-3 text-xs text-ink-subtle">
                Derived from your live deadlines, review states and grant health. Review
                and adjust as needed.
              </p>
              <ul className="flex flex-col">
                {priorities.map((p, i) => (
                  <li key={i} className="border-b border-line last:border-0">
                    <Link
                      href={p.href}
                      className="group flex items-start gap-3 py-3 transition-colors hover:bg-surface-sunken/50"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${TONE_DOT[p.tone]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                          {p.title}
                          <ArrowUpRight className="h-3.5 w-3.5 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div className="text-sm text-ink-muted">{p.detail}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* Deadlines */}
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-ink-subtle" />
                <h2 className="text-title font-semibold text-ink">Upcoming deadlines</h2>
              </div>
              <Link href="/funding" className="text-xs font-medium text-info hover:underline">
                View all
              </Link>
            </div>
            <ul>
              {deadlines.map((d) => (
                <li key={d.id} className="border-b border-line last:border-0">
                  <Link
                    href={d.href}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-sunken/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{d.label}</div>
                      <div className="truncate text-xs text-ink-subtle">{d.sublabel}</div>
                    </div>
                    <DeadlineIndicator deadline={d.deadline} now={now} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Right: relationships + tasks + activity */}
        <div className="flex flex-col gap-6">
          {needsAttention.length > 0 && (
            <Card>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-ink-subtle" />
                  <h2 className="text-title font-semibold text-ink">
                    Relationships needing attention
                  </h2>
                </div>
                <Link
                  href="/relationships"
                  className="text-xs font-medium text-info hover:underline"
                >
                  View all
                </Link>
              </div>
              <ul>
                {needsAttention.map((s) => (
                  <li key={s.relationship.id} className="border-b border-line last:border-0">
                    <Link
                      href={`/relationships/${s.organisation.id}`}
                      className="block px-5 py-3 hover:bg-surface-sunken/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">
                          {s.organisation.name}
                        </span>
                        <RelationshipHealthBadge state={s.health.state} />
                      </div>
                      <p className="mt-0.5 text-sm text-ink-muted">{s.health.reason}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Your tasks</h2>
            </div>
            <CardBody className="py-2">
              <TaskListWidget tasks={tasks} users={users} now={now} />
            </CardBody>
          </Card>

          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Recent activity</h2>
            </div>
            <CardBody className="py-2">
              <ActivityFeed events={activity} now={now} limit={6} />
            </CardBody>
          </Card>

          <Card className="bg-surface-sunken">
            <CardBody>
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-ink-subtle" />
                <span className="eyebrow">Organisation readiness</span>
              </div>
              <ProgressMeter
                className="mt-3"
                value={profileCompleteness(profile).score}
                label="Profile completeness"
                tone="accent"
              />
              <Link
                href="/organisation"
                className="mt-3 inline-block text-xs font-medium text-info hover:underline"
              >
                Complete your organisation profile
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
