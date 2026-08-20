import { runAi, type AiContext, type AiFeature } from "@/lib/ai";
import type { GroundingItem } from "@/lib/knowledge";
import { refKey } from "@/lib/knowledge";
import {
  applyCrossDomain,
  buildMissionBrief,
  buildMorningBrief,
  detectAttention,
  UNKNOWN_REASON_LABELS,
  type AttentionBoard,
  type MissionBrief,
  type MissionBriefScope,
  type MissionSnapshot,
  type MorningBrief,
} from "@/lib/intelligence";
import { answerQuestion, routeQuestion, type QuestionAnswer } from "@/lib/intelligence/questions";
import type { GroundingRecord } from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";
import {
  assembleMissionContext,
  type MissionContextRequest,
} from "./mission-context";

/**
 * The Mission Intelligence service.
 *
 * The pipeline, in the order it must run:
 *
 *   scoped context → deterministic detection → cross-domain composition
 *     → structured brief → optional narration → recorded provenance
 *
 * Narration is last and is optional. Every caller below can produce a complete
 * answer with no model available, which is what makes the AI layer safe to
 * turn off: the Settings switch removes the prose and leaves the reasoning.
 */

export interface IntelligenceOptions extends MissionContextRequest {
  /** Off by default. A brief is complete without it. */
  narrate?: boolean;
  limit?: number;
}

export interface BoardResult {
  snapshot: MissionSnapshot;
  board: AttentionBoard;
  contextSnapshot: MissionBrief["contextSnapshot"];
}

export async function getAttentionBoard(
  ctx: RequestContext,
  repo: MissionRepository,
  options: MissionContextRequest = {},
): Promise<BoardResult> {
  const { snapshot, contextSnapshot } = await assembleMissionContext(ctx, repo, options);
  const board = applyCrossDomain(snapshot, detectAttention(snapshot));
  return { snapshot, board, contextSnapshot };
}

/**
 * Findings as grounding.
 *
 * The model is offered the *conclusions* — each with its subject as a
 * resolvable reference — and never the underlying records. That is not a
 * convenience: an item's `detail` was composed from records the model has
 * already been prevented from seeing in raw form, so this is also the boundary
 * that stops a narration request becoming a data export.
 */
function briefGrounding(brief: MissionBrief): {
  findings: GroundingItem[];
  unknowns: GroundingItem[];
} {
  const findings: GroundingItem[] = [
    ...brief.risks.map((item) => ({
      ref: item.subject,
      label: item.title,
      value: item.detail,
    })),
    ...brief.opportunities.map((item) => ({
      ref: item.subject,
      label: item.title,
      value: item.detail,
    })),
    ...brief.calculations.map((statement) => ({
      ref: statement.sources[0] ?? { type: "organisation" as const, id: brief.organisationId },
      label: statement.text,
      value: statement.workings ?? statement.text,
    })),
    ...brief.facts.map((statement) => ({
      ref: statement.sources[0] ?? { type: "organisation" as const, id: brief.organisationId },
      label: statement.text,
      value: statement.text,
    })),
  ];

  const unknowns: GroundingItem[] = brief.unknowns.map((unknown, index) => ({
    ref: unknown.subject ?? {
      type: "organisation" as const,
      id: `${brief.organisationId}:unknown:${index}`,
    },
    label: unknown.question,
    value: `${UNKNOWN_REASON_LABELS[unknown.reason]}. ${unknown.resolvedBy ?? "Nothing resolves this; the question does not apply."}`,
  }));

  return { findings, unknowns };
}

function groundingRecord(
  result: Awaited<ReturnType<typeof runAi>>,
  at: Date,
): GroundingRecord {
  return {
    used: result.grounding.used,
    unused: result.grounding.unused,
    assumptions: result.grounding.assumptions,
    couldNotVerify: result.grounding.couldNotVerify,
    model: result.model,
    promptVersion: result.promptVersion,
    usedFallback: result.usedFallback,
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    generatedAt: at.toISOString(),
  };
}

/**
 * Narrate an assembled brief.
 *
 * Failure here degrades the brief rather than failing the request. A caller
 * that could not reach a provider still has every finding, calculation and
 * unknown; it simply has no paragraph in front of them.
 */
