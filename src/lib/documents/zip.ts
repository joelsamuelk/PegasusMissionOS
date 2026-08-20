import { inflateRawSync } from "node:zlib";

/**
 * A minimal ZIP reader.
 *
 * DOCX and XLSX are ZIP archives of XML. Reading them needs exactly two things
 * — locate an entry by name, and inflate it — and pulling in a general archive
 * library for that would add a dependency that runs over untrusted uploaded
 * bytes. This does the two things and refuses everything else.
 *
 * Deliberately not supported: encryption, ZIP64, multi-disk archives, and any
 * compression method other than store (0) and deflate (8). Each returns null
 * rather than a guess, and the caller reports the reason.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** Guard against a malformed or hostile archive claiming an enormous entry. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

interface CentralEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readCentralDirectory(bytes: Uint8Array): CentralEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The end-of-central-directory record sits at the tail, after a comment of
  // up to 65535 bytes, so it is found by scanning backwards for its signature.
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= lowest; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (offset >= bytes.length) return null;

  const entries: CentralEntry[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > bytes.length) return null;
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) return null;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const fileName = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Read one entry as UTF-8 text, or null if it is absent or unreadable.
 *
 * Null covers every failure — missing entry, unsupported compression,
 * corrupt deflate stream — because the caller's response is the same in all
 * of them: say the document could not be read, and why.
 */
export function readZipEntry(bytes: Uint8Array, name: string): string | null {
  const entries = readCentralDirectory(bytes);
  if (!entries) return null;

  const entry = entries.find((e) => e.fileName === name);
  if (!entry) return null;
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localHeaderOffset;
  if (local + 30 > bytes.length) return null;

  // The local header repeats the name and extra-field lengths, and they are
  // not always the same as the central directory's. The local ones decide
  // where the data actually starts.
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) return null;

  const data = bytes.subarray(start, end);

  try {
    if (entry.compressionMethod === 0) return new TextDecoder().decode(data);
    if (entry.compressionMethod === 8) {
      return new TextDecoder().decode(inflateRawSync(data));
    }
    return null;
  } catch {
    return null;
  }
}

/** Entry names in the archive, for detecting what kind of file this is. */
export function listZipEntries(bytes: Uint8Array): string[] {
  return readCentralDirectory(bytes)?.map((e) => e.fileName) ?? [];
}
