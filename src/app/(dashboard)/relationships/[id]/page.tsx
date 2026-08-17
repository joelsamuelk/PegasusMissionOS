import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatting";
import { personName } from "@/lib/logic/relationship-brief";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { buildRelationshipView, hrefForEntity } from "@/server/services/relationships";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { DeadlineIndicator } from "@/components/shared/misc";
import {
  RelationshipHealthBadge,
  RelationshipStatusBadge,
  RoleChips,
} from "@/components/relationships/RelationshipBadges";
import { RelationshipHealthPanel } from "@/components/relationships/RelationshipHealthPanel";
import { RelationshipTimeline } from "@/components/relationships/RelationshipTimeline";
import { RelationshipBriefPanel } from "@/components/relationships/RelationshipBriefPanel";
import { CommitmentList } from "@/components/relationships/CommitmentList";
import { LogInteractionForm } from "@/components/relationships/LogInteractionForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const organisation = await getRepository().relationships.getOrganisation(ctx, id);
  return { title: organisation?.name ?? "Relationship" };
}

/**
 * The relationship page.
 *
 * It answers, in order: who are they, why do they matter, what are we doing
 * together, when did we last speak, what money is involved, what impact is
 * involved, what have we promised, what have they promised, what happens next.
 *
 * Everything on it is read from records the rest of Mission OS already owns —
 * grants from the funding module, programmes from the programme module,
 * reports from reporting. This page joins them; it does not copy them.
 */
