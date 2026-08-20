import type { Metadata } from "next";
import Link from "next/link";
import { HeartHandshake, TrendingDown } from "lucide-react";
import { formatMoney } from "@/lib/finance-intelligence/money";
import { STEWARDSHIP_STAGES } from "@/lib/fundraising";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill, SectionTitle } from "@/components/shared/ui";
import { EmptyState } from "@/components/shared/misc";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import {
  buildCampaignViews,
  buildSupporterViews,
  deriveMajorGiftThreshold,
} from "@/server/fundraising/supporter-service";

export const metadata: Metadata = { title: "Supporters" };

const gbp = (minorUnits: number) => formatMoney({ minorUnits, currency: "GBP" });

/**
 * Supporters and campaigns.
 *
 * Ordered by what needs attention, never by value. A list sorted by how much
 * somebody gave tells a fundraiser to ignore small donors, and the signals
 * that actually matter here — an unthanked gift, a broken pattern — apply
 * regardless of amount.
 *
 * There is no engagement score anywhere on this page, and that is a decision
 * rather than an omission. A score compresses several different situations
 * into one number and invites somebody to act on the number; a named stage
 * with its signals says what is actually going on.
 */
export default async function SupportersPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const [supporters, campaigns, threshold] = await Promise.all([
    buildSupporterViews(ctx, repo),
    buildCampaignViews(ctx, repo),
    deriveMajorGiftThreshold(ctx, repo),
  ]);

  const attention = supporters.filter((supporter) => supporter.needsAttention);

  return (
    <div>
      <PageHeader
        eyebrow="Supporters"
        title="Who gives, where they are, and what to do next"
        description="Every supporter has a named stage and the signals behind it. There is no engagement score: a number would compress an unthanked first gift and a lapsed six-year donor into the same thing."
      />

      {attention.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Needs attention</SectionTitle>
          <Card className="border-warning/35">
            <CardBody>
              <ul className="space-y-2">
                {attention.map((supporter) => (
                  <li key={supporter.displayName} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink">{supporter.displayName}</span>
                      <StatusBadge
                        tone="warning"
                        label={STEWARDSHIP_STAGES[supporter.stewardship.stage].label}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {supporter.stewardship.suggestedAction}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      <section className="mb-8">
        <SectionTitle>Supporters</SectionTitle>
        {supporters.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="No supporters yet"
            description="A donation recorded here becomes a transaction in a fund, so it reaches the finance position without a second entry."
          />
        ) : (
          <div className="space-y-3">
            {supporters.map((supporter) => (
              <Card key={supporter.displayName}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-base font-semibold text-ink">
                      {supporter.person ? (
                        <Link
                          href={`/relationships/people/${supporter.person.id}`}
                          className="hover:text-info"
                        >
                          {supporter.displayName}
                        </Link>
                      ) : (
                        supporter.displayName
                      )}
                    </span>
                    <StatusBadge
                      tone={supporter.needsAttention ? "warning" : "info"}
                      label={STEWARDSHIP_STAGES[supporter.stewardship.stage].label}
                    />
                    {supporter.stewardship.overridden && <Pill>set by a person</Pill>}
                    {supporter.profile?.doNotSolicit && (
                      <Pill className="border-critical/30 text-critical">do not solicit</Pill>
                    )}
                    <span className="text-xs text-ink-subtle">
                      {gbp(supporter.totalMinorUnits)} across {supporter.donations.length} gift
                      {supporter.donations.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <p className="text-sm text-ink-muted">{supporter.stewardship.reason}</p>

                  {supporter.stewardship.signals.length > 0 && (
                    <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
                      <p className="eyebrow mb-1.5">Why</p>
                      <ul className="space-y-1">
                        {supporter.stewardship.signals.map((signal) => (
                          <li key={signal.key} className="text-xs text-ink-muted">
                            <span className="text-ink">{signal.label}.</span> {signal.detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-ink-subtle">
                      Next: {supporter.stewardship.suggestedAction}
                    </span>
                    {!supporter.giftAid.claimable && supporter.giftAid.reason && (
                      <span className="text-ink-subtle">Gift Aid: {supporter.giftAid.reason}</span>
                    )}
                    {supporter.giftAid.claimable && (
                      <Pill className="border-success/30 text-success">Gift Aid declared</Pill>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
        {threshold !== undefined && (
          <p className="mt-3 text-xs text-ink-subtle">
            A gift is treated as major above {gbp(threshold)}, derived as a tenth of the largest
            active grant. That is a crude proxy for a figure the organisation should set, and it
            is stated rather than hidden.
          </p>
        )}
      </section>

      {campaigns.length > 0 && (
        <section>
          <SectionTitle>Campaigns</SectionTitle>
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <Card key={campaign.campaignId}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-base font-semibold text-ink">
                      {campaign.name}
                    </span>
                    <StatusBadge
                      tone={campaign.netMinorUnits < 0 ? "critical" : "success"}
                      label={campaign.netMinorUnits < 0 ? "net loss" : "net positive"}
                    />
                    {campaign.percentOfTarget !== undefined && (
                      <Pill>{campaign.percentOfTarget}% of target</Pill>
                    )}
                  </div>

                  {/* Gross and net together. A report showing only the gross
                      figure is the one repeated in a trustee meeting. */}
                  <p className="text-sm text-ink">
                    {gbp(campaign.raisedMinorUnits)} raised, {gbp(campaign.costMinorUnits)} spent,{" "}
                    <span className={campaign.netMinorUnits < 0 ? "text-critical" : ""}>
                      {gbp(campaign.netMinorUnits)} net
                    </span>
                    .
                  </p>
                  <p className="text-xs text-ink-subtle">{campaign.workings}</p>

                  {campaign.behind?.behind && (
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <TrendingDown className="h-3 w-3" />
                      {campaign.behind.reason}
                    </p>
                  )}

                  {campaign.appeals.length > 0 && (
                    <ul className="space-y-1">
                      {campaign.appeals.map((appeal) => (
                        <li key={appeal.appealId} className="text-xs text-ink-subtle">
                          {appeal.name}: {appeal.giftCount} gifts,{" "}
                          {gbp(appeal.raisedMinorUnits)} raised
                          {appeal.responseRatePercent !== undefined
                            ? `, ${appeal.responseRatePercent}% response`
                            : ", response rate unknown because the audience size was not recorded"}
                          {appeal.costPerPound !== undefined
                            ? `, ${appeal.costPerPound} spent per pound raised`
                            : ""}
                          .
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
