import type { DocumentFormat, DocumentParseStatus } from "@/types/domain";

/**
 * Document parsing.
 *
 * The governing rule, from the MG-3 brief: **do not treat uploaded files as
 * arbitrary AI context.** Parse → structure → review → approve. A parser's job
 * is to recover text and structure honestly, or to say it could not.
 *
 * Every parser in this directory is dependency-free and runs on bytes. That is
 * a deliberate constraint rather than an accident: document parsing libraries
 * are large, and a charity's annual report is exactly the kind of file that
 * should not be handed to a third party to read.
 */

/** A block of recovered text with enough context for a reviewer to check it. */
export interface TextBlock {
  text: string;
  /** Where it came from: "page 4", "sheet:Income!B12", "paragraph 37". */
  locator: string;
}

export interface ParsedDocument {
  status: DocumentParseStatus;
  /** Set when status is not `parsed`. Always a reason a person can act on. */
  note?: string;
  text: string;
  blocks: TextBlock[];
  pageCount?: number;
  wordCount: number;
  /** For tabular formats: header row and rows, where one could be identified. */
  table?: { headers: string[]; rows: string[][] };
}

export interface DocumentParser {
  readonly format: DocumentFormat;
  /** Whether this parser can run at all in the current environment. */
  readonly available: boolean;
  parse(bytes: Uint8Array): ParsedDocument;
}

/** A parse that produced nothing usable, with the reason kept. */
export function unreadable(note: string, status: DocumentParseStatus = "unreadable"): ParsedDocument {
  return { status, note, text: "", blocks: [], wordCount: 0 };
}