async function narrate(
  ctx: RequestContext,
  repo: MissionRepository,
  feature: AiFeature,
  brief: MissionBrief,
  context: Partial<AiContext>,
): Promise<MissionBrief> {
  const organisation = await repo.organisations.get(ctx);
  if (!organisation?.aiEnabled) return brief;

  const { findings, unknowns } = briefGrounding(brief);
  const aiContext: AiContext = {
    organisationName: organisation.name,
    profileFields: [],
    // Findings occupy `programmeData` and unknowns occupy `evidence`. The
    // field names are the shipped `AiContext` shape rather than a good fit;
    // renaming them would touch four other features for no behavioural gain,
    // so the mapping is stated here instead of being guessed at the call site.
    programmeData: findings,
    evidence: unknowns,
    guidance: brief.summary,
    ...context,
  };

  try {
    const result = await runAi(feature, aiContext);
    const provenance = groundingRecord(result, ctx.now());

    await repo.audit.recordAiGeneration(ctx, {
      feature,
      model: result.model,
      promptVersion: result.promptVersion,
      inputRefs: [`brief:${brief.scope}`, ...provenance.used.map(refKey)],
      outputPreview: result.text.slice(0, 200),
      // A brief is read and acted on by a human. It is not approved because
      // nobody had to click anything.
      approvalStatus: "pending",
    });

    return {
      ...brief,
      narrative: result.text,
      model: result.model,
      promptVersion: result.promptVersion,
      provenance,
      usedFallback: result.usedFallback,
    };
  } catch {
    // Deliberately swallowed and deliberately silent in the output: a brief
    // with no narrative is a brief, and a caller that cannot tell the
    // difference is reading the structured fields, which is the intended use.
    return brief;
  }
}

export async function getMissionBrief(
  ctx: RequestContext,
  repo: MissionRepository,
  options: IntelligenceOptions = {},
): Promise<MissionBrief> {
  const { snapshot, board, contextSnapshot } = await getAttentionBoard(ctx, repo, options);
  const scope: MissionBriefScope = options.focus
    ? options.focus.type === "grant"
      ? "grant"
      : options.focus.type === "programme"
        ? "programme"
        : "organisation"
    : "organisation";

  const brief = buildMissionBrief({
    snapshot,
    board,
    scope,
    contextSnapshot,
    subject: options.focus,
    limit: options.limit,
  });

  return options.narrate ? narrate(ctx, repo, "mission_brief", brief, {}) : brief;
}

export interface MorningBriefResult {
  brief: MorningBrief;
  contextSnapshot: MissionBrief["contextSnapshot"];
}

export async function getMorningBrief(
  ctx: RequestContext,
  repo: MissionRepository,
  options: MissionContextRequest = {},
): Promise<MorningBriefResult> {
  const { snapshot, board, contextSnapshot } = await getAttentionBoard(ctx, repo, options);
  return { brief: buildMorningBrief(snapshot, board), contextSnapshot };
}

export interface MissionAnswerResult {
  answer: QuestionAnswer;
  brief: MissionBrief;
  /** Which handler routed the question, so the UI can say what it understood. */
  handlerId: string;
}

/**
 * Ask Mission OS.
 *
 * The question decides the scopes. That is a security property as much as a
 * performance one: a question about reporting deadlines has no reason to
 * assemble the relationship layer, and a context that is not assembled cannot
 * leak.
 */
export async function askMissionOs(
  ctx: RequestContext,
  repo: MissionRepository,
  question: string,
  options: IntelligenceOptions = {},
): Promise<MissionAnswerResult> {
  const handler = routeQuestion(question);
  const { snapshot, board, contextSnapshot } = await getAttentionBoard(ctx, repo, options);
  const answer = answerQuestion(question, snapshot, board);

  const base = buildMissionBrief({
    snapshot,
    board,
    scope: "question",
    contextSnapshot,
    question,
    limit: options.limit ?? 5,
  });

  const brief: MissionBrief = {
    ...base,
    headline: answer.headline,
    // The routed answer's statements replace the generic ones, sorted into the
    // brief's kinds so a caller reading `facts` never finds an inference in it.
    facts: answer.statements.filter((s) => s.kind === "fact"),
    calculations: answer.statements.filter((s) => s.kind === "calculation"),
    inferences: answer.statements.filter((s) => s.kind === "inference"),
    risks: answer.items,
    unknowns: answer.unknowns,
    sources: answer.sources.length ? answer.sources : base.sources,
  };

  const narrated = options.narrate
    ? await narrate(ctx, repo, "mission_answer", brief, { question })
    : brief;

  return { answer, brief: narrated, handlerId: handler.id };
}
