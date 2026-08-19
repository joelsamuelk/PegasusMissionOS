import type { GroundingItem, ObservedGrounding } from "@/lib/knowledge";
import type { AiFeature } from "./prompts";

/**
 * Structured, grounded context passed to the AI layer.
 *
 * Every grounding item carries an `EntityReference`, not a bare label. That is
 * what makes provenance checkable: a generation reports the references it used,
 * and anything it did not receive is rejected (audit S2).
 */
export interface AiContext {
  organisationName: string;
  /** Profile fields available for grounding. */
  profileFields: GroundingItem[];
  /** Evidence available/selected, summarised for grounding. */
  evidence: GroundingItem[];
  /** Programme and indicator data available for grounding. */
  programmeData: GroundingItem[];
  /** The funder question or the report section, where relevant. */
  question?: string;
  guidance?: string;
  priorityThemes?: string[];
  wordLimit?: number;
  /** Existing draft to transform (improve, shorten, etc.). */
  draft?: string;
  /** Free-form user query for the command bar. */
  query?: string;
  /** Report section key for report generation. */
  sectionKey?: string;
  sectionTitle?: string;
}

/** Every grounding item offered to a generation, in one list. */
export function offeredItems(context: AiContext): GroundingItem[] {
  return [...context.profileFields, ...context.programmeData, ...context.evidence];
}

export interface AiResult {
  text: string;
  grounding: ObservedGrounding;
  model: string;
  promptVersion: string;
  /**
   * True when a live provider failed and the deterministic mock answered.
   * Structured metadata rather than a suffix on `model` (audit S7), so the UI
   * can never present mock output as live generation by accident.
   */
  usedFallback: boolean;
  fallbackReason?: string;
}

export interface AiProvider {
  readonly name: string;
  generate(feature: AiFeature, context: AiContext): Promise<AiResult>;
}
