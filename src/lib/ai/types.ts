import type { AIProvenance } from "@/types/domain";
import type { AiFeature } from "./prompts";

/** Structured, grounded context passed to the AI layer. */
export interface AiContext {
  organisationName: string;
  /** Profile fields available for grounding, keyed by label. */
  profileFields: { label: string; value: string }[];
  /** Evidence available/selected, summarised for grounding. */
  evidence: { title: string; summary: string }[];
  /** Programme and indicator data available for grounding. */
  programmeData: { label: string; value: string }[];
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

export interface AiResult {
  text: string;
  provenance: AIProvenance;
  model: string;
  promptVersion: string;
}

export interface AiProvider {
  readonly name: string;
  generate(feature: AiFeature, context: AiContext): Promise<AiResult>;
}
