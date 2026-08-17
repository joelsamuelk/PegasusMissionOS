import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Handshake, Users } from "lucide-react";
import { formatCurrencyCompact, formatDate } from "@/lib/formatting";
import { personName } from "@/lib/logic/relationship-brief";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { buildRelationshipPortfolio } from "@/server/services/relationships";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { EmptyState, MetricPanel } from "@/components/shared/misc";
import {
  RelationshipHealthBadge,
  RoleChips,
} from "@/components/relationships/RelationshipBadges";

export const metadata: Metadata = { title: "Relationships" };

/**
 * The relationships home.
 *
 * Deliberately not "Contacts: 4,321". A count of records is not information.
 * What matters on opening this page is which relationships need something from
 * you today and why — everything else is available one click away.
 */
export default async function RelationshipsPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const [portfolio, people, organisations] = await Promise.all([
    buildRelationshipPortfolio(ctx, repo),
    repo.relationships.listPeople(ctx),
    repo.relationships.listOrganisations(ctx),
  ]);
  // Resolved from the organisation record, not from the portfolio: a person
  // whose employer has no relationship record yet still has an employer.
  const organisationNames = new Map(organisations.map((o) => [o.id, o.name]));
  const now = ctx.now();

  return (
    <div>
      <PageHeader
        eyebrow="Relationships"
        title="Who we know, and what we owe them"
        description="Funders, partners, evaluators and stakeholders in one place, connected to the grants, programmes and commitments they relate to."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricPanel
          label="Active funders"
          value={portfolio.counts.activeFunders}
          hint={`${portfolio.counts.prospectiveFunders} prospective`}
          icon={Handshake}
        />
        <MetricPanel
          label="Delivery partners"
          value={portfolio.counts.deliveryPartners}
          hint="Delivering or referring into programmes"
          icon={Users}
        />
        <MetricPanel
          label="Open commitments"
          value={portfolio.counts.openCommitments}
          hint={
            portfolio.counts.overdueCommitments > 0
              ? `${portfolio.counts.overdueCommitments} past the agreed date`
              : "All within their agreed dates"
          }
          tone={portfolio.counts.overdueCommitments > 0 ? "warning" : "neutral"}
        />
        <MetricPanel
          label="Needs attention"
          value={portfolio.counts.needsAttention}
          hint="Overdue promises or long silences"
          tone={portfolio.counts.needsAttention > 0 ? "warning" : "success"}
        />
      </div>

      {portfolio.needsAttention.length > 0 && (
        <Card className="mt-6">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-title font-semibold text-ink">Needs attention</h2>
          </div>
          <ul>
            {portfolio.needsAttention.map((s) => (
              <li key={s.relationship.id} className="border-b border-line last:border-0">
                <Link
                  href={`/relationships/${s.organisation.id}`}
                  className="group flex items-start gap-3 px-5 py-3 hover:bg-surface-sunken/50"
                >
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-warning" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {s.organisation.name}
                      <ArrowUpRight className="h-3.5 w-3.5 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="text-sm text-ink-muted">{s.health.reason}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <CardBody className="border-t border-line py-3">
            <p className="text-xs text-ink-subtle">
              Only relationships with an overdue commitment, a missed next action, or live work
              that has gone quiet appear here. Nothing is listed to create urgency.
            </p>
          </CardBody>
        </Card>
      )}

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="font-heading text-title font-semibold text-ink">
            All relationships
          </h2>
          <span className="text-xs text-ink-subtle">
            {portfolio.summaries.length} organisations · {people.length} people
          </span>
        </div>

        {portfolio.summaries.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No relationships recorded yet"
            description="Funders, delivery partners and evaluators recorded here connect to the grants and programmes they relate to."
          />
        ) : (
          <div className="grid gap-3">
            {portfolio.summaries.map((s) => (
              <Card key={s.relationship.id} className="transition-shadow hover:shadow-elev-2">
                <Link href={`/relationships/${s.organisation.id}`}>
                  <CardBody>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-title font-semibold text-ink">
                            {s.organisation.name}
                          </h3>
                          <RelationshipHealthBadge state={s.health.state} />
                        </div>
                        <div className="mt-2">
                          <RoleChips roles={s.relationship.roles} limit={3} />
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
                          {s.primaryContact && (
                            <span>{personName(s.primaryContact)}</span>
                          )}
                          {s.ownerName && <span>Owner: {s.ownerName}</span>}
                          <span>
                            {s.lastInteractionAt
                              ? `Last contact ${formatDate(s.lastInteractionAt.slice(0, 10))}`
                              : "No contact recorded"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 gap-6 text-right">
                        <Stat
                          label="Funding"
                          value={
                            s.totalFunding > 0
                              ? formatCurrencyCompact(s.totalFunding)
                              : "—"
                          }
                          hint={
                            s.activeGrantCount > 0
                              ? `${s.activeGrantCount} active`
                              : undefined
                          }
                        />
                        <Stat
                          label="Commitments"
                          value={String(s.openCommitmentCount)}
                          hint={
                            s.overdueCommitmentCount > 0
                              ? `${s.overdueCommitmentCount} overdue`
                              : undefined
                          }
                          warn={s.overdueCommitmentCount > 0}
                        />
                      </div>
                    </div>
                  </CardBody>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-heading text-title font-semibold text-ink">People</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <Card key={person.id} className="transition-shadow hover:shadow-elev-2">
              <Link href={`/relationships/people/${person.id}`}>
                <CardBody>
                  <div className="text-sm font-medium text-ink">{personName(person)}</div>
                  {person.jobTitle && (
                    <div className="mt-0.5 text-xs text-ink-muted">{person.jobTitle}</div>
                  )}
                  <div className="mt-2 text-xs text-ink-subtle">
                    {(person.primaryExternalOrganisationId
                      ? organisationNames.get(person.primaryExternalOrganisationId)
                      : undefined) ?? "No organisation recorded"}
                  </div>
                </CardBody>
              </Link>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          Contact details are held only where there is a recorded lawful basis, and are shown
          on each person&rsquo;s page. Data last reviewed against the workspace clock:{" "}
          {formatDate(now.toISOString().slice(0, 10))}.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-heading text-title font-semibold text-ink">{value}</div>
      {hint && (
        <div className={warn ? "text-xs text-warning" : "text-xs text-ink-subtle"}>{hint}</div>
      )}
    </div>
  );
}
