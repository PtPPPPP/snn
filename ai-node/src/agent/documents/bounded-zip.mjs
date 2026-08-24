import { inflateRawSync } from "node:zlib";
import { documentError } from "./limits.mjs";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** Method 8 is raw DEFLATE (no zlib header); method 0 is stored. Everything else fails closed. */
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x1;

/**
 * Bounded in-memory ZIP reader. Limits are enforced against central-directory
 * declarations BEFORE any entry expands and again against actual inflated
 * output, so a lying or bomb archive fails without allocating its claim.
 */
export class BoundedZipArchive {
  #buffer;
  #entries;
  #limits;
  #totalUncompressed;

  constructor(buffer, entries, limits, totalUncompressed) {
    this.#buffer = buffer;
    this.#entries = entries;
    this.#limits = limits;
    this.#totalUncompressed = totalUncompressed;
  }

  static open(buffer, limits) {
    const eocd = locateEocd(buffer);
    if (!eocd) throw documentError("AGENT_DOCUMENT_INVALID");
    let entryCount = eocd.readUInt16LE(10);
    let directoryOffset = eocd.readUInt32LE(16);
    if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
      // Zip64 endings are intentionally unsupported in v1; fail closed instead of guessing.
      throw documentError("AGENT_DOCUMENT_INVALID");
    }
    if (entryCount > limits.maxArchiveEntries) throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");

    const entries = new Map();
    let cursor = directoryOffset;
    let totalUncompressed = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw documentError("AGENT_DOCUMENT_INVALID");
      const flags = buffer.readUInt16LE(cursor + 8);
      const method = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const uncompressedSize = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
      const nameStart = cursor + 46;
      if (nameStart + nameLength > buffer.length) throw documentError("AGENT_DOCUMENT_INVALID");
      const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
      if ((flags & FLAG_ENCRYPTED) !== 0) throw documentError("AGENT_DOCUMENT_ENCRYPTED");
      if (method !== METHOD_STORED && method !== METHOD_DEFLATE) throw documentError("AGENT_DOCUMENT_UNSUPPORTED");
      if (uncompressedSize > limits.maxArchiveEntryBytes) throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");
      if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxArchiveCompressionRatio && uncompressedSize > 4096) {
        throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");
      }
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > limits.maxArchiveTotalUncompressedBytes) throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");
      if (entries.has(name)) throw documentError("AGENT_DOCUMENT_INVALID");
      entries.set(name, { method, compressedSize, uncompressedSize, localHeaderOffset });
      cursor = nameStart + nameLength + extraLength + commentLength;
    }
    return new BoundedZipArchive(buffer, entries, limits, totalUncompressed);
  }

  has(name) { return this.#entries.has(name); }
  names() { return Object.freeze([...this.#entries.keys()]); }
  get declaredTotalUncompressedBytes() { return this.#totalUncompressed; }

  /** Inflate one entry on demand with the same limits re-checked against reality. */
  readEntry(name) {
    const entry = this.#entries.get(name);
    if (!entry) throw documentError("AGENT_DOCUMENT_NOT_FOUND");
    const local = entry.localHeaderOffset;
    if (local + 30 > this.#buffer.length || this.#buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) throw documentError("AGENT_DOCUMENT_INVALID");
    const localNameLength = this.#buffer.readUInt16LE(local + 26);
    const localExtraLength = this.#buffer.readUInt16LE(local + 28);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > this.#buffer.length) throw documentError("AGENT_DOCUMENT_INVALID");
    const raw = this.#buffer.subarray(dataStart, dataEnd);
    let output;
    try {
      if (entry.method === METHOD_STORED) {
        if (raw.length !== entry.uncompressedSize) throw documentError("AGENT_DOCUMENT_INVALID");
        output = Buffer.from(raw);
      } else {
        // maxOutputLength makes the inflater itself stop bombs that lied in the directory.
        output = inflateRawSync(raw, { maxOutputLength: this.#limits.maxArchiveEntryBytes });
      }
    } catch (error) {
      if (isDocumentErrorCode(error)) throw error;
      if (error?.code === "ERR_BUFFER_TOO_LARGE") throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");
      throw documentError("AGENT_DOCUMENT_INVALID");
    }
    if (output.length > this.#limits.maxArchiveEntryBytes) throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");
    if (output.length !== entry.uncompressedSize) throw documentError("AGENT_DOCUMENT_INVALID");
    return output;
  }
}

function locateEocd(buffer) {
  const minimum = 22;
  const scanWindow = Math.min(buffer.length, minimum + 65_536);
  for (let back = scanWindow; back >= minimum; back -= 1) {
    const index = buffer.length - back;
    if (index < 0) break;
    if (buffer.readUInt32LE(index) === EOCD_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(index + 20);
      if (index + minimum + commentLength === buffer.length) return buffer.subarray(index, index + minimum);
    }
  }
  return undefined;
}

function isDocumentErrorCode(error) {
  return typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_");
}

/** Convenience for Office containers: read one entry as bounded UTF-8 text. */
export function readZipText(archive, name, maxChars) {
  const bytes = archive.readEntry(name);
  if (bytes.includes(0)) throw documentError("AGENT_DOCUMENT_INVALID");
  const text = bytes.toString("utf8");
  if (text.length > maxChars) throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");
  return text;
}
