import { CircleHelp } from "lucide-react";
import { humanise } from "@/lib/formatting";
import type { RelationshipPreview } from "@/lib/marketing/preview";
import {
  AppFrame,
  PreviewCaption,
  Section,
  SectionHeader,
} from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Relationships.
 *
 * The brief rendered here is the product's own — `buildRelationshipView()` run
 * against the seeded Henderson Trust records at build time — and that matters
 * for the claim the section makes. The brief is **assembled from records, not
 * generated**: no model runs, which is why there is no confidence percentage
 * on it and why it can be read in the ten minutes before a funder call.
 *
 * Two things are deliberately not claimed here. Email and calendar sync are
 * designed, with the provider boundary declared, and not built — so the
 * section never shows a synced inbox. And what Pegasus does *not* know is
 * printed rather than omitted, because a brief that quietly drops the fact
 * that nothing was ever recorded is worse than one that says so.
 */
export function RelationshipDemo({
  relationship,
}: {
  relationship: RelationshipPreview;
}) {
  return (
    <Section id="relationships" tone="surface" bordered>
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div>
          <SectionHeader
            id="relationships"
            eyebrow="Relationships"
            title="Your relationships shouldn't disappear into inboxes."
            lead="The person who knows the funder leaves, and four years of context leaves with them. Pegasus holds people, organisations, interactions and commitments in the same model as the funding and the delivery, so the history belongs to the organisation."
          />

          <ul className="mt-8 flex flex-col gap-2.5">
            {[
              "Person",
              "Organisation",
              "Funding",
              "Programme",
              "Communication",
              "Commitment",
              "Impact",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 text-[0.9375rem] text-ink-muted"
              >
                <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-8 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
            All one record set. That is why the panel opposite can show a four-year
            history, the live grant, the report the funder is waiting for and the thing
            your team promised them, without anyone assembling it.
          </p>
        </div>

        <Reveal>
          <AppFrame path="/relationships/xorg-henderson" label="Relationships">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-heading text-[1.15rem] font-semibold tracking-tight text-ink">
                    {relationship.name}
                  </h3>
                  <p className="mt-1 text-[0.8125rem] text-ink-muted">
                    {relationship.headline}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full border border-success/30 bg-success-soft px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-success">
                  {humanise(relationship.healthState)}
                </span>
              </div>

              <div className="mt-2 rounded-md border border-line bg-paper px-3 py-2 text-[0.75rem] text-ink-muted">
                {relationship.healthReason}
              </div>

              <div className="mt-5 flex flex-col gap-5">
                {relationship.sections.map((section) => (
                  <section key={section.title}>
                    <h4 className="eyebrow">{section.title}</h4>
                    <dl className="mt-2 flex flex-col gap-1.5">
                      {section.lines.map((line, i) => (
                        <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                          <dt className="min-w-[9rem] flex-shrink-0 text-[0.8125rem] text-ink-subtle">
                            {line.label}
                          </dt>
                          <dd className="text-[0.8125rem] leading-snug text-ink">
                            {line.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}

                {relationship.discussionPoints.length > 0 && (
                  <section>
                    <h4 className="eyebrow">Suggested discussion points</h4>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {relationship.discussionPoints.map((point, i) => (
                        <li key={i} className="flex gap-2 text-[0.8125rem]">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                            aria-hidden
                          />
                          <span className="text-ink">
                            <span className="text-ink-subtle">{point.label}: </span>
                            {point.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="rounded-md border border-dashed border-line-strong bg-surface-sunken/70 p-3.5">
                  <h4 className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                    <CircleHelp className="h-3 w-3" aria-hidden />
                    Not recorded in Pegasus
                  </h4>
                  {relationship.missing.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {relationship.missing.map((item, i) => (
                        <li key={i} className="text-[0.8125rem] text-ink-muted">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[0.8125rem] text-ink-muted">
                      Nothing material is missing from this relationship. When something
                      is, it is printed here rather than left out.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </AppFrame>

          <PreviewCaption>
            Assembled from the demo workspace&rsquo;s own records. No model ran, which
            is why there is no confidence score on it. The Henderson Trust is a
            fictional funder in the seeded demo data. Email and calendar sync are
            designed and not yet built, so nothing here arrived from an inbox.
          </PreviewCaption>
        </Reveal>
      </div>
    </Section>
  );
}
