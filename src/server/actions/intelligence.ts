"use server";

import type { MissionBrief, MorningBrief } from "@/lib/intelligence";
import type { QuestionAnswer } from "@/lib/intelligence/questions";
import { suggestedQuestionList } from "@/lib/intelligence/questions";
import { getRepository } from "@/server/data";
import { resolveRequestContext } from "@/server/context/request-context";
import { authorise, authoriseAi } from "./authorise";
import {
  askMissionOs,
  getAttentionBoard,
  getMissionBrief,
  getMorningBrief,
} from "@/server/intelligence/mission-intelligence";
import type { AttentionItem } from "@/lib/intelligence";

/**
 * Mission Intelligence entry points.
 *
 * Two gates, and the difference between them matters:
 *
 * - **Reading the board or the brief needs `read`.** These are deterministic
 *   computations over records the caller may already see, so requiring
 *   `ai:use` would withhold the organisation's own findings from a trustee
 *   reviewer for no reason. It would also make the AI switch in Settings
 *   silently disable a non-AI capability.
 * - **Narration needs `ai:use` and the workspace switch.** That is the only
 *   part a model touches.
 */

export interface AttentionResult {
  ok: boolean;
  items: AttentionItem[];
  error?: string;
}

export async function loadAttention(): Promise<AttentionResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, items: [], error: auth.result.message };
  const { board } = await getAttentionBoard(auth.ctx, getRepository());
  return { ok: true, items: board.items };
}

export interface BriefResult {
  ok: boolean;
  brief?: MissionBrief;
  error?: string;
}

/**
 * The organisation brief.
 *
 * `narrate` is requested by the caller and then independently authorised: a
 * caller asking for prose without `ai:use` gets the brief without it rather
 * than a refusal, because the structured brief is what they were entitled to
 * and withholding it would be a worse answer than the one they asked for.
 */
export async function loadMissionBrief(narrate = false): Promise<BriefResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const mayNarrate = narrate && (await authoriseAi()).ok;
  const brief = await getMissionBrief(auth.ctx, getRepository(), { narrate: mayNarrate });
  return { ok: true, brief };
}

export interface MorningResult {
  ok: boolean;
  brief?: MorningBrief;
  error?: string;
}

export async function loadMorningBrief(): Promise<MorningResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };
  const { brief } = await getMorningBrief(auth.ctx, getRepository());
  return { ok: true, brief };
}

export interface AskResult {
  ok: boolean;
  answer?: QuestionAnswer;
  brief?: MissionBrief;
  handlerId?: string;
  error?: string;
}

export async function ask(question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false, error: "Ask a question about your organisation." };

  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const mayNarrate = (await authoriseAi()).ok;
  const { answer, brief, handlerId } = await askMissionOs(
    auth.ctx,
    getRepository(),
    trimmed,
    { narrate: mayNarrate },
  );
  return { ok: true, answer, brief, handlerId };
}

/** The suggested questions, for the UI. Deterministic, not generated. */
export async function suggestedQuestions(): Promise<{ id: string; label: string }[]> {
  await resolveRequestContext();
  return suggestedQuestionList();
}
