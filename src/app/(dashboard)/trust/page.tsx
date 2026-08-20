import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, CircleSlash, MinusCircle } from "lucide-react";
import {
  AI_GUARANTEES,
  AI_REGISTER,
  RETENTION_RULES,
  TRUST_STATEMENTS,
  planDeletion,
  unmetStatements,
  type TrustStatus,
} from "@/lib/trust";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill, SectionTitle } from "@/components/shared/ui";

export const metadata: Metadata = { title: "Trust Centre" };

const STATUS_ICON: Record<TrustStatus, React.ComponentType<{ className?: string }>> = {
  upheld: CheckCircle2,
  partial: AlertTriangle,
  not_yet: CircleSlash,
  declined: MinusCircle,
};

const STATUS_CLASS: Record<TrustStatus, string> = {
  upheld: "text-success",
  partial: "text-warning",
  not_yet: "text-ink-subtle",
  declined: "text-ink-subtle",
};

const STATUS_LABEL: Record<TrustStatus, string> = {
  upheld: "True today",
  partial: "Partly true",
  not_yet: "Not yet",
  declined: "Deliberately not done",
};

const AREA_LABELS: Record<string, string> = {
  security: "Security",
  privacy: "Privacy",
  ai: "Where AI is used",
  data_location: "Data location",
  subprocessors: "Subprocessors",
  availability: "Availability",
  backup: "Backup and restore",
  retention: "Retention",
  permissions: "Permissions",
  audit: "Audit",
};

/**
 * The Trust Centre.
 *
 * The brief's line that decides how this page is built: *do not claim
 * certifications not actually obtained.* The obvious implementation is a page
 * of reassuring paragraphs. This is a list of statements with statuses, and
 * the unmet ones are shown **first**.
 *
 * An organisation deciding whether to put their finances into a product learns
 * more from what a vendor is willing to say it has not done than from what it
 * says it has. That is also the phase's acceptance test: credible, rather than
 * impressive in a demonstration.
 */
export default function TrustPage() {
  const unmet = unmetStatements();
  const byArea = new Map<string, typeof TRUST_STATEMENTS>();
  for (const statement of TRUST_STATEMENTS) {
    byArea.set(statement.area, [...(byArea.get(statement.area) ?? []), statement]);
  }
  const deletion = planDeletion();

  return (
    <div>
      <PageHeader
        eyebrow="Trust Centre"
        title="What is true, and what is not yet"
        description="Everything below can be checked. Where something is not true, it says so and says what would make it true, because a page with nothing on that list is a marketing page."
      />

      {/* The unmet list, first. */}
      <section className="mb-8">
        <SectionTitle>What is not yet true</SectionTitle>
        <Card className="border-warning/35">
          <CardBody>
            <p className="mb-3 text-sm text-ink-muted">
              {unmet.length} of {TRUST_STATEMENTS.length} statements below are not fully true
              today. They are here first, rather than in a footnote.
            </p>
            <ul className="space-y-3">
              {unmet.map((statement, index) => (
                <li key={index} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill>{AREA_LABELS[statement.area] ?? statement.area}</Pill>
                    <span className="text-xs text-warning">
                      {STATUS_LABEL[statement.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-ink">{statement.statement}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">{statement.wouldRequire}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      <section className="mb-8">
        <SectionTitle>Every statement, by area</SectionTitle>
        <div className="space-y-3">
          {[...byArea.entries()].map(([area, statements]) => (
            <Card key={area}>
              <CardBody>
                <p className="eyebrow mb-2">{AREA_LABELS[area] ?? area}</p>
                <ul className="space-y-2.5">
                  {statements.map((statement, index) => {
                    const Icon = STATUS_ICON[statement.status];
                    return (
                      <li key={index} className="text-sm">
                        <p className="flex items-start gap-2">
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_CLASS[statement.status]}`}
                          />
                          <span className="text-ink">{statement.statement}</span>
                        </p>
                        {statement.evidence && (
                          <p className="mt-0.5 pl-6 text-xs text-ink-subtle">
                            Where to check: {statement.evidence}
                          </p>
                        )}
                        {statement.wouldRequire && (
                          <p className="mt-0.5 pl-6 text-xs text-ink-subtle">
                            {statement.wouldRequire}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <SectionTitle>Where AI is used</SectionTitle>
        <Card>
          <CardBody className="space-y-4">
            <ul className="space-y-1.5">
              {AI_GUARANTEES.map((guarantee, index) => (
                <li key={index} className="text-sm text-ink-muted">
                  {guarantee}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="mt-3 space-y-3">
          {AI_REGISTER.map((use) => (
            <Card key={use.feature}>
              <CardBody className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-base font-semibold text-ink">
                    {use.label}
                  </span>
                  <Pill>{use.surface}</Pill>
                  {use.risk === "consequential" && (
                    <Pill className="border-warning/35 text-warning">a funder reads this</Pill>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="eyebrow mb-1">What it sees</p>
                    <ul className="space-y-0.5">
                      {use.sees.map((item, index) => (
                        <li key={index} className="text-xs text-ink-muted">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    {/* The half nobody volunteers. */}
                    <p className="eyebrow mb-1">What it can never see</p>
                    <ul className="space-y-0.5">
                      {use.neverSees.map((item, index) => (
                        <li key={index} className="text-xs text-ink-muted">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-ink-subtle">{use.produces}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>What is kept, and what cannot be deleted</SectionTitle>
        <Card>
          <CardBody className="space-y-4">
            <div>
              <p className="eyebrow mb-2">Would survive a deletion request</p>
              <p className="mb-2 text-sm text-ink-muted">
                A product offering to delete everything and then quietly keeping the audit
                trail has told its customer something untrue. These are the records that
                remain, and why.
              </p>
              <ul className="space-y-2">
                {deletion.retained.map((entry) => (
                  <li key={entry.label} className="text-sm">
                    <span className="text-ink">{entry.label}</span>
                    <p className="mt-0.5 text-xs text-ink-subtle">{entry.reason}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="eyebrow mb-2">Retention</p>
              <ul className="space-y-1.5">
                {RETENTION_RULES.map((rule) => (
                  <li key={rule.label} className="text-xs text-ink-muted">
                    <span className="text-ink">{rule.label}:</span>{" "}
                    {rule.days ? `${rule.days} days. ` : ""}
                    {rule.basis === "no_policy"
                      ? "No policy is set. This is a gap."
                      : rule.basis.replace(/_/g, " ")}
                    . {rule.enforcedBy ?? ""}
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
