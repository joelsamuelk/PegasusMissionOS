import type { DocumentFormat } from "@/types/domain";
import { csvParser, textParser } from "./parse-text";
import { docxParser, xlsxParser } from "./parse-office";
import { pdfParser } from "./parse-pdf";
import type { DocumentParser, ParsedDocument } from "./types";
import { looksBinary } from "./text-quality";
import { listZipEntries } from "./zip";

export type { DocumentParser, ParsedDocument, TextBlock } from "./types";
export { assessTextQuality } from "./text-quality";
export { parseCsvRows } from "./parse-text";

const PARSERS: Partial<Record<DocumentFormat, DocumentParser>> = {
  pdf: pdfParser,
  docx: docxParser,
  xlsx: xlsxParser,
  csv: csvParser,
  txt: textParser,
};

/** Printable ASCII plus tab, newline and carriage return. */
const MOSTLY_TEXT = /^[\t\n\r\x20-\x7E]*$/;

/**
 * Identify a file by its bytes, not by its name.
 *
 * An extension is a claim made by whoever uploaded the file, and the common
 * case is not malice — it is a PDF saved as `report.docx`, or a tab-separated
 * export named `.xlsx`. Reading the leading bytes first means the parser that
 * runs is the one that can actually read the file.
 */
export function detectFormat(bytes: Uint8Array, fileName?: string): DocumentFormat {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8));

  if (head.startsWith("%PDF")) return "pdf";

  // Both DOCX and XLSX are ZIP archives; the entry list distinguishes them.
  if (head.startsWith("PK")) {
    const entries = listZipEntries(bytes);
    if (entries.some((entry) => entry.startsWith("word/"))) return "docx";
    if (entries.some((entry) => entry.startsWith("xl/"))) return "xlsx";
    return "unknown";
  }

  // Past this point detection is by shape, and shape-matching binary is how a
  // photograph becomes a CSV. Nothing without a recognised header gets read as
  // text.
  if (looksBinary(bytes)) return "unknown";

  const extension = fileName?.toLowerCase().split(".").pop();
  if (extension === "csv") return "csv";
  if (extension === "txt" || extension === "md") return "txt";
  if (extension === "html" || extension === "htm") return "html";

  // Fall back to shape: text that parses as delimited rows is a CSV whatever
  // it happens to be called.
  const sample = new TextDecoder().decode(bytes.subarray(0, 4096));
  if (/^[^\n]*,[^\n]*\n/.test(sample)) return "csv";
  if (sample.length > 0 && MOSTLY_TEXT.test(sample)) return "txt";

  return "unknown";
}

/**
 * Parse a document.
 *
 * An unsupported format is `unsupported_format` with a reason, never an empty
 * success. Anything that looks parsed downstream must actually have been read.
 */
export function parseDocument(bytes: Uint8Array, fileName?: string): ParsedDocument {
  const format = detectFormat(bytes, fileName);
  const parser = PARSERS[format];

  if (!parser) {
    return {
      status: "unsupported_format",
      note:
        format === "html"
          ? "Web pages are read by website research rather than uploaded as documents."
          : "Pegasus cannot read this file type. PDF, Word, Excel, CSV and plain text are supported.",
      text: "",
      blocks: [],
      wordCount: 0,
    };
  }

  try {
    return parser.parse(bytes);
  } catch (error) {
    // A parser throwing on a malformed file is expected. It is reported as a
    // failure with a reason, never as an empty document that looks parsed.
    return {
      status: "failed",
      note: `The file could not be read (${
        error instanceof Error ? error.message : "unknown error"
      }).`,
      text: "",
      blocks: [],
      wordCount: 0,
    };
  }
}

export const SUPPORTED_FORMATS: DocumentFormat[] = ["pdf", "docx", "xlsx", "csv", "txt"];
