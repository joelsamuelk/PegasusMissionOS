import { CircleDot, FileSearch, Target } from "lucide-react";
import { formatCurrencyCompact, deadlineInfo } from "@/lib/formatting";
import type { CommandCentrePreview, FundingPreview, ProvenancePreview } from "@/lib/marketing/preview";
import { AppFrame, MiniMetric } from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

const TONE_DOT: Record<string, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  info: "bg-accent",
};

/**
 * The hero product composition.
 *
 * Not a screenshot, and deliberately not a single screen either. The argument
 * the section above makes is that the domains are connected; a lone dashboard
 * image does not demonstrate that, so the Command Centre sits at the centre
 * with two satellites showing that a funding assessment and a piece of
 * evidence provenance are the *same organisation's* records, reachable from
 * the same position.
 *
 * Every figure here comes from the seeded workspace through the repository —
 * the pipeline value, the deadline urgency, the fit score, the participant
 * count and its source page are all read, never written.
 *
 * It renders inside a `<Section>` and brings no width or padding of its own:
 * it used to sit directly under the hero and carried its own container, which
 * double-padded it the moment it moved into one.
 */
export function ProductComposition({
  command,
  funding,
  provenance,
}: {
  command: CommandCentrePreview;
  funding: FundingPreview;
  provenance: ProvenancePreview | null;
}) {
  const { metrics } = command;

  return (
    <div className="relative pb-10">
      <Reveal>
        <div className="relative">
          <AppFrame path="/dashboard" label="Command Centre">
            <div className="p-4 sm:p-6">
              <div className="eyebrow">Command Centre</div>
              <h3 className="mt-2 font-heading text-[1.05rem] font-semibold tracking-tight text-ink sm:text-[1.25rem]">
                Good morning. Here is where {command.organisationName} stands.
              </h3>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MiniMetric
                  label="Funding pipeline"
                  value={formatCurrencyCompact(metrics.pipelineValue)}
                  hint={`${metrics.pipelineCount} live opportunities`}
                />
                <MiniMetric
                  label="Applications"
                  value={metrics.inProgressCount}
                  hint="Being drafted or reviewed"
                />
                <MiniMetric
                  label="Active grants"
                  value={metrics.activeGrantsCount}
                  hint={`${formatCurrencyCompact(metrics.securedThisYear)} secured this year`}
                />
                <MiniMetric
                  label="Reports due"
                  value={metrics.reportsDue}
                  hint={`${metrics.outcomesAwaitingEvidence} outcomes awaiting evidence`}
                  tone={metrics.reportsDue > 0 ? "warning" : "neutral"}
                />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface">
                  <div className="border-b border-line px-4 py-2.5 text-[0.8125rem] font-semibold text-ink">
                    Priorities for the week
                  </div>
                  <ul className="px-4 py-1">
                    {command.priorities.map((p) => (
                      <li
                        key={p.title}
                        className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0"
                      >
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${TONE_DOT[p.tone] ?? "bg-accent"}`}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block text-[0.8125rem] font-medium leading-snug text-ink">
                            {p.title}
                          </span>
                          <span className="block text-[0.75rem] leading-snug text-ink-muted">
                            {p.detail}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-line bg-surface">
                  <div className="border-b border-line px-4 py-2.5 text-[0.8125rem] font-semibold text-ink">
                    Upcoming deadlines
                  </div>
                  <ul className="px-4 py-1">
                    {command.deadlines.map((d) => {
                      const info = deadlineInfo(d.deadline, command.now);
                      return (
                        <li
                          key={d.label}
                          className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[0.8125rem] font-medium text-ink">
                              {d.label}
                            </span>
                            <span className="block truncate text-[0.75rem] text-ink-subtle">
                              {d.sublabel}
                            </span>
                          </span>
                          <span
                            className={`flex-shrink-0 whitespace-nowrap text-[0.7rem] font-medium ${
                              info.tone === "critical"
                                ? "text-critical"
                                : info.tone === "warning"
                                  ? "text-warning"
                                  : "text-ink-muted"
                            }`}
                          >
                            {info.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          </AppFrame>

          {/* Satellites.
              An earlier version floated these over the frame's edges. It
              looked layered and it covered the priorities list, which is the
              part of the Command Centre actually worth reading — a composition
              that hides the product to look composed. They sit below it now,
              connected by a hairline, which carries the same "these are the
              same organisation's records" claim without obscuring anything. */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Satellite
              icon={Target}
              domain="Funding"
              title={funding.opportunityTitle}
            >
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-heading text-[1.9rem] font-semibold leading-none tracking-tight text-ink">
                  {funding.fit.overallScore}
                </span>
                <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-success">
                  {funding.categoryLabel}
                </span>
              </div>
              <p className="mt-2 text-[0.7rem] leading-snug text-ink-muted">
                Computed from {funding.fit.factors.length} weighted factors. Eligibility
                met on organisation type and operating region.
              </p>
            </Satellite>

            {provenance && (
              <Satellite
                icon={FileSearch}
                domain="Evidence"
                title="Where this figure came from"
              >
                <p className="mt-2.5 text-[0.8125rem] leading-snug text-ink">
                  {provenance.claim.text}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-ink-subtle">
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <CircleDot className="h-3 w-3" aria-hidden />
                    Verified
                  </span>
                  <span aria-hidden>·</span>
                  {provenance.evidence?.title ?? "Source evidence"}
                  {provenance.claim.sources[0]?.locator && (
                    <>
                      <span aria-hidden>·</span>
                      {provenance.claim.sources[0].locator}
                    </>
                  )}
                </p>
              </Satellite>
            )}
          </div>
        </div>
      </Reveal>

    </div>
  );
}

function Satellite({
  icon: Icon,
  domain,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  domain: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-line bg-surface p-4 shadow-elev-2">
      {/* Hairline back up to the frame: the connection, drawn rather than
          claimed. Decorative, so it is hidden from assistive technology. */}
      <span
        className="absolute -top-5 left-8 h-5 w-px bg-line-strong"
        aria-hidden
      />
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
        <span className="eyebrow text-[0.6rem]">{domain}</span>
      </div>
      <div className="mt-1.5 text-[0.8125rem] font-semibold leading-snug text-ink">
        {title}
      </div>
      {children}
    </div>
  );
}
