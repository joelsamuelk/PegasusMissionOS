import type { Metadata } from "next";
import { CalendarClock, Layers, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, SectionTitle } from "@/components/shared/ui";
import { EmptyState } from "@/components/shared/misc";
import { AttentionCard } from "@/components/intelligence/AttentionCard";
import { AskMissionOs } from "@/components/intelligence/AskMissionOs";
import {
  ATTENTION_CATEGORY_LABELS,
  UNKNOWN_REASON_LABELS,
  isComposite,
} from "@/lib/intelligence";
import { suggestedQuestionList } from "@/lib/intelligence/questions";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import {
  getAttentionBoard,
  getMorningBrief,
} from "@/server/intelligence/mission-intelligence";
import { buildMissionBrief } from "@/lib/intelligence";

export const metadata: Metadata = { title: "Mission Intelligence" };

/**
 * Mission Intelligence.
 *
 * Three surfaces, in the order the brief specifies them: Today, what needs
 * attention, and Ask Mission OS. All three read the same deterministic board,
 * so the answer to "what should I worry about?" cannot disagree with the list
 * of things needing attention — they are the same computation rendered twice.
 */
export default async function IntelligencePage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const organisation = await repo.organisations.get(ctx);
  const { snapshot, board, contextSnapshot } = await getAttentionBoard(ctx, repo);
  const { brief: morning } = await getMorningBrief(ctx, repo);
  const brief = buildMissionBrief({
    snapshot,
    board,
    scope: "organisation",
    contextSnapshot,
    limit: 0,
  });

  const composites = board.items.filter(isComposite);
  const singleDomain = board.items.filter((item) => !isComposite(item));
  const suggestions = suggestedQuestionList();

  return (
    <div>
      <PageHeader
        eyebrow="Mission Intelligence"
        title={`What needs attention at ${organisation?.name ?? "this organisation"}`}
        description="Every item below was produced by a deterministic rule over your own records, and shows the signals behind it. Nothing here is ranked by a model."
      />

      {/* Today */}
      <section className="mb-8">
        <SectionTitle>Today</SectionTitle>
        {morning.quiet ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing needs attention today"
            description="No deadline, obligation or risk currently meets the threshold. This is a statement about your records, not a promise that nothing is happening."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TodayTile
              label="Requiring attention"
              count={morning.needsAttention.length}
              detail={morning.needsAttention[0]?.title}
            />
            <TodayTile
              label="Opportunities"
              count={morning.opportunities.length}
              detail={morning.opportunities[0]?.title}
            />
            <TodayTile
              label="Deadlines within 30 days"
              count={morning.deadlines.length}
              detail={morning.deadlines[0]?.item.title}
            />
            <TodayTile
              label="Relationship risks"
              count={morning.relationshipRisks.length}
              detail={morning.relationshipRisks[0]?.title}
            />
          </div>
        )}
      </section>

      {/* Cross-domain */}
      {composites.length > 0 && (
        <section className="mb-8">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue" />
              Across more than one area
            </span>
          </SectionTitle>
          <p className="mb-4 -mt-2 text-sm text-ink-muted">
            These do not appear in any single module. Each one exists because several
            areas agree, and each shows the separate findings that combined.
          </p>
          <div className="space-y-3">
            {composites.map((item) => (
              <AttentionCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Everything else */}
      <section className="mb-8">
        <SectionTitle>Everything else</SectionTitle>
        {singleDomain.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No single-domain findings"
            description="Everything currently needing attention combines more than one area."
          />
        ) : (
          <div className="space-y-3">
            {singleDomain.map((item) => (
              <AttentionCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* What cannot be answered */}
      {brief.unknowns.length > 0 && (
        <section className="mb-8">
          <SectionTitle>What Mission OS cannot tell you</SectionTitle>
          <Card>
            <CardBody>
              <p className="mb-3 text-sm text-ink-muted">
                Each of these is a question the records cannot currently answer. They are
                listed rather than left blank, because a blank reads as a clean answer.
              </p>
              <ul className="space-y-2.5">
                {brief.unknowns.map((unknown, index) => (
                  <li key={index} className="text-sm">
                    <span className="mr-2 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-xs text-warning">
                      {UNKNOWN_REASON_LABELS[unknown.reason]}
                    </span>
                    <span className="text-ink">{unknown.question}</span>
                    {unknown.resolvedBy && (
                      <p className="mt-0.5 text-xs text-ink-subtle">{unknown.resolvedBy}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      {/* Ask */}
      <section className="mb-8">
        <SectionTitle>Ask Mission OS</SectionTitle>
        <AskMissionOs suggestions={suggestions} />
      </section>

      {/* Provenance of the page itself */}
      <Card>
        <CardBody>
          <p className="eyebrow mb-2">What this page was built from</p>
          <p className="text-xs text-ink-subtle">
            {contextSnapshot.recordCount} records across{" "}
            {contextSnapshot.scopes
              .map((scope) => `${scope.scope} (${scope.records})`)
              .join(", ")}
            , assembled {contextSnapshot.assembledAt}.
            {contextSnapshot.withheld.length > 0 && (
              <>
                {" "}
                Withheld: {contextSnapshot.withheld.map((w) => w.scope).join(", ")}.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-ink-subtle">
            Categories in play:{" "}
            {[...new Set(board.items.map((i) => ATTENTION_CATEGORY_LABELS[i.category]))].join(
              ", ",
            ) || "none"}
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function TodayTile({
  label,
  count,
  detail,
}: {
  label: string;
  count: number;
  detail?: string;
}) {
  return (
    <Card>
      <CardBody>
        <p className="eyebrow">{label}</p>
        <p className="mt-1 font-heading text-2xl font-semibold text-ink">{count}</p>
        {/* No padding: an empty section says it is empty. */}
        <p className="mt-1 line-clamp-2 text-xs text-ink-subtle">
          {detail ?? "Nothing in this category."}
        </p>
      </CardBody>
    </Card>
  );
}
