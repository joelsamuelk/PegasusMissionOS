import type {
  InternalTask,
  ProspectOrganisation,
  SalesOpportunity,
  SalesPipelineStage,
} from "./types";

/**
 * What the Command Centre can state from records that exist.
 *
 * A figure is `null` when nothing records it, and a number when something
 * does. The distinction carries the whole point of this module: a pipeline of
 * `£0` claims every opportunity is worthless, while "not recorded" says no
 * opportunity carries a value yet. The page renders the two differently.
 */
export interface CommandCentreSummary {
  prospects: number;
  awaitingResearch: number;
  openOpportunities: number;
  qualifiedOpportunities: number;
  proposalsOpen: number;
  clientsWon: number;
  pipelineValue: number | null;
  weightedPipelineValue: number | null;
  opportunitiesWithNextAction: number;
  openTasks: number;
  overdueTasks: number;
}

const CLOSED: SalesPipelineStage[] = ["won", "lost", "nurture"];
const QUALIFIED: SalesPipelineStage[] = [
  "qualified",
  "contacted",
  "engaged",
  "demo",
  "evaluating",
  "proposal",
];

/** Sum only the values that exist; return null when none of them do. */
function total(values: (number | undefined)[]): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

export function summariseCommandCentre(input: {
  prospects: ProspectOrganisation[];
  opportunities: SalesOpportunity[];
  tasks: InternalTask[];
  now: Date;
}): CommandCentreSummary {
  const open = input.opportunities.filter((item) => !CLOSED.includes(item.stage));
  const live = input.tasks.filter(
    (task) => task.status === "open" || task.status === "in_progress",
  );
  return {
    prospects: input.prospects.length,
    awaitingResearch: input.prospects.filter((item) => item.status === "discovered")
      .length,
    openOpportunities: open.length,
    qualifiedOpportunities: input.opportunities.filter((item) =>
      QUALIFIED.includes(item.stage),
    ).length,
    proposalsOpen: input.opportunities.filter((item) => item.stage === "proposal").length,
    clientsWon: input.opportunities.filter((item) => item.stage === "won").length,
    pipelineValue: total(open.map((item) => item.expectedValue)),
    weightedPipelineValue: total(
      open.map((item) =>
        typeof item.expectedValue === "number" && typeof item.probability === "number"
          ? (item.expectedValue * item.probability) / 100
          : undefined,
      ),
    ),
    opportunitiesWithNextAction: open.filter((item) => item.nextAction?.trim()).length,
    openTasks: live.length,
    overdueTasks: live.filter(
      (task) => task.dueAt && new Date(task.dueAt).getTime() < input.now.getTime(),
    ).length,
  };
}

export const formatPounds = (value: number | null): string =>
  value === null
    ? "Not recorded"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
      }).format(value);
