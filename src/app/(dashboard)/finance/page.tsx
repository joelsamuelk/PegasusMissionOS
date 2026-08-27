import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { formatMoney } from "@/lib/finance-intelligence/money";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill, SectionTitle } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FigureCard } from "@/components/finance/FigureCard";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { loadFinancePosition } from "@/server/finance/position-service";

export const metadata: Metadata = { title: "Finance" };

/**
 * The Finance Command Centre.
 *
 * Every figure carries its arithmetic, and every figure that cannot be
 * produced says why and what would produce it. The section at the bottom —
 * what this page could not answer — is the one that most distinguishes it from
 * a dashboard: a finance screen with three panels and no acknowledgement of
 * the four questions it skipped reads as a complete picture.
 */
export default async function FinancePage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const [position, imports] = await Promise.all([
    loadFinancePosition(ctx, repo),
    repo.finance.imports(ctx),
  ]);

  const awaiting = imports.filter((record) => record.status === "awaiting_review");

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Where the money is, and how each figure was reached"
        description="Every number here shows its arithmetic. Anything that cannot be calculated says so, and says what would fix it."
      />

      {awaiting.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Statements waiting for review</SectionTitle>
          <Card>
            <CardBody>
              <ul className="space-y-2">
                {awaiting.map((record) => (
                  <li key={record.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/finance/imports/${record.id}`} className="text-info hover:underline">
                      {record.fileName ?? "A statement"}
                    </Link>
                    <span className="text-xs text-ink-subtle">
                      {record.rowCount} rows, {record.problems.length} unreadable,{" "}
                      {record.duplicateCount} possible duplicates. Nothing posted.
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      <section className="mb-8">
        <SectionTitle>Position</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FigureCard label="Cash recorded" figure={position.cash} />
          <FigureCard label="Unrestricted" figure={position.unrestricted} />
          <FigureCard label="Restricted" figure={position.restricted} />
          <FigureCard label="Unrestricted runway" figure={position.runway} />
          <FigureCard label="Income this year" figure={position.incomeThisYear} />
          <FigureCard label="Expenditure this year" figure={position.expenditureThisYear} />
          <FigureCard label="Funding concentration" figure={position.concentration} />
          <FigureCard label="Unallocated expenditure" figure={position.unallocated} />
        </div>
      </section>

      {position.grantUtilisation.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Grant utilisation</SectionTitle>
          <Card>
            <CardBody>
              <ul className="space-y-4">
                {position.grantUtilisation.map((grant) => (
                  <li key={grant.grantId}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/grants/${grant.grantId}`}
                        className="text-sm font-medium text-ink hover:text-info"
                      >
                        {grant.title}
                      </Link>
                      {grant.overspent && (
                        <StatusBadge tone="critical" label="over award" icon={AlertTriangle} />
                      )}
                      {/*
                        Both numbers, side by side. Utilisation alone is not a
                        finding; utilisation against elapsed time is.
                      */}
                      <Pill>{grant.percentUsed}% used</Pill>
                      <Pill>{grant.percentElapsed}% elapsed</Pill>
                    </div>
                    <p className="mt-1 text-xs text-ink-subtle">{grant.workings}</p>
                    {grant.percentElapsed - grant.percentUsed > 25 && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-warning">
                        <TrendingDown className="h-3 w-3" />
                        Underspending against the award period. Funders notice this before you
                        do.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {position.budgetVariance.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Budget variance</SectionTitle>
          <Card>
            <CardBody>
              <ul className="space-y-3">
                {position.budgetVariance.map((budget) => (
                  <li key={budget.budgetId}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-ink">{budget.name}</span>
                      <Pill
                        className={
                          budget.variancePercent > 0 ? "border-critical/30 text-critical" : ""
                        }
                      >
                        {budget.variancePercent > 0 ? "+" : ""}
                        {budget.variancePercent}%
                      </Pill>
                      <span className="text-xs text-ink-subtle">
                        {formatMoney(budget.actual)} against {formatMoney(budget.planned)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">{budget.workings}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {position.cliffs.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Funding cliffs</SectionTitle>
          <Card>
            <CardBody>
              <ul className="space-y-3">
                {position.cliffs.map((cliff) => (
                  <li key={cliff.key}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <StatusBadge
                        tone={
                          cliff.severity === "critical"
                            ? "critical"
                            : cliff.severity === "high"
                              ? "warning"
                              : "info"
                        }
                        label={cliff.severity}
                      />
                      <span className="text-ink">{cliff.programmeName}</span>
                      <span className="text-xs text-ink-subtle">
                        {formatMoney(cliff.expiringAmount)} ends {cliff.expiryDate}
                      </span>
                    </div>
                    {cliff.statements.slice(0, 2).map((statement) => (
                      <p key={statement.id} className="mt-0.5 text-xs text-ink-subtle">
                        {statement.text}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {position.unanswered.length > 0 && (
        <section>
          <SectionTitle>What this page cannot tell you</SectionTitle>
          <Card>
            <CardBody>
              <p className="mb-3 text-sm text-ink-muted">
                These are questions the records cannot currently answer. They are listed
                rather than left off the page, because a finance screen that shows only what
                it knows reads as a complete picture.
              </p>
              <ul className="space-y-2.5">
                {position.unanswered.map((entry, index) => (
                  <li key={index} className="text-sm">
                    <p className="text-ink">{entry.question}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">{entry.reason}</p>
                    {entry.requires.map((requirement, i) => (
                      <p key={i} className="text-xs text-ink-subtle">
                        {requirement}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}
