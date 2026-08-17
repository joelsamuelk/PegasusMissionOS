import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatting";
import { personName } from "@/lib/logic/relationship-brief";
import type { RelationshipView } from "@/server/services/relationships";
import { Card, CardBody } from "@/components/shared/ui";
import { RelationshipHealthBadge, RoleChips } from "./RelationshipBadges";

/**
 * The funder relationship, shown on a grant page.
 *
 * Sourced entirely from the shared relationship layer — this component holds
 * no funder data of its own. That is the point: a grant manager should see who
 * the contact is, when we last spoke and what we owe, without leaving the
 * grant or opening a second system.
 */
export function FunderRelationshipPanel({ view }: { view: RelationshipView }) {
  const contact = view.people[0] ?? null;
  const otherGrants = view.grants.length - 1;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-title font-semibold text-ink">Funder relationship</h2>
        <RelationshipHealthBadge state={view.health.state} />
      </div>
      <CardBody className="flex flex-col gap-3 text-sm">
        <Link
          href={`/relationships/${view.organisation.id}`}
          className="group inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
        >
          {view.organisation.name}
          <ArrowUpRight className="h-3.5 w-3.5 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>

        {view.relationship && <RoleChips roles={view.relationship.roles} limit={3} />}

        <dl className="flex flex-col gap-2 border-t border-line pt-3">
          <Row
            label="Primary contact"
            value={
              contact ? (
                <Link
                  href={`/relationships/people/${contact.id}`}
                  className="text-info hover:underline"
                >
                  {personName(contact)}
                </Link>
              ) : (
                "Not recorded"
              )
            }
          />
          {view.owner && <Row label="Relationship owner" value={view.owner.name} />}
          <Row
            label="Last contact"
            value={
              view.health.lastInteractionAt
                ? formatDate(view.health.lastInteractionAt.slice(0, 10))
                : "Not recorded"
            }
          />
          <Row
            label="Open commitments"
            value={
              view.overdueCommitments.length > 0 ? (
                <span className="text-warning">
                  {view.openCommitments.length} ({view.overdueCommitments.length} overdue)
                </span>
              ) : (
                String(view.openCommitments.length)
              )
            }
          />
          {view.relationship?.startedAt && (
            <Row label="Known since" value={formatDate(view.relationship.startedAt)} />
          )}
          {otherGrants > 0 && (
            <Row
              label="Other funding"
              value={`${otherGrants} further grant${otherGrants === 1 ? "" : "s"} · ${formatCurrency(view.totalFunding)} total`}
            />
          )}
        </dl>

        {view.openCommitments.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
            {view.openCommitments.slice(0, 3).map((commitment) => (
              <li key={commitment.id} className="text-sm text-ink-muted">
                <span className="text-ink-subtle">
                  {commitment.direction === "we_owe" ? "We owe" : "They owe"}:{" "}
                </span>
                {commitment.title}
                {commitment.dueAt && (
                  <span className="text-ink-subtle"> · {formatDate(commitment.dueAt)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
