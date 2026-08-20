import type { DocumentParser, ParsedDocument, TextBlock } from "./types";
import { unreadable } from "./types";
import { assessTextQuality, countWords } from "./text-quality";
import { readZipEntry } from "./zip";

/**
 * DOCX and XLSX.
 *
 * Both are ZIP archives of XML, so both are readable without a dependency:
 * locate one entry, inflate it, pull the text runs out of the markup. What is
 * *not* attempted is rendering — no styles, no layout, no charts, no images.
 * The output is text with a locator, which is what extraction and review need.
 */

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

// --- DOCX ----------------------------------------------------------------

/**
 * Word splits a sentence across several `<w:t>` runs whenever formatting
 * changes mid-sentence, so runs are joined *within* a paragraph and separated
 * *between* paragraphs. Joining everything would produce one unusable block;
 * splitting on every run would cut sentences at every bold word.
 */
function docxParagraphs(xml: string): string[] {
  const paragraphMarkup = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  const paragraphs: string[] = [];

  for (const markup of paragraphMarkup) {
    const runs = [...markup.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) =>
      decodeXmlEntities(m[1]!),
    );
    // An explicit line break inside a paragraph is a space, not a join.
    const text = runs.join("").replace(/\s+/g, " ").trim();
    if (text.length > 0) paragraphs.push(text);
  }
  return paragraphs;
}

export const docxParser: DocumentParser = {
  format: "docx",
  available: true,
  parse(bytes): ParsedDocument {
    const xml = readZipEntry(bytes, "word/document.xml");
    if (xml === null) {
      return unreadable(
        "This does not look like a readable Word document. It may be an older .doc file, " +
          "or password protected.",
      );
    }

    const paragraphs = docxParagraphs(xml);
    const text = paragraphs.join("\n\n");
    const quality = assessTextQuality(text);
    if (!quality.usable) return unreadable(quality.reason!);

    const blocks: TextBlock[] = paragraphs.map((paragraph, index) => ({
      text: paragraph,
      locator: `paragraph ${index + 1}`,
    }));

    return { status: "parsed", text, blocks, wordCount: quality.wordCount };
  },
};

// --- XLSX ----------------------------------------------------------------

/** Column index from a cell reference: A→0, Z→25, AA→26. */
function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Excel stores repeated strings once in a shared table and refers to them by
 * index, so a sheet read without `sharedStrings.xml` is a grid of integers
 * that look exactly like data. Resolving them is not optional.
 */
function sharedStrings(bytes: Uint8Array): string[] {
  const xml = readZipEntry(bytes, "xl/sharedStrings.xml");
  if (!xml) return [];
  return (xml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    [...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((m) => decodeXmlEntities(m[1]!))
      .join("")
      .trim(),
  );
}

function sheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];

  for (const rowMarkup of xml.match(/<row[ >][\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const cellMarkup of rowMarkup.match(/<c[ >][\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const reference = cellMarkup.match(/r="([A-Z]+\d+)"/)?.[1] ?? "A1";
      const type = cellMarkup.match(/t="([^"]+)"/)?.[1];
      const raw = cellMarkup.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = cellMarkup.match(/<is>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1];

      let value = "";
      if (type === "s" && raw !== undefined) value = strings[Number(raw)] ?? "";
      else if (type === "inlineStr" && inline !== undefined) value = decodeXmlEntities(inline);
      else if (raw !== undefined) value = decodeXmlEntities(raw);

      // Empty cells are omitted from the XML entirely, so columns are placed
      // by reference rather than by order. Without this a row with a gap
      // shifts every later value one column left.
      const index = columnIndex(reference);
      while (cells.length < index) cells.push("");
      cells[index] = value.trim();
    }
    if (cells.some((cell) => cell.length > 0)) rows.push(cells);
  }
  return rows;
}

export const xlsxParser: DocumentParser = {
  format: "xlsx",
  available: true,
  parse(bytes): ParsedDocument {
    const strings = sharedStrings(bytes);

    // Only the first worksheet. A workbook of twelve tabs is a data export,
    // and reading all of it into one text blob helps nobody.
    const xml =
      readZipEntry(bytes, "xl/worksheets/sheet1.xml") ??
      readZipEntry(bytes, "xl/worksheets/sheet.xml");

    if (xml === null) {
      return unreadable(
        "This does not look like a readable Excel workbook. It may be an older .xls file, " +
          "or password protected.",
      );
    }

    const rows = sheetRows(xml, strings);
    if (rows.length === 0) return unreadable("The first worksheet was empty.");

    const [headers, ...body] = rows as [string[], ...string[][]];
    const blocks: TextBlock[] = body.map((cells, index) => ({
      text: headers
        .map((header, column) => (header ? `${header}: ${cells[column] ?? ""}` : ""))
        .filter((pair) => pair && !pair.endsWith(": "))
        .join("; "),
      locator: `sheet1!row ${index + 2}`,
    }));

    const text = rows.map((row) => row.join(", ")).join("\n");

    return {
      status: "parsed",
      text,
      blocks: blocks.filter((b) => b.text.length > 0),
      wordCount: countWords(text),
      table: { headers, rows: body },
    };
  },
};
