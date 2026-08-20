import { inflateSync } from "node:zlib";
import type { DocumentParser, ParsedDocument, TextBlock } from "./types";
import { unreadable } from "./types";
import { assessTextQuality } from "./text-quality";

/**
 * PDF text extraction.
 *
 * Scope, stated precisely because a parser that overstates itself is worse
 * than one that refuses. This reads text drawing operators out of content
 * streams that are either uncompressed or Flate-compressed. It does **not**
 * do optical character recognition, does not read encrypted files, does not
 * handle custom font encodings that do not map to Unicode, and does not
 * attempt layout — text comes out in drawing order, which is usually reading
 * order and occasionally is not.
 *
 * Everything it cannot do fails through `assessTextQuality`, which is why that
 * gate exists: the realistic failure of a hand-written PDF reader is not an
 * exception, it is confident nonsense.
 */

/** Guard against a hostile or corrupt file claiming an enormous stream. */
const MAX_STREAM_BYTES = 32 * 1024 * 1024;

/**
 * PDF string escapes. `\(`, `\)` and `\\` are literal; the octal form appears
 * in any document with accented characters, and left unhandled it turns
 * "cafe" with an acute accent into two mojibake characters.
 */
function decodePdfString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]!;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b" || next === "f") out += " ";
    else if (next === "\n") continue; // line continuation
    else if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && raw[i + 1] && raw[i + 1]! >= "0" && raw[i + 1]! <= "7") {
        octal += raw[++i]!;
      }
      out += String.fromCharCode(parseInt(octal, 8));
    } else out += next;
  }
  return out;
}

/**
 * Pull the text out of one decoded content stream.
 *
 * `Tj` and `'` draw one string. `TJ` draws an array of strings interleaved
 * with kerning numbers, and a sufficiently negative kern is how a PDF
 * represents a word space — which is why a naive extractor produces
 * "thequickbrownfox". The threshold below restores those spaces.
 */
function textFromStream(content: string): string {
  let out = "";

  const showText =
    /\((?:\\.|[^\\()])*\)\s*(?:Tj|')|\[(?:[^\]\\]|\\.)*\]\s*TJ|T\*|\bTd\b|\bTD\b/gs;

  for (const match of content.matchAll(showText)) {
    const token = match[0]!;

    if (token === "T*" || /\bTd\b|\bTD\b/.test(token)) {
      // A line or position move. Treated as whitespace so lines do not run on.
      out += "\n";
      continue;
    }

    if (token.endsWith("TJ")) {
      const array = token.slice(token.indexOf("[") + 1, token.lastIndexOf("]"));
      for (const part of array.matchAll(/\((?:\\.|[^\\()])*\)|-?[\d.]+/g)) {
        const piece = part[0]!;
        if (piece.startsWith("(")) {
          out += decodePdfString(piece.slice(1, -1));
        } else if (Number(piece) < -100) {
          out += " ";
        }
      }
      continue;
    }

    const literal = token.slice(token.indexOf("(") + 1, token.lastIndexOf(")"));
    out += decodePdfString(literal);
  }

  return out;
}

/**
 * Split into stream objects, inflating the compressed ones.
 *
 * Byte-level rather than string-level: a PDF is binary, and decoding the whole
 * file as text before locating streams corrupts the compressed bytes before
 * they can be inflated.
 */
function contentStreams(bytes: Uint8Array): string[] {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const streams: string[] = [];

  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(latin1)) !== null) {
    const start = match.index + match[0].length;
    const end = latin1.indexOf("endstream", start);
    if (end < 0) break;
    marker.lastIndex = end;

    if (end - start > MAX_STREAM_BYTES) continue;

    // The object dictionary precedes the `stream` keyword.
    const dictionary = latin1.slice(Math.max(0, match.index - 500), match.index);
    const data = bytes.subarray(start, end);

    if (/\/FlateDecode/.test(dictionary)) {
      try {
        streams.push(new TextDecoder("latin1").decode(inflateSync(data)));
      } catch {
        // A stream that will not inflate is usually encrypted or truncated.
        // Skipping it is right; the quality gate catches a file where every
        // stream fails.
      }
    } else if (!/\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)/.test(dictionary)) {
      // Not an image codec, so it may be readable content.
      streams.push(latin1.slice(start, end));
    }
  }

  return streams;
}

export const pdfParser: DocumentParser = {
  format: "pdf",
  available: true,
  parse(bytes): ParsedDocument {
    const header = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
    if (!header.startsWith("%PDF")) {
      return unreadable("This file does not begin with a PDF header.", "failed");
    }

    const latin1 = new TextDecoder("latin1").decode(bytes);
    if (/\/Encrypt\b/.test(latin1)) {
      return unreadable(
        "This PDF is encrypted, so its text cannot be read. Re-save it without a password " +
          "if you would like Pegasus to read it.",
      );
    }

    // `/Type /Page` counts pages; `/Type /Pages` is the tree node above them,
    // so the boundary after "Page" matters.
    const pageCount = (latin1.match(/\/Type\s*\/Page[^s]/g) ?? []).length || undefined;

    const streams = contentStreams(bytes);
    if (streams.length === 0) {
      return unreadable(
        "No readable content was found. The file may be a scan, in which case Pegasus " +
          "cannot read it without optical character recognition.",
      );
    }

    const blocks: TextBlock[] = [];
    for (const [index, stream] of streams.entries()) {
      const text = textFromStream(stream)
        .replace(/[ \t]+/g, " ")
        .trim();
      if (text.length === 0) continue;
      for (const paragraph of text.split(/\n{2,}/)) {
        const cleaned = paragraph.replace(/\s+/g, " ").trim();
        if (cleaned.length > 0) {
          blocks.push({ text: cleaned, locator: `page ${index + 1}` });
        }
      }
    }

    const text = blocks.map((b) => b.text).join("\n\n");
    const quality = assessTextQuality(text);
    if (!quality.usable) return unreadable(quality.reason!);

    return { status: "parsed", text, blocks, pageCount, wordCount: quality.wordCount };
  },
};
