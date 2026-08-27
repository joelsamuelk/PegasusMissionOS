/**
 * Local aliases for the reporting suite.
 *
 * `ParsedDocumentLike` exists so the ingestion tests can build a parsed
 * document without importing the document parser, which would couple a
 * reporting test to MG-3's byte-level parsers for no benefit.
 */
export type { Claim, ImpactReport, Indicator } from "@/types/domain";

export interface ParsedDocumentLike {
  status: string;
  note?: string;
  text: string;
  blocks: { text: string; locator: string }[];
  wordCount: number;
}
