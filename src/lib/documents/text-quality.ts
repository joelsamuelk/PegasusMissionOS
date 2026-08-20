/**
 * The gate between "we extracted text" and "we extracted characters".
 *
 * Every parser here is hand-written over a binary format, and the realistic
 * failure mode is not throwing — it is returning plausible-looking rubbish:
 * ligature soup from a subsetted font, an encrypted stream inflated into
 * noise, or the bytes of an image interpreted as characters.
 *
 * That failure is worse than refusing, because rubbish text becomes extracted
 * claims, and extracted claims are what a reviewer is asked to approve. So
 * recovered text is checked before it is believed, and a document that fails
 * is recorded `unreadable` with a reason rather than passed downstream.
 */

export interface TextQuality {
  usable: boolean;
  /** Why not, phrased for the person who uploaded the file. */
  reason?: string;
  printableRatio: number;
  wordCount: number;
}

/** Tokens of three or more letters — the cheapest signal that this is prose. */
const WORD = /[A-Za-zÀ-ɏ]{3,}/g;

export function assessTextQuality(text: string): TextQuality {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return {
      usable: false,
      reason:
        "No text could be recovered. The file may be a scan or a set of images rather than text.",
      printableRatio: 0,
      wordCount: 0,
    };
  }

  let printable = 0;
  for (const char of trimmed) {
    const code = char.codePointAt(0)!;
    // Tab, newline, carriage return, and the printable range upwards.
    if (code === 9 || code === 10 || code === 13 || code >= 32) printable += 1;
  }
  const printableRatio = printable / [...trimmed].length;
  const wordCount = (trimmed.match(WORD) ?? []).length;

  if (printableRatio < 0.85) {
    return {
      usable: false,
      reason:
        "The recovered text was mostly unreadable characters. The file may be encrypted, " +
        "or use an embedded font Pegasus cannot map to letters.",
      printableRatio,
      wordCount,
    };
  }

  // A real document has words. Twenty is low enough to admit a one-page policy
  // and high enough to reject a header-and-page-numbers extraction.
  if (wordCount < 20) {
    return {
      usable: false,
      reason:
        `Only ${wordCount} readable words were recovered, which is too little to extract from. ` +
        "The file may be a scan, or mostly tables and images.",
      printableRatio,
      wordCount,
    };
  }

  return { usable: true, printableRatio, wordCount };
}

/**
 * Does this look like binary rather than text?
 *
 * Needed because the *structural* formats — CSV and plain text — have no magic
 * bytes, so detection otherwise falls back to shape, and arbitrary binary
 * reliably contains a comma followed by a newline somewhere in its first few
 * kilobytes. Without this, a JPEG is detected as a CSV and then parses
 * "successfully" into rows of mojibake.
 *
 * NUL bytes are decisive: no text encoding this product accepts produces them
 * in ordinary content. The control-character ratio catches the rest.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  if (sample.length === 0) return false;

  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    // Control characters other than tab, newline, carriage return and form feed.
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13 && byte !== 12) control += 1;
  }
  return control / sample.length > 0.05;
}

/**
 * The printable half of the quality gate, without the prose requirement.
 *
 * A budget spreadsheet legitimately contains almost no words, so it must not
 * be judged on word count — but it is still text, and a file whose characters
 * are mostly unreadable is not a spreadsheet whatever its shape suggests.
 */
export function isPrintableEnough(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  let printable = 0;
  const characters = [...trimmed];
  for (const char of characters) {
    const code = char.codePointAt(0)!;
    if (code === 9 || code === 10 || code === 13 || code >= 32) printable += 1;
  }
  return printable / characters.length >= 0.85;
}

/** Word count for text already known to be usable. */
export function countWords(text: string): number {
  return (text.match(WORD) ?? []).length;
}
