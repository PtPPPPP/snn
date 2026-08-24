/** Server-owned document extraction bounds. Values clamp to hard ceilings; neither clients nor model input can raise them. */

export const DOCUMENT_ERROR_CODES = Object.freeze([
  "AGENT_DOCUMENT_NOT_FOUND",
  "AGENT_DOCUMENT_UNSUPPORTED",
  "AGENT_DOCUMENT_INVALID",
  "AGENT_DOCUMENT_TOO_LARGE",
  "AGENT_DOCUMENT_ENCRYPTED",
  "AGENT_DOCUMENT_EXTRACTION_LIMIT",
  "AGENT_DOCUMENT_NO_TEXT",
]);

const CODE_SET = new Set(DOCUMENT_ERROR_CODES);

export function documentError(code, message = code) {
  if (!CODE_SET.has(code)) throw new TypeError(`Unknown document error code: ${code}`);
  return Object.assign(new Error(message), { code });
}

export function isDocumentError(error) {
  return CODE_SET.has(error?.code);
}

const HARD_CEILINGS = Object.freeze({
  maxDocumentBytes: 64 * 1024 * 1024,
  maxExtractedChars: 400_000,
  maxPdfPages: 2_000,
  maxArchiveEntries: 10_000,
  maxArchiveEntryBytes: 64 * 1024 * 1024,
  maxArchiveTotalUncompressedBytes: 256 * 1024 * 1024,
  maxArchiveCompressionRatio: 2_000,
  maxDocxBlocks: 100_000,
  maxXlsxSheets: 500,
  maxXlsxRows: 200_000,
  maxXlsxCells: 1_000_000,
  maxXlsxCellChars: 20_000,
});

export const DEFAULT_DOCUMENT_LIMITS = Object.freeze({
  maxDocumentBytes: 10 * 1024 * 1024,
  maxExtractedChars: 120_000,
  maxPdfPages: 200,
  maxArchiveEntries: 512,
  maxArchiveEntryBytes: 8 * 1024 * 1024,
  maxArchiveTotalUncompressedBytes: 32 * 1024 * 1024,
  maxArchiveCompressionRatio: 300,
  maxDocxBlocks: 20_000,
  maxXlsxSheets: 64,
  maxXlsxRows: 50_000,
  maxXlsxCells: 250_000,
  maxXlsxCellChars: 1_000,
});

/** Clamp caller-supplied limits into the hard ceilings so no configuration path can exceed server policy. */
export function clampDocumentLimits(candidate = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const clamped = {};
  for (const key of Object.keys(DEFAULT_DOCUMENT_LIMITS)) {
    const value = Number(source[key]);
    if (!Number.isSafeInteger(value) || value <= 0) { clamped[key] = DEFAULT_DOCUMENT_LIMITS[key]; continue; }
    // A configured value may only tighten a bound; it can never exceed the shipped default or hard ceiling.
    clamped[key] = Math.min(value, DEFAULT_DOCUMENT_LIMITS[key], HARD_CEILINGS[key]);
  }
  return Object.freeze(clamped);
}
