import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/formatting";
import { personName } from "@/lib/logic/relationship-brief";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { buildPersonView } from "@/server/services/relationships";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { VerificationBadge } from "@/components/shared/misc";
import {
  RelationshipHealthBadge,
  RoleChips,
} from "@/components/relationships/RelationshipBadges";
import { RelationshipTimeline } from "@/components/relationships/RelationshipTimeline";
import { CommitmentList } from "@/components/relationships/CommitmentList";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const person = await getRepository().relationships.getPerson(ctx, id);
  return { title: person ? personName(person) : "Person" };
}

const CONSENT_LABELS: Record<string, string> = {
  consent: "Consent given",
  legitimate_interest: "Legitimate interest",
  contract: "Contract",
  legal_obligation: "Legal obligation",
  not_recorded: "Not recorded",
};

/**
 * The person page.
 *
 * A person's history belongs to the person, not to the organisation they
 * happen to work at today — which is why it survives them moving on. Contact
 * details sit beside the lawful basis for holding them, so the two are never
 * separated.
 */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const view = await buildPersonView(ctx, getRepository(), id);
  if (!view) notFound();

  const { person, relationship, organisation, health } = view;
  const nowIso = ctx.now().toISOString();
  const prefs = person.communicationPreferences;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Relationships", href: "/relationships" },
          ...(organisation
            ? [{ label: organisation.name, href: `/relationships/${organisation.id}` }]
            : []),
          { label: personName(person) },
        ]}
        eyebrow={person.jobTitle}
        title={personName(person)}
        description={organisation?.name}
        actions={<RelationshipHealthBadge state={health.state} />}
      />

      {relationship && (
        <div className="mb-6">
          <RoleChips roles={relationship.roles} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Timeline</h2>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Every interaction this person took part in, and the commitments that came out
                of them.
              </p>
            </div>
            <RelationshipTimeline events={view.timeline} limit={20} />
          </Card>

          {view.connectedEntities.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-title font-semibold text-ink">Connected to</h2>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  Read from the interactions and commitments this person appears in.
                </p>
              </div>
              <ul className="divide-y divide-line">
                {view.connectedEntities.map((entity, i) => (
                  <li key={i} className="px-5 py-2.5 text-sm">
                    {entity.href ? (
                      <Link href={entity.href} className="text-info hover:underline">
                        {entity.label}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">{entity.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Contact</h2>
            </div>
            <CardBody className="flex flex-col gap-3">
              {person.emails.length === 0 && person.phones.length === 0 && (
                <p className="text-sm text-ink-subtle">No contact details recorded.</p>
              )}
              {person.emails.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3">
                  <a
                    href={`mailto:${c.value}`}
                    className="inline-flex min-w-0 items-center gap-1.5 text-sm text-info hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{c.value}</span>
                  </a>
                  <VerificationBadge state={c.verification} />
                </div>
              ))}
              {person.phones.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3">
                  <a
                    href={`tel:${c.value.replace(/\s/g, "")}`}
                    className="inline-flex min-w-0 items-center gap-1.5 text-sm text-ink hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{c.value}</span>
                  </a>
                  <VerificationBadge state={c.verification} />
                </div>
              ))}
              {organisation && (
                <div className="border-t border-line pt-3 text-sm">
                  <span className="text-ink-subtle">Organisation: </span>
                  <Link
                    href={`/relationships/${organisation.id}`}
                    className="text-info hover:underline"
                  >
                    {organisation.name}
                  </Link>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <ShieldCheck className="h-4 w-4 text-ink-subtle" />
              <h2 className="text-title font-semibold text-ink">Consent and preferences</h2>
            </div>
            <CardBody className="flex flex-col gap-2.5 text-sm">
              <Row
                label="Lawful basis"
                value={CONSENT_LABELS[person.consent?.basis ?? "not_recorded"]}
              />
              {person.consent?.source && <Row label="Source" value={person.consent.source} />}
              {person.consent?.recordedAt && (
                <Row label="Recorded" value={formatDate(person.consent.recordedAt)} />
              )}
              {person.consent?.reviewDueAt && (
                <Row label="Review due" value={formatDate(person.consent.reviewDueAt)} />
              )}
              {person.consent?.jurisdiction && (
                <Row label="Jurisdiction" value={person.consent.jurisdiction} />
              )}
              {prefs && (
                <div className="border-t border-line pt-2.5">
                  <div className="eyebrow mb-1.5">Contact permitted for</div>
                  <ul className="flex flex-col gap-1 text-sm text-ink-muted">
                    <li>Operational email: {yesNo(prefs.emailAllowed && !prefs.doNotContact)}</li>
                    <li>Phone: {yesNo(prefs.phoneAllowed && !prefs.doNotContact)}</li>
                    <li>Marketing: {yesNo(prefs.marketingAllowed && !prefs.doNotContact)}</li>
                    <li>
                      Fundraising: {yesNo(prefs.fundraisingAllowed && !prefs.doNotContact)}
                    </li>
                  </ul>
                </div>
              )}
              <p className="text-xs text-ink-subtle">
                Operational contact, marketing and fundraising rest on different lawful bases,
                so they are recorded separately rather than as one opt-in.
              </p>
            </CardBody>
          </Card>

          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Commitments</h2>
            </div>
            <CommitmentList
              commitments={view.commitments}
              now={nowIso}
              emptyMessage="No commitments involve this person."
            />
          </Card>

          {person.notes && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h3 className="text-sm font-semibold text-ink">Notes</h3>
              </div>
              <CardBody>
                <p className="text-sm text-ink-muted">{person.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
