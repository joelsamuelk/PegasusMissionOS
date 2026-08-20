import type { Metadata } from "next";
import { DoorOpen, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill, SectionTitle } from "@/components/shared/ui";
import { EmptyState } from "@/components/shared/misc";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PortalPreview } from "@/components/portals/PortalPreview";
import { AUDIENCE_CAPABILITIES, viewsFor } from "@/lib/portals";
import { loadAccessReview } from "@/server/actions/portals";

export const metadata: Metadata = { title: "Portals" };

/**
 * The access review.
 *
 * The most important screen in this phase and the least glamorous. External
 * parties reading tenant data is the highest-risk surface in the product, and
 * the control that makes it survivable is not the access check — it is
 * somebody being able to see, on one page, exactly who can see what.
 *
 * A control nobody can inspect is not a control, which is why this page leads
 * with the grants rather than with the portals.
 */
export default async function PortalsPage() {
  const review = await loadAccessReview();
  const entries = review.entries ?? [];
  const live = entries.filter((entry) => !entry.membership.revokedAt);

  return (
    <div>
      <PageHeader
        eyebrow="Portals"
        title="Who outside this organisation can see what"
        description="Access is granted one record at a time and is never inherited. Somebody who can see a grant does not thereby see the evidence behind it."
      />

      <section className="mb-8">
        <SectionTitle>Shared with people outside this organisation</SectionTitle>
        {live.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="Nothing is shared"
            description="No external party currently has access to any record in this organisation."
          />
        ) : (
          <div className="space-y-3">
            {live.map((entry) => {
              const active = entry.grants.filter((grant) => !grant.revokedAt);
              const withdrawn = entry.grants.filter((grant) => grant.revokedAt);

              return (
                <Card key={entry.membership.id}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="info" label={entry.portal.audience} />
                      <span className="font-heading text-base font-semibold text-ink">
                        {entry.identity.displayName}
                      </span>
                      <span className="text-xs text-ink-subtle">{entry.identity.email}</span>
                      {entry.membership.capabilities.map((capability) => (
                        <Pill key={capability}>{capability.replace("portal:", "")}</Pill>
                      ))}
                      {entry.membership.expiresAt && (
                        <Pill>expires {entry.membership.expiresAt.slice(0, 10)}</Pill>
                      )}
                    </div>

                    <div>
                      <p className="eyebrow mb-1.5">
                        {active.length} record{active.length === 1 ? "" : "s"} shared
                      </p>
                      {active.length === 0 ? (
                        <p className="text-sm text-ink-muted">
                          They can sign in and see nothing. Nothing has been shared with them.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {active.map((grant) => (
                            <li key={grant.id} className="text-sm">
                              <span className="text-ink">
                                {grant.entity.label ??
                                  `${grant.entity.type.replace(/_/g, " ")} ${grant.entity.id}`}
                              </span>
                              <span className="ml-2 text-xs text-ink-subtle">
                                {grant.reason ?? "No reason recorded."} Shared{" "}
                                {grant.grantedAt.slice(0, 10)}.
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {withdrawn.length > 0 && (
                        <p className="mt-1.5 text-xs text-ink-subtle">
                          {withdrawn.length} record{withdrawn.length === 1 ? " has" : "s have"}{" "}
                          been withdrawn. Withdrawn access is kept on the record rather than
                          deleted, so what was shared and when it stopped can always be
                          answered.
                        </p>
                      )}
                    </div>

                    <PortalPreview slug={entry.portal.slug} email={entry.identity.email} />
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>What each audience could ever see</SectionTitle>
        <Card>
          <CardBody>
            <p className="mb-4 text-sm text-ink-muted">
              Each audience has a fixed set of views, and each view names the fields it shows.
              A field added to a record next year is invisible to every portal until somebody
              adds it to a view, which is what stops a schema change becoming a disclosure.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {(Object.keys(AUDIENCE_CAPABILITIES) as (keyof typeof AUDIENCE_CAPABILITIES)[]).map(
                (audience) => (
                  <div key={audience}>
                    <p className="text-sm font-medium capitalize text-ink">{audience}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      Can {AUDIENCE_CAPABILITIES[audience].map((c) => c.replace("portal:", "")).join(", ")}.
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {viewsFor(audience).map((view) => (
                        <li key={view.key} className="text-xs text-ink-muted">
                          {view.label}: {view.fields.length} field
                          {view.fields.length === 1 ? "" : "s"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-xs text-ink-subtle">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A portal identity is not a user account. It has no access to this application,
              cannot be given an internal role, and can only ever see records somebody shared
              deliberately.
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
