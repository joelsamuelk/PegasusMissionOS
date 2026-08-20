import type { DocumentParser, ParsedDocument, TextBlock } from "./types";
import { unreadable } from "./types";
import { assessTextQuality, countWords, isPrintableEnough } from "./text-quality";

/**
 * Plain text and CSV.
 *
 * CSV is parsed properly rather than split on commas: quoted fields containing
 * commas and newlines are ordinary in exports from finance systems, and a
 * naive split silently shifts every column after the first quoted comma. A
 * misaligned budget table is exactly the kind of error that survives review,
 * because the numbers still look like numbers.
 */

function paragraphs(text: string): TextBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length > 0)
    .map((block, index) => ({ text: block, locator: `paragraph ${index + 1}` }));
}

export const textParser: DocumentParser = {
  format: "txt",
  available: true,
  parse(bytes) {
    const text = new TextDecoder().decode(bytes);
    const quality = assessTextQuality(text);
    if (!quality.usable) return unreadable(quality.reason!);
    return {
      status: "parsed",
      text,
      blocks: paragraphs(text),
      wordCount: quality.wordCount,
    };
  },
};

/** RFC 4180 with the tolerances real exports need. */
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Consume CRLF as one terminator.
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export const csvParser: DocumentParser = {
  format: "csv",
  available: true,
  parse(bytes): ParsedDocument {
    const raw = new TextDecoder().decode(bytes);

    // The prose gate does not apply to a spreadsheet — a budget legitimately
    // has almost no words — but the printable check does. Skipping both would
    // let unreadable bytes through as "successfully parsed rows".
    if (!isPrintableEnough(raw)) {
      return unreadable(
        "The file did not contain readable text. It may be a binary file with a " +
          "misleading name, or use an encoding Pegasus cannot read.",
      );
    }

    const rows = parseCsvRows(raw);

    if (rows.length === 0) {
      return unreadable("The file contained no rows.");
    }

    const [headers, ...body] = rows as [string[], ...string[][]];
    const blocks: TextBlock[] = body.map((cells, index) => ({
      text: headers
        .map((header, column) => `${header.trim()}: ${(cells[column] ?? "").trim()}`)
        .filter((pair) => !pair.endsWith(": "))
        .join("; "),
      locator: `row ${index + 2}`,
    }));

    const text = [headers.join(", "), ...body.map((r) => r.join(", "))].join("\n");

    // A spreadsheet of figures legitimately has few words, so the prose gate
    // does not apply. What matters here is that it has structure.
    return {
      status: "parsed",
      text,
      blocks,
      wordCount: countWords(text),
      table: { headers: headers.map((h) => h.trim()), rows: body },
    };
  },
};
