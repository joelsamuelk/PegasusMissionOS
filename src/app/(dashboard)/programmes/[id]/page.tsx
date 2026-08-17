import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Boxes, Target, TrendingUp } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatting";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { EvidenceReferenceList } from "@/components/evidence/EvidenceReference";
import { IndicatorEditor } from "@/components/programmes/IndicatorEditor";
import { ProgrammeEcosystemPanel } from "@/components/relationships/ProgrammeEcosystemPanel";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { buildProgrammeEcosystem } from "@/server/services/relationships";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const programme = await getRepository().programmes.get(ctx, id);
  return { title: programme?.name ?? "Programme" };
}

export default async function ProgrammePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const programme = await repo.programmes.get(ctx, id);
  if (!programme) notFound();

  // The programme's ecosystem, read from relationship links. Each entry is a
  // real organisation with its own history and commitments, rather than a name
  // in `programme.deliveryPartners`.
  const [owner, grants, outcomes, evidence, ecosystem] = await Promise.all([
    programme.ownerId ? repo.organisations.user(ctx, programme.ownerId) : null,
    repo.programmes.grantsFor(ctx, programme.id),
    repo.programmes.outcomes(ctx, programme.id),
    repo.evidence.forTarget(ctx, "programme", programme.id),
    buildProgrammeEcosystem(ctx, repo, programme.id),
  ]);

  const indicatorsByOutcome = new Map(
    await Promise.all(
      outcomes.map(
        async (o) =>
          [o.id, await repo.programmes.indicatorsForOutcome(ctx, o.id)] as const,
      ),
    ),
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Programmes", href: "/programmes" }, { label: programme.name }]}
        eyebrow="Programme"
        title={programme.name}
        description={programme.summary}
        actions={<EntityStatusBadge status={programme.status} />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Owner" value={owner?.name ?? "-"} />
        <Metric label="Location" value={programme.location ?? "-"} />
        <Metric
          label="Dates"
          value={`${formatDate(programme.startDate)} to ${formatDate(programme.endDate)}`}
          small
        />
        <Metric label="Budget" value={programme.budget ? formatCurrency(programme.budget) : "-"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Impact framework */}
          <Card>
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-title font-semibold text-ink">Impact framework</h2>
              <p className="mt-0.5 text-xs text-ink-subtle">
                Activities lead to outputs, which lead to outcomes and long-term impact.
              </p>
            </div>
            <div className="grid gap-px bg-line sm:grid-cols-2">
              <FrameworkCell icon={Activity} title="Activities" items={programme.activities} />
              <FrameworkCell icon={Boxes} title="Outputs" items={programme.outputs} />
              <FrameworkCell
                icon={Target}
                title="Outcomes"
                items={outcomes.filter((o) => o.level === "outcome").map((o) => o.title)}
              />
              <FrameworkCell
                icon={TrendingUp}
                title="Long-term impact"
                items={["Improved routes into good work and wellbeing for young people in the region"]}
              />
            </div>
          </Card>

          {/* Outcomes and indicators */}
          <section>
            <h2 className="mb-3 text-title font-semibold text-ink">Outcomes and indicators</h2>
            <div className="flex flex-col gap-5">
              {outcomes.map((outcome) => {
                const indicators = indicatorsByOutcome.get(outcome.id) ?? [];
                return (
                  <div key={outcome.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{outcome.title}</h3>
                      <span className="eyebrow">{outcome.level}</span>
                    </div>
                    <p className="mb-2 text-sm text-ink-muted">{outcome.description}</p>
                    <div className="grid gap-3">
                      {indicators.map((indicator) => (
                        <IndicatorEditor key={indicator.id} indicator={indicator} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardBody>
              <div className="eyebrow mb-2">Communities served</div>
              <div className="flex flex-wrap gap-1.5">
                {programme.communitiesServed.map((c) => (
                  <Pill key={c}>{c}</Pill>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Funding sources</h3>
            </div>
            <ul className="divide-y divide-line">
              {grants.length === 0 && (
                <li className="px-4 py-3 text-sm text-ink-subtle">No grants linked yet.</li>
              )}
              {grants.map((g) => (
                <li key={g.id} className="px-4 py-3">
                  <Link href={`/grants/${g.id}`} className="text-sm text-info hover:underline">
                    {g.title}
                  </Link>
                  <div className="text-xs text-ink-subtle">{formatCurrency(g.awardValue)}</div>
                </li>
              ))}
            </ul>
          </Card>

          <ProgrammeEcosystemPanel entries={ecosystem} />

          {/* Fallback while the string array is migrated onto relationships. */}
          {ecosystem.length === 0 && programme.deliveryPartners.length > 0 && (
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">Delivery partners</h3>
              </div>
              <ul className="divide-y divide-line">
                {programme.deliveryPartners.map((p) => (
                  <li key={p} className="px-4 py-2.5 text-sm text-ink-muted">
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {programme.risks.length > 0 && (
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">Risks</h3>
              </div>
              <ul className="divide-y divide-line">
                {programme.risks.map((r) => (
                  <li key={r} className="px-4 py-2.5 text-sm text-ink-muted">
                    {r}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Evidence</h3>
            </div>
            <CardBody>
              <EvidenceReferenceList evidence={evidence} emptyLabel="No evidence linked to this programme yet." />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <Card>
      <CardBody>
        <div className="eyebrow">{label}</div>
        <div className={small ? "mt-1.5 text-sm font-medium text-ink" : "mt-1.5 text-title font-medium text-ink"}>
          {value}
        </div>
      </CardBody>
    </Card>
  );
}

function FrameworkCell({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <div className="bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.length === 0 && <li className="text-xs text-ink-subtle">Not yet defined.</li>}
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-ink-muted">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-ink-subtle" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
