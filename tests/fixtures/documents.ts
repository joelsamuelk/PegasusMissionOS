import { deflateRawSync, deflateSync } from "node:zlib";

/**
 * Real document bytes, built in-process.
 *
 * The parsers in `src/lib/documents` are hand-written over binary formats, so
 * testing them against hand-written fixtures would test the fixtures. These
 * helpers assemble genuine ZIP and PDF structures — real local file headers,
 * a real central directory, real Flate streams — so the tests exercise the
 * same code paths a file from Word or Excel would.
 */

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]!;
  return (crc ^ -1) >>> 0;
}
crc32.table = undefined as Int32Array | undefined;

interface ZipFile {
  name: string;
  content: string;
  /** Store uncompressed, to exercise the method-0 path as well as deflate. */
  store?: boolean;
}

/** Build a genuine ZIP archive: local headers, central directory, EOCD. */
export function buildZip(files: ZipFile[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const raw = encoder.encode(file.content);
    const compressed = file.store ? raw : new Uint8Array(deflateRawSync(raw));
    const method = file.store ? 0 : 8;
    const crc = crc32(raw);

    const local = new Uint8Array(30 + nameBytes.length + compressed.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(compressed, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A Word document.
 *
 * Each paragraph is split across two runs, because that is what Word actually
 * produces when formatting changes mid-sentence, and a parser that joins runs
 * incorrectly fails exactly there.
 */
export function buildDocx(paragraphs: string[]): Uint8Array {
  const body = paragraphs
    .map((paragraph) => {
      const middle = Math.floor(paragraph.length / 2);
      const [first, second] = [paragraph.slice(0, middle), paragraph.slice(middle)];
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(
        first,
      )}</w:t></w:r><w:r><w:t xml:space="preserve">${escapeXml(second)}</w:t></w:r></w:p>`;
    })
    .join("");

  return buildZip([
    { name: "[Content_Types].xml", content: "<Types/>", store: true },
    {
      name: "word/document.xml",
      content: `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`,
    },
  ]);
}

/**
 * A workbook.
 *
 * Text cells go through the shared-string table, as Excel writes them, so a
 * parser that ignores `sharedStrings.xml` reads indices instead of words.
 * `gapColumn` omits a cell entirely rather than writing an empty one, which is
 * how a real sheet represents a blank and what shifts columns in a naive
 * reader.
 */
export function buildXlsx(rows: string[][], options: { gapColumn?: number } = {}): Uint8Array {
  const strings: string[] = [];
  const indexOf = (value: string) => {
    const existing = strings.indexOf(value);
    if (existing >= 0) return existing;
    strings.push(value);
    return strings.length - 1;
  };

  const columnName = (index: number) => {
    let name = "";
    let n = index + 1;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  };

  const sheetRows = rows
    .map((cells, rowIndex) => {
      const xmlCells = cells
        .map((value, columnIndex) => {
          if (options.gapColumn === columnIndex && rowIndex > 0) return "";
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (/^-?\d+(\.\d+)?$/.test(value)) {
            return `<c r="${reference}"><v>${value}</v></c>`;
          }
          return `<c r="${reference}" t="s"><v>${indexOf(value)}</v></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${xmlCells}</row>`;
    })
    .join("");

  const sharedStrings = `<?xml version="1.0"?><sst count="${strings.length}">${strings
    .map((value) => `<si><t>${escapeXml(value)}</t></si>`)
    .join("")}</sst>`;

  return buildZip([
    { name: "[Content_Types].xml", content: "<Types/>", store: true },
    { name: "xl/sharedStrings.xml", content: sharedStrings },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    },
  ]);
}

const pdfEscape = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export interface PdfOptions {
  /** Compress the content stream, as almost every real PDF does. */
  compress?: boolean;
  /** Mark the file encrypted, to exercise the refusal path. */
  encrypted?: boolean;
  /** Emit the text as a kerned array, which is how word spaces get lost. */
  kerned?: boolean;
}

/** A PDF with a real header, page objects and a text content stream. */
export function buildPdf(lines: string[], options: PdfOptions = {}): Uint8Array {
  const operators = lines
    .map((line) => {
      if (options.kerned) {
        // Split each word into its own array element with a large negative
        // kern between, which is how PDF producers represent a space.
        const parts = line
          .split(" ")
          .map((word) => `(${pdfEscape(word)})`)
          .join(" -250 ");
        return `BT /F1 12 Tf 72 700 Td [${parts}] TJ ET`;
      }
      return `BT /F1 12 Tf 72 700 Td (${pdfEscape(line)}) Tj ET`;
    })
    .join("\nT*\n");

  const contentBytes = options.compress
    ? new Uint8Array(deflateSync(encoder.encode(operators)))
    : encoder.encode(operators);

  const parts: (string | Uint8Array)[] = [
    "%PDF-1.7\n",
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n",
    options.encrypted ? "5 0 obj\n<< /Encrypt 6 0 R >>\nendobj\n" : "",
    `4 0 obj\n<< /Length ${contentBytes.length}${
      options.compress ? " /Filter /FlateDecode" : ""
    } >>\nstream\n`,
    contentBytes,
    "\nendstream\nendobj\n",
    "trailer\n<< /Root 1 0 R >>\n%%EOF\n",
  ];

  const encoded = parts.map((part) =>
    typeof part === "string" ? encoder.encode(part) : part,
  );
  const total = encoded.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of encoded) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** Bytes that are not any supported document, for the refusal paths. */
export function buildBinaryNoise(length = 2048): Uint8Array {
  const out = new Uint8Array(length);
  // Deterministic, so a failure is reproducible.
  for (let i = 0; i < length; i += 1) out[i] = (i * 37 + 11) % 256;
  return out;
}
