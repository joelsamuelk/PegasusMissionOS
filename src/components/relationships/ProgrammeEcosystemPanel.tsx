import Link from "next/link";
import { Network } from "lucide-react";
import { personName } from "@/lib/logic/relationship-brief";
import { roleLabel } from "@/lib/logic/relationship-roles";
import type { EcosystemEntry } from "@/server/services/relationships";
import { Card, CardBody } from "@/components/shared/ui";

/**
 * The programme ecosystem: who funds it, who delivers it, who evaluates it.
 *
 * Sourced from relationship links, so each row is a real organisation with a
 * contact, a history and its own commitments — rather than a name in
 * `Programme.deliveryPartners`.
 */
export function ProgrammeEcosystemPanel({ entries }: { entries: EcosystemEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Network className="h-4 w-4 text-ink-subtle" />
        <h2 className="text-title font-semibold text-ink">Programme ecosystem</h2>
      </div>
      <ul className="divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.relationship.id} className="px-5 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/relationships/${entry.organisation.id}`}
                className="text-sm font-medium text-ink hover:underline"
              >
                {entry.organisation.name}
              </Link>
              {entry.role && (
                <span className="text-xs text-ink-subtle">{roleLabel(entry.role)}</span>
              )}
            </div>
            {entry.note && <p className="mt-0.5 text-xs text-ink-muted">{entry.note}</p>}
            {entry.primaryContact && (
              <Link
                href={`/relationships/people/${entry.primaryContact.id}`}
                className="mt-1 inline-block text-xs text-info hover:underline"
              >
                {personName(entry.primaryContact)}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <CardBody className="border-t border-line py-3">
        <p className="text-xs text-ink-subtle">
          Each partner links to its full relationship history, commitments and funding.
        </p>
      </CardBody>
    </Card>
  );
}
