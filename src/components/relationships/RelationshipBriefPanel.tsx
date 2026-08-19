import { CircleHelp, FileSearch } from "lucide-react";
import type { RelationshipBrief } from "@/lib/logic/relationship-brief";
import { Card, CardBody } from "@/components/shared/ui";

/**
 * The relationship brief: "prepare me for this meeting".
 *
 * Assembled from Mission Graph records, not generated. That is why it can be
 * read minutes before a funder meeting and relied on. Two consequences are
 * visible in this component:
 *
 * - There is no confidence percentage and no AI label, because no model ran.
 * - What Pegasus *does not* know is printed, not omitted. A brief that quietly
 *   drops the fact that no interaction was ever recorded is worse than one
 *   that says so.
 */
export function RelationshipBriefPanel({ brief }: { brief: RelationshipBrief }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-ink-subtle" />
          <h2 className="text-title font-semibold text-ink">Relationship brief</h2>
        </div>
        <span className="eyebrow">Assembled from your records</span>
      </div>

      <CardBody className="flex flex-col gap-5">
        <p className="text-sm text-ink-muted">{brief.headline}</p>

        {brief.sections.map((section) => (
          <section key={section.key}>
            <h3 className="eyebrow mb-2">{section.title}</h3>
            <dl className="flex flex-col gap-1.5">
              {section.lines.map((line, i) => (
                <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                  <dt className="min-w-[10rem] text-sm text-ink-subtle">{line.label}</dt>
                  <dd className="text-sm text-ink">{line.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        {brief.discussionPoints.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2">Suggested discussion points</h3>
            <ul className="flex flex-col gap-1.5">
              {brief.discussionPoints.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                  <span className="text-ink">
                    <span className="text-ink-subtle">{point.label}: </span>
                    {point.value}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {brief.missing.length > 0 && (
          <section className="rounded-md border border-dashed border-line-strong bg-surface-sunken p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <CircleHelp className="h-3.5 w-3.5" />
              Not recorded in Pegasus
            </h3>
            <ul className="flex flex-col gap-1">
              {brief.missing.map((item, i) => (
                <li key={i} className="text-sm text-ink-muted">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardBody>
    </Card>
  );
}
