import type { Metadata } from "next";
import { Plug, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill, SectionTitle } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { INTEGRATIONS, describeSemantics } from "@/lib/integrations";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

export const metadata: Metadata = { title: "Integrations" };

/**
 * The integration hub.
 *
 * The page leads with what is **described** versus what is **built**, because
 * a registry listing nine providers without that distinction is a roadmap
 * presented as a feature. Every provider here is described; none is built, and
 * the page says so above the list rather than in a footnote.
 */
export default async function IntegrationsPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const [connections, conflicts] = await Promise.all([
    repo.integrations.connections(ctx),
    repo.integrations.conflicts(ctx, { openOnly: true }),
  ]);

  const built = INTEGRATIONS.filter((integration) => integration.implemented);
  const researched = INTEGRATIONS.filter((integration) => integration.documentation);

  return (
    <div>
      <PageHeader
        eyebrow="Integrations"
        title="Work alongside the systems you already have"
        description="Mission OS can be the intelligence layer around your existing CRM, accounting and payment systems before it becomes the system of record for any of them."
      />

      {conflicts.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Disagreements waiting for a decision</SectionTitle>
          <Card className="border-warning/35">
            <CardBody>
              <p className="mb-3 text-sm text-ink-muted">
                A sync will not overwrite a value somebody here stood behind. These are the
                places where the two systems disagree and nothing was changed.
              </p>
              <ul className="space-y-2">
                {conflicts.map((conflict) => (
                  <li key={conflict.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink">
                        {conflict.entity.type.replace(/_/g, " ")}, {conflict.field}
                      </span>
                      <Pill>{conflict.pegasusVerification.replace(/_/g, " ")}</Pill>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      Pegasus holds &ldquo;{conflict.pegasusValue}&rdquo;. The provider says
                      &ldquo;{conflict.externalValue}&rdquo;.
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {connections.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Connected</SectionTitle>
          <div className="space-y-3">
            {connections.map((connection) => (
              <Card key={connection.id}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={
                        connection.status === "active"
                          ? "success"
                          : connection.status === "revoked"
                            ? "neutral"
                            : "warning"
                      }
                      label={connection.status.replace(/_/g, " ")}
                    />
                    <span className="font-heading text-base font-semibold text-ink">
                      {connection.accountLabel}
                    </span>
                    <Pill>{connection.mode}</Pill>
                  </div>
                  {/* One sentence, not six settings nobody reads. */}
                  <p className="text-xs text-ink-subtle">
                    {describeSemantics(connection.semantics)}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <SectionTitle>Available</SectionTitle>
        <Card className="mb-3 border-warning/35">
          <CardBody>
            <p className="flex items-start gap-2 text-sm text-ink-muted">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                {built.length} of these {INTEGRATIONS.length} providers has a working adapter.
                The rest are described so the architecture can be judged, and nothing can be
                read from or written to them yet. {researched.length} of them{" "}
                {researched.length === 1 ? "has" : "have"} had{" "}
                {researched.length === 1 ? "its" : "their"} capabilities read from the
                provider&rsquo;s own documentation; for the others, nothing on this page should
                be treated as a statement about what they support.
              </span>
            </p>
          </CardBody>
        </Card>

        <div className="space-y-3">
          {INTEGRATIONS.map((integration) => (
            <Card key={integration.id}>
              <CardBody className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Plug className="h-4 w-4 text-ink-subtle" />
                  <span className="font-heading text-base font-semibold text-ink">
                    {integration.name}
                  </span>
                  <Pill>{integration.category}</Pill>
                  <StatusBadge
                    tone={integration.implemented ? "success" : "neutral"}
                    label={integration.implemented ? "built" : "described"}
                  />
                  {integration.documentation && <Pill>documentation read</Pill>}
                </div>

                {integration.supplies.length > 0 && (
                  <p className="text-xs text-ink-subtle">
                    Would supply:{" "}
                    {integration.supplies.map((type) => type.replace(/_/g, " ")).join(", ")}.
                  </p>
                )}

                {integration.unavailable.map((entry) => (
                  <p key={entry.entityType} className="text-xs text-warning">
                    Cannot supply {entry.entityType.replace(/_/g, " ")}: {entry.reason}
                  </p>
                ))}

                <ul className="space-y-0.5">
                  {integration.notes.map((note, index) => (
                    <li key={index} className="text-xs text-ink-subtle">
                      {note}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
