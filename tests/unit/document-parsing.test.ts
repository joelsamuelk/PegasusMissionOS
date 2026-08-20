import { describe, expect, it } from "vitest";
import { assessTextQuality, detectFormat, parseCsvRows, parseDocument } from "@/lib/documents";
import {
  buildBinaryNoise,
  buildDocx,
  buildPdf,
  buildXlsx,
  buildZip,
} from "../fixtures/documents";

/**
 * Document parsing.
 *
 * Every parser here is hand-written over a binary format with no dependency,
 * so these tests run against genuinely assembled files — real ZIP central
 * directories, real Flate streams, real PDF content operators — rather than
 * against strings shaped to match the parser.
 *
 * The refusal paths matter as much as the success paths. A parser that returns
 * confident nonsense is worse than one that declines, because nonsense becomes
 * extracted claims and a reviewer is then asked to approve it.
 */

const MISSION =
  "Northstar Community Foundation helps young people aged sixteen to twenty five " +
  "in West Yorkshire move into education, employment or training.";

const IMPACT =
  "During the reporting year we supported one hundred and sixty eight young people " +
  "across Leeds and Bradford, and fifty eight per cent progressed into a positive destination.";

describe("format detection", () => {
  it("identifies a PDF by its header, not its name", () => {
    expect(detectFormat(buildPdf([MISSION]), "annual-report.docx")).toBe("pdf");
  });

  it("distinguishes Word from Excel by archive contents", () => {
    // Both are ZIPs. The extension is a claim; the entry list is evidence.
    expect(detectFormat(buildDocx([MISSION]), "mystery.bin")).toBe("docx");
    expect(detectFormat(buildXlsx([["Year", "Income"]]), "mystery.bin")).toBe("xlsx");
  });

  it("does not claim a ZIP it cannot recognise is a document", () => {
    const archive = buildZip([{ name: "photos/one.jpg", content: "not really a jpeg" }]);
    expect(detectFormat(archive, "bundle.zip")).toBe("unknown");
  });

  it("recognises delimited text as a CSV whatever it is called", () => {
    const bytes = new TextEncoder().encode("Year,Income\n2026,95000\n");
    expect(detectFormat(bytes, "export.dat")).toBe("csv");
  });
});

describe("plain text and CSV", () => {
  it("reads paragraphs with locators a reviewer can check", () => {
    const bytes = new TextEncoder().encode(`${MISSION}\n\n${IMPACT}`);
    const parsed = parseDocument(bytes, "about.txt");

    expect(parsed.status).toBe("parsed");
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]!.locator).toBe("paragraph 1");
    expect(parsed.blocks[1]!.text).toContain("fifty eight per cent");
  });

  it("keeps quoted commas inside their field", () => {
    // A naive split shifts every column after the first quoted comma, and a
    // misaligned budget table survives review because the numbers still look
    // like numbers.
    const rows = parseCsvRows('Programme,Location,Spend\n"Youth Futures","Leeds, Bradford",42000\n');
    expect(rows[1]).toEqual(["Youth Futures", "Leeds, Bradford", "42000"]);
  });

  it("handles doubled quotes and embedded newlines", () => {
    const rows = parseCsvRows('Note\n"She said ""yes"" to\nthe placement"\n');
    expect(rows[1]![0]).toBe('She said "yes" to\nthe placement');
  });

  it("returns a table so figures stay structured", () => {
    const bytes = new TextEncoder().encode("Indicator,Baseline,Target\nProgression,0,70\n");
    const parsed = parseDocument(bytes, "indicators.csv");

    expect(parsed.table?.headers).toEqual(["Indicator", "Baseline", "Target"]);
    expect(parsed.table?.rows[0]).toEqual(["Progression", "0", "70"]);
    expect(parsed.blocks[0]!.text).toContain("Indicator: Progression");
    expect(parsed.blocks[0]!.locator).toBe("row 2");
  });
});

describe("Word documents", () => {
  it("joins runs within a paragraph and separates between them", () => {
    // Word splits a sentence across runs whenever formatting changes. Joining
    // everything gives one unusable block; splitting every run cuts sentences
    // at every bold word.
    const parsed = parseDocument(buildDocx([MISSION, IMPACT]), "strategy.docx");

    expect(parsed.status).toBe("parsed");
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]!.text).toBe(MISSION);
    expect(parsed.blocks[1]!.text).toBe(IMPACT);
  });

  it("decodes XML entities rather than surfacing them", () => {
    const parsed = parseDocument(
      buildDocx([`${MISSION} Our partners are Leeds & Bradford Works.`]),
      "about.docx",
    );
    expect(parsed.text).toContain("Leeds & Bradford Works");
    expect(parsed.text).not.toContain("&amp;");
  });

  it("declines a ZIP that is not a Word document, with a reason", () => {
    const parsed = parseDocument(buildZip([{ name: "xl/workbook.xml", content: "<x/>" }]), "a.docx");
    expect(parsed.status).not.toBe("parsed");
    expect(parsed.note).toBeTruthy();
  });
});