export default async function RelationshipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const view = await buildRelationshipView(ctx, getRepository(), id);
  if (!view) notFound();

  const now = ctx.now();
  const nowIso = now.toISOString();
  const { organisation, relationship, health } = view;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Relationships", href: "/relationships" },
          { label: organisation.name },
        ]}
        eyebrow={organisation.type.replace(/_/g, " ")}
        title={organisation.name}
        description={organisation.description}
        actions={
          <div className="flex items-center gap-2">
            {relationship && <RelationshipStatusBadge status={relationship.status} />}
            <RelationshipHealthBadge state={health.state} />
          </div>
        }
      />

      {relationship && (
        <div className="mb-6">
          <RoleChips roles={relationship.roles} />
        </div>
      )}

      {/* The nine questions, answered in one row. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          label="Funding"
          value={view.totalFunding > 0 ? formatCurrency(view.totalFunding) : "None recorded"}
          hint={
            view.activeFunding > 0
              ? `${formatCurrency(view.activeFunding)} currently active`
              : `${view.grants.length} grant${view.grants.length === 1 ? "" : "s"}`
          }
        />
        <Summary
          label="Last contact"
          value={
            health.lastInteractionAt
              ? formatDate(health.lastInteractionAt.slice(0, 10))
              : "Not recorded"
          }
          hint={
            health.daysSinceLastInteraction !== undefined
              ? `${health.daysSinceLastInteraction} days ago`
              : undefined
          }
        />
        <Summary
          label="Open commitments"
          value={String(view.openCommitments.length)}
          hint={
            view.overdueCommitments.length > 0
              ? `${view.overdueCommitments.length} overdue`
              : "All within their dates"
          }
          warn={view.overdueCommitments.length > 0}
        />
        <Summary
          label="Next"
          value={relationship?.nextAction ?? "Nothing scheduled"}
          hint={relationship?.nextActionAt ? formatDate(relationship.nextActionAt) : undefined}
          small
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <RelationshipBriefPanel brief={view.brief} />

          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Timeline</h2>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Projected from grants, applications, reports, commitments and recorded
                interactions. Nothing here is stored twice.
              </p>
            </div>
            <div className="border-b border-line">
              <LogInteractionForm
                externalOrganisationId={organisation.id}
                people={view.people}
                defaultDate={nowIso.slice(0, 10)}
              />
            </div>
            <RelationshipTimeline events={view.timeline} limit={18} />
          </Card>

          {view.grants.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-title font-semibold text-ink">Funding</h2>
              </div>
              <ul className="divide-y divide-line">
                {view.grants.map((grant) => (
                  <li key={grant.id}>
                    <Link
                      href={`/grants/${grant.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-sunken/50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">{grant.title}</div>
                        <div className="text-xs text-ink-subtle">
                          {formatDate(grant.startDate)} to {formatDate(grant.endDate)}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-3">
                        <span className="text-sm font-medium text-ink">
                          {formatCurrency(grant.awardValue, grant.currency)}
                        </span>
                        <EntityStatusBadge status={grant.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(view.applications.length > 0 || view.opportunities.length > 0) && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-title font-semibold text-ink">
                  Applications and opportunities
                </h2>
              </div>
              <ul className="divide-y divide-line">
                {view.applications.map((application) => (
                  <li key={application.id}>
                    <Link
                      href={`/applications/${application.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-sunken/50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">{application.title}</div>
                        {application.deadline && (
                          <DeadlineIndicator deadline={application.deadline} now={now} />
                        )}
                      </div>
                      <EntityStatusBadge status={application.status} />
                    </Link>
                  </li>
                ))}
                {view.opportunities
                  .filter(
                    (o) => !view.applications.some((a) => a.opportunityId === o.id),
                  )
                  .map((opportunity) => (
                    <li key={opportunity.id}>
                      <Link
                        href={`/funding/${opportunity.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-sunken/50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink">
                            {opportunity.programmeName}
                          </div>
                          <DeadlineIndicator deadline={opportunity.deadline} now={now} />
                        </div>
                        <EntityStatusBadge status={opportunity.stage} />
                      </Link>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Commitments</h2>
            </div>
            <CommitmentList
              commitments={[...view.openCommitments, ...view.commitments.filter((c) => c.status === "completed")]}
              now={nowIso}
            />
          </Card>

          <RelationshipHealthPanel health={health} />

          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">People</h2>
            </div>
            {view.people.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-subtle">
                No named contact recorded for this organisation.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {view.people.map((person) => (
                  <li key={person.id} className="px-5 py-3">
                    <Link
                      href={`/relationships/people/${person.id}`}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {personName(person)}
                    </Link>
                    {person.jobTitle && (
                      <div className="text-xs text-ink-muted">{person.jobTitle}</div>
                    )}
                    <div className="mt-1.5 flex flex-col gap-1">
                      {person.emails
                        .filter((c) => c.isPrimary)
                        .map((c) => (
                          <a
                            key={c.id}
                            href={`mailto:${c.value}`}
                            className="inline-flex items-center gap-1.5 text-xs text-info hover:underline"
                          >
                            <Mail className="h-3 w-3" />
                            {c.value}
                          </a>
                        ))}
                      {person.phones
                        .filter((c) => c.isPrimary)
                        .map((c) => (
                          <a
                            key={c.id}
                            href={`tel:${c.value.replace(/\s/g, "")}`}
                            className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {c.value}
                          </a>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {view.programmes.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-title font-semibold text-ink">Programmes</h2>
              </div>
              <ul className="divide-y divide-line">
                {view.programmes.map((programme) => {
                  const link = view.links.find(
                    (l) => l.entity.type === "programme" && l.entity.id === programme.id,
                  );
                  return (
                    <li key={programme.id} className="px-5 py-3">
                      <Link
                        href={`/programmes/${programme.id}`}
                        className="text-sm font-medium text-ink hover:underline"
                      >
                        {programme.name}
                      </Link>
                      <div className="text-xs text-ink-subtle">
                        {link?.note ?? programme.summary}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Organisation</h2>
            </div>
            <CardBody className="flex flex-col gap-2.5 text-sm">
              <Row label="Type" value={organisation.type.replace(/_/g, " ")} />
              {organisation.legalName && (
                <Row label="Legal name" value={organisation.legalName} />
              )}
              {organisation.charityNumber && (
                <Row label="Charity number" value={organisation.charityNumber} />
              )}
              {organisation.location && (
                <Row
                  label="Location"
                  value={[organisation.location.city, organisation.location.country]
                    .filter(Boolean)
                    .join(", ")}
                />
              )}
              {relationship?.startedAt && (
                <Row label="Known since" value={formatDate(relationship.startedAt)} />
              )}
              {view.owner && <Row label="Relationship owner" value={view.owner.name} />}
              {organisation.website && (
                <a
                  href={organisation.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-xs text-info hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {organisation.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {relationship?.notes && (
                <p className="mt-1 border-t border-line pt-2.5 text-sm text-ink-muted">
                  {relationship.notes}
                </p>
              )}
            </CardBody>
          </Card>

          {view.links.filter((l) => l.entity.type !== "programme").length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h3 className="text-sm font-semibold text-ink">Also connected to</h3>
              </div>
              <ul className="divide-y divide-line">
                {view.links
                  .filter((l) => l.entity.type !== "programme")
                  .map((link) => {
                    const href = hrefForEntity(link.entity.type, link.entity.id);
                    const label = link.note ?? link.entity.label ?? link.entity.type;
                    return (
                      <li key={link.id} className="px-5 py-2.5 text-sm">
                        {href ? (
                          <Link href={href} className="text-info hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">{label}</span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  hint,
  warn,
  small,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
  small?: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <div className="eyebrow">{label}</div>
        <div
          className={
            small
              ? "mt-1.5 text-sm font-medium text-ink"
              : "mt-1.5 font-heading text-heading font-medium text-ink"
          }
        >
          {value}
        </div>
        {hint && (
          <div className={warn ? "mt-0.5 text-xs text-warning" : "mt-0.5 text-xs text-ink-subtle"}>
            {hint}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right font-medium capitalize text-ink">{value}</span>
    </div>
  );
}
