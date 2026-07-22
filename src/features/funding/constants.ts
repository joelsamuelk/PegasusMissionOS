import type { FitCategory, PipelineStage } from "@/types/domain";
import type { Tone } from "@/components/shared/StatusBadge";

export const STAGE_ORDER: PipelineStage[] = [
  "discovered",
  "reviewing",
  "qualified",
  "applying",
  "internal_review",
  "ready_to_submit",
  "submitted",
  "decision_pending",
  "successful",
  "unsuccessful",
  "archived",
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  discovered: "Discovered",
  reviewing: "Reviewing",
  qualified: "Qualified",
  applying: "Applying",
  internal_review: "Internal review",
  ready_to_submit: "Ready to submit",
  submitted: "Submitted",
  decision_pending: "Decision pending",
  successful: "Successful",
  unsuccessful: "Unsuccessful",
  archived: "Archived",
};

/** Stages shown as columns in the Kanban board (active journey). */
export const KANBAN_STAGES: PipelineStage[] = [
  "discovered",
  "reviewing",
  "qualified",
  "applying",
  "internal_review",
  "ready_to_submit",
  "submitted",
  "decision_pending",
];

export const STAGE_TONE: Record<PipelineStage, Tone> = {
  discovered: "neutral",
  reviewing: "info",
  qualified: "info",
  applying: "accent",
  internal_review: "accent",
  ready_to_submit: "accent",
  submitted: "info",
  decision_pending: "warning",
  successful: "success",
  unsuccessful: "critical",
  archived: "neutral",
};

export const FIT_TONE: Record<FitCategory, Tone> = {
  strong_match: "success",
  potential_match: "info",
  review_required: "warning",
  not_eligible: "critical",
};
