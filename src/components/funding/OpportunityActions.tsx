"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { PipelineStage } from "@/types/domain";
import {
  generateFitAssessment,
  moveOpportunityStage,
  toggleSavedOpportunity,
} from "@/server/actions/mutations";
import { Button } from "@/components/shared/ui";
import { useToast } from "@/components/shared/Toast";
import { STAGE_LABELS, STAGE_ORDER } from "@/features/funding/constants";
import { cn } from "@/lib/utils";

export function GenerateFitButton({
  oppId,
  hasAssessment,
}: {
  oppId: string;
  hasAssessment: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { notify } = useToast();
  return (
    <Button
      variant={hasAssessment ? "secondary" : "accent"}
      onClick={() =>
        start(async () => {
          const result = await generateFitAssessment(oppId);
          if (!result.ok) {
            notify(result.message ?? "That action was not permitted.", "error");
            return;
          }
          notify("Fit assessment generated. Review the reasoning below.");
          router.refresh();
        })
      }
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : hasAssessment ? (
        <RefreshCw className="h-4 w-4" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {hasAssessment ? "Refresh assessment" : "Run fit assessment"}
    </Button>
  );
}

export function SaveToggle({ oppId, saved }: { oppId: string; saved: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { notify } = useToast();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={saved ? "Remove from saved" : "Save opportunity"}
      onClick={() =>
        start(async () => {
          const result = await toggleSavedOpportunity(oppId);
          if (!result.ok) {
            notify(result.message ?? "That change was not permitted.", "error");
            return;
          }
          router.refresh();
        })
      }
      disabled={pending}
    >
      <Bookmark className={cn("h-4 w-4", saved && "fill-accent text-accent")} />
    </Button>
  );
}

export function StageSelect({ oppId, stage }: { oppId: string; stage: PipelineStage }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { notify } = useToast();
  const [value, setValue] = useState(stage);
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as PipelineStage;
        setValue(next);
        start(async () => {
          const result = await moveOpportunityStage(oppId, next);
          if (!result.ok) {
            notify(result.message ?? "That change was not permitted.", "error");
            return;
          }
          notify(`Moved to ${STAGE_LABELS[next]}.`);
          router.refresh();
        });
      }}
      className="h-9 rounded border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none focus:shadow-focus"
      aria-label="Pipeline stage"
    >
      {STAGE_ORDER.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
