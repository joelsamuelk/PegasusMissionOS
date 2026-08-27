import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleSlash, FileClock, Info } from "lucide-react";
import type { ReportDrift, ReportVersion } from "@/types/domain";
import type { ReportBriefing } from "@/lib/reporting";
import { completenessHeadline } from "@/lib/reporting";
import { hrefForEntity } from "@/lib/entity-links";
import { Card, CardBody, Pill, SectionTitle } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/StatusBadge";

/**
 * The report workspace.
 *
 * Answers the four questions the acceptance test names, in the order a drafter
 * needs them: **what is ready, what is missing, what needs review, and where
 * every important claim came from**. The order matters — a person who reads
 * "what is missing" first stops before writing a section they cannot support,
 * which is the outcome the phase exists to produce.
 *
 * Nothing here is a score. A single percentage would let a report that is
 * missing a financial figure and a report that is missing a case study read
 * identically, and those are very different positions to be in.
 */
export function ReportWorkspace({
  briefing,
  versions,
  drift,
}: {
  briefing: ReportBriefing;
  versions: ReportVersion[];
  drift: ReportDrift[];
}) {
  const { completeness } = briefing;
  const material = drift.filter((item) => item.severity === "material");

  return (
    <div className="space-y-6">
      {/* Should drafting begin at all? */}
      <Card className={briefing.readyToDraft ? undefined : "border-warning/40"}>
        <CardBody className="space-y-2">
          <div className="flex items-center gap-2">
            {briefing.readyToDraft ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" />
            )}
            <h3 className="font-heading text-base font-semibold text-ink">
              {briefing.readyToDraft
                ? "The data behind this report is ready"
                : "Resolve these before drafting"}
            </h3>
          </div>
          {briefing.blockers.length === 0 ? (
            <p className="text-sm text-ink-muted">{completenessHeadline(completeness)}</p>
          ) : (
            <ul className="space-y-1.5">
              {briefing.blockers.map((blocker, index) => (
                <li key={index} className="text-sm text-ink-muted">
                  {blocker}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Drift against what was published */}
      {drift.length > 0 && (
        <Card className="border-critical/35">
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <FileClock className="h-4 w-4 text-critical" />
              <h3 className="font-heading text-base font-semibold text-ink">
                The published version no longer matches the records
              </h3>
            </div>
            <p className="text-sm text-ink-muted">
              {material.length} material and {drift.length - material.length} minor
              difference{drift.length === 1 ? "" : "s"}. The published report has not been
              changed. Decide whether this warrants a correction.
            </p>
            <ul className="space-y-2">
              {drift.map((item, index) => (
                <li key={index} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={item.severity === "material" ? "critical" : "warning"}
                      label={item.severity}
                    />
                    <span className="text-ink">
                      {item.subject.label ?? item.subject.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    Published as {item.publishedValue}. Records now say {item.currentValue}.
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* What is missing */}
      <section>
        <SectionTitle>What is missing</SectionTitle>
        {completeness.missingEvidence.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-sm text-ink-muted">
                Every requirement has something against it.
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody>
              <ul className="space-y-3">
                {completeness.missingEvidence.map((entry, index) => (
                  <li key={index}>
                    <p className="text-sm font-medium text-ink">{entry.label}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">{entry.detail}</p>
                    {entry.sectionKey && (
                      <Pill className="mt-1">{entry.sectionKey.replace(/_/g, " ")}</Pill>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </section>

      {/* What needs review */}
      <section>
        <SectionTitle>What needs review</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <EntryCard
            title="Outdated evidence"
            icon={FileClock}
            entries={completeness.outdatedEvidence}
            empty="No included evidence is out of date."
          />
          <EntryCard
            title="Conflicting figures"
            icon={AlertTriangle}
            entries={completeness.conflicts}
            empty="No two current claims disagree."
          />
          <EntryCard
            title="Drafted with AI"
            icon={Info}
            entries={completeness.aiAssistedNarrative}
            empty="No section was drafted with AI."
          />
          <IndicatorCurrencyCard briefing={briefing} />
        </div>
      </section>

      {/* Where the figures came from */}
      <section>
        <SectionTitle>Where every figure came from</SectionTitle>
        <Card>
          <CardBody className="space-y-4">
            {briefing.trustedFigures.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No claim is cited in this report yet. Figures typed into prose cannot be
                traced and will block approval.
              </p>
            ) : (
              <ul className="space-y-3">
                {briefing.trustedFigures.map((figure) => (
                  <li key={figure.claimId}>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={figure.honest ? "info" : "warning"}
                        label={figure.kind}
                      />
                      <Pill>{figure.verification.replace(/_/g, " ")}</Pill>
                      {!figure.honest && (
                        <span className="text-xs text-warning">
                          cannot be presented as stated
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink">{figure.text}</p>
                    {figure.workings && (
                      <p className="mt-0.5 text-xs text-ink-subtle">{figure.workings}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {completeness.calculatedStatements.length > 0 && (
              <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
                <p className="eyebrow mb-1.5">Calculations, with their workings</p>
                <ul className="space-y-1.5">
                  {completeness.calculatedStatements.map((entry, index) => (
                    <li key={index} className="text-xs text-ink-muted">
                      <span className="text-ink">{entry.label}</span> {entry.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </section>

      {/* What we promised */}
      {briefing.commitments.length > 0 && (
        <section>
          <SectionTitle>What was promised</SectionTitle>
          <Card>
            <CardBody>
              <ul className="space-y-2">
                {briefing.commitments.map((item) => {
                  const href = hrefForEntity(item.ref.type, item.ref.id);
                  return (
                    <li key={item.ref.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill>
                          {item.origin === "funder_requirement"
                            ? "Funder requirement"
                            : "Commitment"}
                        </Pill>
                        {href ? (
                          <Link href={href} className="text-info hover:underline">
                            {item.ref.label}
                          </Link>
                        ) : (
                          <span className="text-ink">{item.ref.label}</span>
                        )}
                        {item.dueDate && (
                          <span className="text-xs text-ink-subtle">due {item.dueDate}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-subtle">{item.summary}</p>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {/* What changed */}
      {briefing.changedSinceLastReport.length > 0 && (
        <section>
          <SectionTitle>What changed since the last report</SectionTitle>
          <Card>
            <CardBody>
              <ul className="space-y-2">
                {briefing.changedSinceLastReport.map((change, index) => (
                  <li key={index} className="text-sm">
                    <span className="text-ink">
                      {change.subject.label ?? change.subject.type.replace(/_/g, " ")}
                    </span>{" "}
                    <span className="text-ink-subtle">
                      moved from {change.previousValue} to {change.currentValue}
                      {change.corrected ? ", as a correction" : ""}.
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {/* Version history */}
      <section>
        <SectionTitle>Version history</SectionTitle>
        <Card>
          <CardBody>
            {versions.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No version has been cut. A report is only fixed once a version pins the
                figures it cites.
              </p>
            ) : (
              <ul className="space-y-2">
                {[...versions].reverse().map((version) => (
                  <li key={version.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>v{version.versionNumber}</Pill>
                      <span className="text-ink">{version.reason.replace(/_/g, " ")}</span>
                      <span className="text-xs text-ink-subtle">
                        {version.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    {version.note && (
                      <p className="mt-0.5 text-xs text-ink-subtle">{version.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function EntryCard({
  title,
  icon: Icon,
  entries,
  empty,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  entries: { label: string; detail: string }[];
  empty: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="mb-2 flex items-center gap-2">
          <Icon className="h-4 w-4 text-ink-subtle" />
          <p className="eyebrow">{title}</p>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-ink-subtle">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry, index) => (
              <li key={index} className="text-sm">
                <span className="text-ink">{entry.label}</span>
                <p className="mt-0.5 text-xs text-ink-subtle">{entry.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function IndicatorCurrencyCard({ briefing }: { briefing: ReportBriefing }) {
  const notCurrent = briefing.indicatorCurrency.filter((c) => c.state !== "current");
  return (
    <Card>
      <CardBody>
        <div className="mb-2 flex items-center gap-2">
          <CircleSlash className="h-4 w-4 text-ink-subtle" />
          <p className="eyebrow">Indicator currency</p>
        </div>
        {notCurrent.length === 0 ? (
          <p className="text-sm text-ink-subtle">Every indicator has a recent measurement.</p>
        ) : (
          <ul className="space-y-2">
            {notCurrent.map((currency) => (
              <li key={currency.indicatorId} className="text-sm">
                <span className="text-ink">{currency.name}</span>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {currency.state === "never_measured"
                    ? "Never measured."
                    : `Last measured ${currency.daysSinceMeasured} days ago (${currency.state}).`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
