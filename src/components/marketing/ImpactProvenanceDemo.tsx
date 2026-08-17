"use client";

import { useId, useState } from "react";
import { ArrowDownRight, BadgeCheck, CircleHelp, FileSearch } from "lucide-react";
import { humanise } from "@/lib/formatting";
import type { ProvenancePreview } from "@/lib/marketing/preview";
import { StatusChip } from "@/components/marketing/primitives";
import { cn } from "@/lib/utils";

/**
 * The provenance drill-down: click a figure, see where it came from.
 *
 * This is built on Evidence and Claims, both of which exist. A claim records
 * its value, its kind, its verification state, the evidence item and locator
 * it was read from, the period it covers, who verified it and when, and what
 * it has been used in. Claims are immutable — a correction supersedes rather
 * than edits, which is what makes a report published in March still honest in
 * September.
 *
 * The second figure is the interesting one. It is a *forecast* standing on a
 * fact and an assumption, and Pegasus labels it as a forecast however exact
 * its arithmetic looks, because certainty is inherited. A calculation resting
 * on an assumption is not a calculation.
 *
 * What is deliberately not claimed: reports are not yet rebuilt from live
 * claims — a published report still holds copied prose, and that is the next
 * slice. The chip says so, and the component's shape does not have to change
 * when it lands.
 *
 * Mobile note: the panel opens *below* the figure rather than beside it, and
 * focus moves to it, because a panel that appears off-screen is a panel a
 * touch user never sees.
 */
export function ImpactProvenanceDemo({
  provenance,
}: {
  provenance: ProvenancePreview;
}) {
  const [selected, setSelected] = useState<"fact" | "forecast">("fact");
  const panelId = useId();

  const claim = selected === "fact" ? provenance.claim : provenance.forecast;
  const support =
    selected === "fact" ? provenance.supportChain : provenance.forecastSupport;

  if (!claim) return null;

  const source = claim.sources[0];
  const verified = claim.verification === "verified";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-ink-subtle" aria-hidden />
          <h3 className="font-heading text-[0.9375rem] font-semibold text-ink">
            Where did this figure come from?
          </h3>
        </div>
        <StatusChip status="demo" />
      </div>

      <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
        {/* The figures */}
        <div className="border-b border-line p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
            Select a figure to open its provenance. Both are real claims in the demo
            workspace, and they are deliberately different shapes.
          </p>

          <div className="mt-4 flex flex-col gap-2.5">
            <FigureButton
              selected={selected === "fact"}
              onSelect={() => setSelected("fact")}
              panelId={panelId}
              kind="Fact"
              text={provenance.claim.text}
            />
            {provenance.forecast && (
              <FigureButton
                selected={selected === "forecast"}
                onSelect={() => setSelected("forecast")}
                panelId={panelId}
                kind="Forecast"
                text={provenance.forecast.text}
              />
            )}
          </div>

          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-subtle">
            The second figure&rsquo;s arithmetic is exact, and Pegasus still records it
            as a forecast — because it stands on an assumption nobody has approved.
            Certainty is inherited, not asserted.
          </p>
        </div>

        {/* The provenance panel */}
        <div
          id={panelId}
          role="region"
          aria-live="polite"
          aria-label="Provenance detail"
          tabIndex={-1}
          className="p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em]",
                verified
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-warning/30 bg-warning-soft text-warning",
              )}
            >
              {verified ? (
                <BadgeCheck className="h-3 w-3" aria-hidden />
              ) : (
                <CircleHelp className="h-3 w-3" aria-hidden />
              )}
              {verified ? "Verified" : "Needs review"}
            </span>
            <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              {claim.kind}
            </span>
            {typeof claim.confidence === "number" && (
              <span className="text-[0.7rem] text-ink-subtle">
                producer confidence {Math.round(claim.confidence * 100)}%
                <span className="sr-only">
                  . Confidence never promotes verification state.
                </span>
              </span>
            )}
          </div>

          <dl className="mt-4 flex flex-col gap-2.5">
            <Row label="Value">{claim.text}</Row>
            <Row label="Subject">{claim.subject.label ?? claim.subject.id}</Row>
            <Row label="Period">{claim.periodLabel ?? periodFrom(claim.validFrom, claim.validUntil)}</Row>
            <Row label="Source">
              {source
                ? `${provenance.evidence?.title ?? source.ref.label ?? source.ref.id}`
                : "No external source — derived from your own records"}
            </Row>
            {source?.locator && <Row label="Locator">{source.locator}</Row>}
            {source && <Row label="Source authority">{humanise(source.authority)}</Row>}
            <Row label="Produced by">{describeProducer(claim.producedBy)}</Row>
            {claim.workings && <Row label="Working">{claim.workings}</Row>}
            <Row label="Related programme">{provenance.programmeName}</Row>
            <Row label="Related grant">{provenance.grantTitle}</Row>
          </dl>

          {support.length > 0 && (
            <div className="mt-4 rounded-lg border border-line bg-paper p-3.5">
              <div className="eyebrow">Stands on</div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {support.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <ArrowDownRight
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-subtle"
                      aria-hidden
                    />
                    <span className="text-[0.8125rem] leading-snug text-ink-muted">
                      <span className="font-medium uppercase tracking-[0.06em] text-ink-subtle">
                        {s.kind}
                      </span>{" "}
                      — {s.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(claim.assumptions.length > 0 || claim.caveats.length > 0) && (
            <div className="mt-3 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3">
              <div className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-warning">
                Assumptions and caveats
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {[...claim.assumptions, ...claim.caveats].map((item) => (
                  <li key={item} className="text-[0.75rem] leading-snug text-ink-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FigureButton({
  selected,
  onSelect,
  panelId,
  kind,
  text,
}: {
  selected: boolean;
  onSelect: () => void;
  panelId: string;
  kind: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      aria-controls={panelId}
      className={cn(
        "rounded-xl border p-4 text-left transition-all duration-fast ease-calm",
        selected
          ? "border-accent/40 bg-accent-soft shadow-elev-1"
          : "border-line bg-paper hover:border-line-strong",
      )}
    >
      <span
        className={cn(
          "text-[0.65rem] font-semibold uppercase tracking-[0.1em]",
          selected ? "text-accent-ink" : "text-ink-subtle",
        )}
      >
        {kind}
      </span>
      <span className="mt-1.5 block text-[0.9375rem] font-medium leading-snug text-ink">
        {text}
      </span>
      <span className="mt-1.5 block text-[0.7rem] text-ink-subtle">
        {selected ? "Showing provenance" : "Show provenance"}
      </span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="min-w-[8.5rem] flex-shrink-0 text-[0.75rem] uppercase tracking-[0.06em] text-ink-subtle">
        {label}
      </dt>
      <dd className="text-[0.8125rem] leading-snug text-ink">{children}</dd>
    </div>
  );
}

function periodFrom(from?: string, until?: string): string {
  if (from && until) return `${from} to ${until}`;
  if (from) return `From ${from}`;
  return "Not period-bound";
}

function describeProducer(producer: ProvenancePreview["claim"]["producedBy"]): string {
  switch (producer.method) {
    case "human":
      return "A person in your team";
    case "calculation":
      return `Calculation · ${producer.function} v${producer.version}`;
    case "extraction":
      return `Extraction · ${producer.extractionMethod}`;
    case "model":
      return `Model · ${producer.provider} ${producer.model}`;
  }
}
