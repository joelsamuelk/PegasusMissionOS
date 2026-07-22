import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { formatCurrency, formatDate, humanise } from "@/lib/formatting";
import { q } from "@/features/store";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { DeadlineIndicator } from "@/components/shared/misc";
import { GrantHealthSummary } from "@/components/grants/GrantHealthSummary";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: q.grant(id)?.title ?? "Grant" };
}

const DEMO_NOW = new Date("2026-07-21T10:00:00Z");

export default async function GrantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const grant = q.grant(id);
  if (!grant) notFound();

  const funder = q.funder(grant.funderId);
  const manager = q.user(grant.grantManagerId);
  const payments = q.grantPayments(grant.id);
  const deliverables = q.grantDeliverables(grant.id);
  const reports = q.grantReports(grant.id);
  const programme = q
    .programmes()
    .find((p) => q.programmeGrants(p.id).some((g) => g.id === grant.id));
  const health = computeGrantHealth({
    grant,
    deliverables,
    reports,
    linkedEvidenceCount: q.evidenceForTarget("grant", grant.id).length,
    now: DEMO_NOW,
  });
  const remaining = grant.awardValue - grant.spentToDate;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Grants", href: "/grants" }, { label: grant.title }]}
        eyebrow={funder?.name}
        title={grant.title}
        description={`${grant.restricted ? "Restricted" : "Unrestricted"} grant · ${formatDate(grant.startDate)} to ${formatDate(grant.endDate)}`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Award value" value={formatCurrency(grant.awardValue)} />
        <MetricCard label="Spent to date" value={formatCurrency(grant.spentToDate)} />
        <MetricCard label="Remaining balance" value={formatCurrency(remaining)} />
        <MetricCard
          label="Next report"
          value={reports.find((r) => r.status !== "submitted")?.title ?? "None due"}
          small
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <GrantHealthSummary health={health} />

          {/* Deliverables */}
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Deliverables</h2>
            </div>
            <ul className="divide-y divide-line">
              {deliverables.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium text-ink">{d.title}</div>
                    <div className="mt-0.5">
                      <DeadlineIndicator deadline={d.dueDate} now={DEMO_NOW} />
                    </div>
                  </div>
                  <EntityStatusBadge status={d.status === "overdue" ? "at_risk" : d.status === "complete" ? "approved" : "in_progress"} />
                </li>
              ))}
            </ul>
          </Card>

          {/* Reports */}
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Reporting schedule</h2>
            </div>
            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium text-ink">{r.title}</div>
                    <div className="mt-0.5">
                      <DeadlineIndicator deadline={r.dueDate} now={DEMO_NOW} />
                    </div>
                  </div>
                  <span className="text-xs capitalize text-ink-muted">
                    {humanise(r.status)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardBody className="flex flex-col gap-3 text-sm">
              <Row label="Status" value={<EntityStatusBadge status={health.state} />} />
              <Row label="Grant manager" value={manager?.name ?? "-"} />
              <Row label="Funder contact" value={grant.funderContact ?? "-"} />
              <Row label="Start date" value={formatDate(grant.startDate)} />
              <Row label="End date" value={formatDate(grant.endDate)} />
              {programme && (
                <Row
                  label="Programme"
                  value={
                    <Link href={`/programmes/${programme.id}`} className="text-accent hover:underline">
                      {programme.name}
                    </Link>
                  }
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Payment schedule</h3>
            </div>
            <ul className="divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <div className="text-ink">{p.label}</div>
                    <div className="text-xs text-ink-subtle">{formatDate(p.dueDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-ink">{formatCurrency(p.amount)}</div>
                    <div
                      className={cn(
                        "flex items-center justify-end gap-1 text-xs",
                        p.received ? "text-success" : "text-ink-subtle",
                      )}
                    >
                      {p.received && <Check className="h-3 w-3" />}
                      {p.received ? "Received" : "Due"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Conditions</h3>
            </div>
            <ul className="divide-y divide-line">
              {grant.conditions.map((c, i) => (
                <li key={i} className="px-4 py-2.5 text-sm text-ink-muted">
                  {c}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <Card>
      <CardBody>
        <div className="eyebrow">{label}</div>
        <div
          className={cn(
            "mt-1.5 font-medium text-ink",
            small ? "text-sm" : "font-serif text-heading",
          )}
        >
          {value}
        </div>
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
