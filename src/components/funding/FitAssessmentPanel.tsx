import {
  AlertTriangle,
  Check,
  CircleHelp,
  HelpCircle,
  MinusCircle,
} from "lucide-react";
import type { FitAssessment, FactorStatus } from "@/types/domain";
import { FIT_CATEGORY_LABELS } from "@/lib/logic/fit";
import { FIT_TONE } from "@/features/funding/constants";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/shared/ui";
import { cn } from "@/lib/utils";

const FACTOR_ICON: Record<FactorStatus, { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  met: { icon: Check, cls: "text-success" },
  partial: { icon: CircleHelp, cls: "text-warning" },
  uncertain: { icon: HelpCircle, cls: "text-ink-subtle" },
  unmet: { icon: MinusCircle, cls: "text-critical" },
};

/**
 * Explainable fit assessment. Shows the overall score, the factor-by-factor
 * breakdown with rationale, evidence used and assumptions, plus risks, missing
 * information and the recommended next action. This is decision support only.
 */
export function FitAssessmentPanel({ assessment }: { assessment: FitAssessment }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <ScoreRing score={assessment.overallScore} category={assessment.category} />
            <div>
              <StatusBadge
                tone={FIT_TONE[assessment.category]}
                label={FIT_CATEGORY_LABELS[assessment.category]}
              />
              <p className="mt-2 max-w-md text-sm text-ink-muted">
                {assessment.recommendedNextAction}
              </p>
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="eyebrow">Effort</div>
              <div className="mt-1 font-medium capitalize text-ink">{assessment.effortEstimate}</div>
            </div>
            <div>
              <div className="eyebrow">Strategic value</div>
              <div className="mt-1 font-medium capitalize text-ink">{assessment.strategicValue}</div>
            </div>
          </div>
        </div>
      </Card>

      <p className="rounded-md border border-info/25 bg-info-soft px-4 py-2.5 text-xs text-info">
        This assessment is decision support only. It uses information from your
        organisation profile and evidence library. A low score is never a rejection.
        Confirm the assumptions below before deciding whether to apply.
      </p>

      {/* Factors */}
      <div>
        <h3 className="mb-3 text-title font-semibold text-ink">Factor by factor</h3>
        <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-2">
          {assessment.factors.map((f) => {
            const { icon: Icon, cls } = FACTOR_ICON[f.status];
            return (
              <div key={f.key} className="bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", cls)} />
                    <span className="text-sm font-medium text-ink">{f.label}</span>
                  </div>
                  <span className="font-mono text-xs text-ink-subtle">{f.score}</span>
                </div>
                <p className="mt-2 text-sm text-ink-muted">{f.rationale}</p>
                {f.evidenceUsed.length > 0 && (
                  <p className="mt-2 text-xs text-ink-subtle">
                    <span className="font-medium">Uses:</span> {f.evidenceUsed.join(", ")}
                  </p>
                )}
                {f.assumptions.length > 0 && (
                  <p className="mt-1 text-xs text-warning">
                    <span className="font-medium">Assumption:</span> {f.assumptions.join(" ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Risks + missing */}
      <div className="grid gap-5 md:grid-cols-2">
        <InfoList
          title="Key risks"
          icon={AlertTriangle}
          items={assessment.keyRisks}
          empty="No significant risks identified from the available data."
          tone="warning"
        />
        <InfoList
          title="Missing information"
          icon={CircleHelp}
          items={assessment.missingInformation}
          empty="Your profile has the information needed for this assessment."
          tone="info"
        />
      </div>
    </div>
  );
}

function InfoList({
  title,
  icon: Icon,
  items,
  empty,
  tone,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: string[];
  empty: string;
  tone: "warning" | "info";
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon className={cn("h-4 w-4", tone === "warning" ? "text-warning" : "text-info")} />
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-ink-subtle">{empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-muted">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-ink-subtle" />
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function ScoreRing({ score, category }: { score: number; category: string }) {
  const tone = FIT_TONE[category as keyof typeof FIT_TONE];
  const colour =
    tone === "success"
      ? "var(--color-success)"
      : tone === "warning"
        ? "var(--color-warning)"
        : tone === "critical"
          ? "var(--color-critical)"
          : "var(--color-accent)";
  return (
    <div
      className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${colour} ${score * 3.6}deg, var(--color-surface-sunken) 0deg)`,
      }}
    >
      <div className="flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full bg-surface">
        <span className="font-serif text-xl font-medium text-ink">{score}</span>
        <span className="text-[0.6rem] text-ink-subtle">of 100</span>
      </div>
    </div>
  );
}