describe("workbooks", () => {
  const rows = [
    ["Programme", "Participants", "Spend"],
    ["Youth Futures", "168", "42000"],
    ["Digital Bridge", "64", "18000"],
  ];

  it("resolves shared strings rather than reading their indices", () => {
    // Excel stores repeated text once and refers to it by index. A parser that
    // skips sharedStrings.xml reads a grid of integers that look like data.
    const parsed = parseDocument(buildXlsx(rows), "programmes.xlsx");

    expect(parsed.status).toBe("parsed");
    expect(parsed.table?.headers).toEqual(["Programme", "Participants", "Spend"]);
    expect(parsed.table?.rows[0]).toEqual(["Youth Futures", "168", "42000"]);
  });

  it("keeps columns aligned when a cell is omitted entirely", () => {
    // A blank cell is absent from the XML, not written empty. Placing cells by
    // order rather than by reference shifts every later value one column left.
    const parsed = parseDocument(buildXlsx(rows, { gapColumn: 1 }), "programmes.xlsx");

    expect(parsed.table?.rows[0]![0]).toBe("Youth Futures");
    expect(parsed.table?.rows[0]![1]).toBe("");
    expect(parsed.table?.rows[0]![2]).toBe("42000");
  });

  it("labels each row with a locator naming the sheet", () => {
    const parsed = parseDocument(buildXlsx(rows), "programmes.xlsx");
    expect(parsed.blocks[0]!.locator).toBe("sheet1!row 2");
  });
});

describe("PDFs", () => {
  it("reads an uncompressed content stream", () => {
    const parsed = parseDocument(buildPdf([MISSION, IMPACT]), "report.pdf");

    expect(parsed.status).toBe("parsed");
    expect(parsed.text).toContain("West Yorkshire");
    expect(parsed.text).toContain("fifty eight per cent");
  });

  it("inflates a Flate-compressed stream, as real PDFs use", () => {
    const parsed = parseDocument(buildPdf([MISSION, IMPACT], { compress: true }), "report.pdf");

    expect(parsed.status).toBe("parsed");
    expect(parsed.text).toContain("West Yorkshire");
  });

  it("restores word spaces from kerning, rather than running words together", () => {
    // A PDF producer represents a space as a large negative kern between two
    // strings. Ignoring it yields "thequickbrownfox", which then extracts as
    // nonsense a reviewer cannot check.
    const parsed = parseDocument(
      buildPdf([MISSION, IMPACT], { compress: true, kerned: true }),
      "report.pdf",
    );

    expect(parsed.status).toBe("parsed");
    expect(parsed.text).toContain("West Yorkshire");
    expect(parsed.text).not.toMatch(/WestYorkshire/);
  });

  it("counts pages without counting the page-tree node", () => {
    const parsed = parseDocument(buildPdf([MISSION, IMPACT]), "report.pdf");
    expect(parsed.pageCount).toBe(1);
  });

  it("refuses an encrypted PDF and says why", () => {
    const parsed = parseDocument(buildPdf([MISSION], { encrypted: true }), "locked.pdf");

    expect(parsed.status).toBe("unreadable");
    expect(parsed.note).toMatch(/encrypted/i);
  });

  it("refuses a file that only claims to be a PDF", () => {
    const parsed = parseDocument(new TextEncoder().encode("not a pdf at all"), "fake.pdf");
    expect(parsed.status).not.toBe("parsed");
  });
});

/**
 * The gate between "we extracted text" and "we extracted characters". This is
 * the guard that stops a hand-written binary parser producing plausible
 * rubbish that becomes claims.
 */
describe("text quality gate", () => {
  it("rejects an empty extraction as a scan rather than an empty document", () => {
    const quality = assessTextQuality("   ");
    expect(quality.usable).toBe(false);
    expect(quality.reason).toMatch(/scan|images/i);
  });

  it("rejects text that is mostly unreadable characters", () => {
    const noise = Array.from({ length: 400 }, (_, i) => String.fromCharCode(i % 20)).join("");
    const quality = assessTextQuality(noise);

    expect(quality.usable).toBe(false);
    expect(quality.reason).toMatch(/encrypted|font/i);
  });

  it("rejects a header-and-page-number extraction as too little to use", () => {
    const quality = assessTextQuality("Annual Report 2026\nPage 1\nPage 2");
    expect(quality.usable).toBe(false);
    expect(quality.reason).toMatch(/readable words/i);
  });

  it("accepts ordinary prose", () => {
    const quality = assessTextQuality(`${MISSION} ${IMPACT}`);
    expect(quality.usable).toBe(true);
    expect(quality.wordCount).toBeGreaterThan(20);
  });

  it("stops binary noise reaching extraction", () => {
    const parsed = parseDocument(buildBinaryNoise(), "mystery.pdf");
    expect(parsed.status).not.toBe("parsed");
    expect(parsed.text).toBe("");
  });
});

describe("unsupported formats", () => {
  it("names the formats it can read rather than failing silently", () => {
    const parsed = parseDocument(buildBinaryNoise(), "photo.heic");

    expect(parsed.status).toBe("unsupported_format");
    expect(parsed.note).toMatch(/PDF, Word, Excel, CSV and plain text/);
  });

  it("sends web pages to website research instead of document ingestion", () => {
    const bytes = new TextEncoder().encode("<html><body><p>Hello</p></body></html>");
    const parsed = parseDocument(bytes, "index.html");

    expect(parsed.status).toBe("unsupported_format");
    expect(parsed.note).toMatch(/website research/i);
  });
});
