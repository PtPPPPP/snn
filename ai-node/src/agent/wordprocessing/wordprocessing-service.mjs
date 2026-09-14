import { createHash } from "node:crypto";
import { createZipWriter } from "@office-kit/xlsx/zip";
import { toBuffer } from "@office-kit/xlsx/node";
import { BoundedZipArchive } from "../documents/bounded-zip.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../documents/limits.mjs";
import { decodeEntities, encodeEntities } from "../documents/xml-text.mjs";
import { extractBlocks } from "../documents/parsers/docx-parser.mjs";

const MAX_MATCHES_IN_RESULT = 20;
const MAX_FIND = 500;
const MAX_REPLACE = 1_000;
const MAX_PREVIEW_CHARS = 2_000;
const MAX_FRAGMENT_TEXT = 512;
const DOCUMENT_XML_ENTRY = "word/document.xml";
const CONTENT_TYPES_ENTRY = "[Content_Types].xml";
const CFB_ENCRYPTED_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAX_DOCUMENT_XML_CHARS = DEFAULT_DOCUMENT_LIMITS.maxExtractedChars * 64 + 1_048_576;

/**
 * Server-owned DOCX read and mutation service. It only accepts a Workspace
 * file id and delegates bytes persistence to FileIngestionService, keeping
 * host paths and generic binary writes outside the Agent tool surface.
 *
 * It supports one bounded, format-lossless operation: replacing exact text
 * within a single paragraph, even when Word split that text across several
 * `<w:t>` runs. Only the character data of the matched runs is rewritten: the
 * first matched run absorbs the replacement and keeps its own run properties
 * (`<w:rPr>`), the other matched runs are cleared of only the matched
 * characters, and every attribute (including `xml:space="preserve"`), every
 * unmatched run, and all other archive entries are preserved, so fonts,
 * paragraph style, and layout are unchanged. Text that spans more than one
 * paragraph is reported as a non-match so the caller retries within a paragraph.
 */
export class WordprocessingService {
  constructor({ fileIngestionService }) {
    if (!fileIngestionService || typeof fileIngestionService.readFile !== "function" || typeof fileIngestionService.replaceFileBytes !== "function") {
      throw new TypeError("fileIngestionService with managed byte operations is required");
    }
    this.files = fileIngestionService;
  }

  async inspect({ workspaceId, fileId, find } = {}) {
    const managed = await this.files.readFile({ workspaceId, fileId });
    const archive = assertDocxFile(managed.file, managed.bytes);
    const xml = readDocumentXml(archive);
    const fragments = collectFragments(xml);
    const requested = normalizeFind(find);
    const matches = requested ? findParagraphs(xml, requested) : [];
    return Object.freeze({
      fileId: managed.file.fileId,
      version: digest(managed.bytes),
      document: managed.file.originalName,
      paragraphCount: countParagraphs(xml),
      fragmentCount: fragments.length,
      textPreview: buildPreview(xml),
      matchCount: matches.reduce((sum, match) => sum + match.occurrences, 0),
      matches: matches.slice(0, MAX_MATCHES_IN_RESULT).map((match) => Object.freeze({ paragraph: match.paragraph, occurrences: match.occurrences, text: match.text })),
      truncated: matches.length > MAX_MATCHES_IN_RESULT,
    });
  }

  async replaceText({ workspaceId, fileId, expectedVersion, find, replace, replaceAll = false } = {}) {
    const target = requireFind(find);
    const substitution = normalizeReplace(replace);
    if (target === substitution) throw wordError("AGENT_WORD_INVALID_REQUEST");
    if (typeof replaceAll !== "boolean") throw wordError("AGENT_WORD_INVALID_REQUEST");

    const managed = await this.files.readFile({ workspaceId, fileId });
    const actualVersion = digest(managed.bytes);
    if (expectedVersion !== actualVersion) throw wordError("AGENT_WORD_STALE_VERSION");
    const archive = assertDocxFile(managed.file, managed.bytes);
    const xml = readDocumentXml(archive);

    const fragments = collectFragments(xml);
    if (fragments.length === 0) throw wordError("AGENT_WORD_NO_TEXT");
    const beforeFind = countParagraphMatches(xml, target);
    if (beforeFind === 0) throw wordError("AGENT_WORD_MATCH_NOT_FOUND");
    if (beforeFind > 1 && !replaceAll) throw wordError("AGENT_WORD_AMBIGUOUS_MATCH");

    const edited = replaceTextInDocumentXml(xml, target, substitution, replaceAll);
    const nextBytes = await repackage(archive, edited.xml);
    verifyReplacement(archive, nextBytes, target, substitution, beforeFind, edited.matchCount);

    const replaced = await this.files.replaceFileBytes({ workspaceId, fileId, expectedVersion, bytes: nextBytes });
    return Object.freeze({
      modified: true,
      operation: "replaceText",
      matchesReplaced: edited.matchCount,
      fileId: replaced.file.fileId,
      previousVersion: replaced.previousVersion,
      newVersion: replaced.version,
      downloadAvailable: true,
    });
  }
}

/**
 * Fail closed on anything that is not a plain, macro-free DOCX container. The
 * legacy OLE/CFF magic catches a `.doc` renamed to `.docx`; `vbaProject`
 * rejects macros; the two required OPC parts prove it is a Word document.
 */
function assertDocxFile(file, bytes) {
  if (!/\.docx$/i.test(file?.originalName ?? "")) throw wordError("AGENT_WORD_UNSUPPORTED");
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, CFB_ENCRYPTED_MAGIC.length).equals(CFB_ENCRYPTED_MAGIC)) throw wordError("AGENT_WORD_ENCRYPTED");
  let archive;
  try {
    archive = BoundedZipArchive.open(buffer, DEFAULT_DOCUMENT_LIMITS);
  } catch (error) {
    if (error?.code === "AGENT_DOCUMENT_ENCRYPTED") throw wordError("AGENT_WORD_ENCRYPTED");
    throw wordError("AGENT_WORD_INVALID_DOCUMENT");
  }
  if (archive.names().some((name) => /(?:^|\/)vbaProject\./i.test(name))) throw wordError("AGENT_WORD_UNSUPPORTED");
  if (!archive.has(CONTENT_TYPES_ENTRY) || !archive.has(DOCUMENT_XML_ENTRY)) throw wordError("AGENT_WORD_INVALID_DOCUMENT");
  return archive;
}

function readDocumentXml(archive) {
  let bytes;
  try {
    bytes = archive.readEntry(DOCUMENT_XML_ENTRY);
  } catch {
    throw wordError("AGENT_WORD_INVALID_DOCUMENT");
  }
  if (bytes.includes(0)) throw wordError("AGENT_WORD_INVALID_DOCUMENT");
  const xml = bytes.toString("utf8");
  if (xml.length > MAX_DOCUMENT_XML_CHARS) throw wordError("AGENT_WORD_INVALID_DOCUMENT");
  return xml;
}

/**
 * A fresh global pattern for `<w:t ...>text</w:t>`. `<w:t` must be followed by
 * `>` or whitespace-then-attributes, so this never matches `<w:tab>`, `<w:tc>`,
 * `<w:tr>`, or `<w:tbl>`. A self-closing `<w:t/>` carries no text and has no
 * closing tag, so it is intentionally skipped. A new RegExp is returned per
 * call to keep `lastIndex` from being shared across loops.
 */
function textFragmentPattern() {
  return /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
}

function collectFragments(xml) {
  const fragments = [];
  const pattern = textFragmentPattern();
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    fragments.push({ index: fragments.length, text: decodeEntities(match[2]) });
  }
  return fragments;
}

function countParagraphs(xml) {
  const matches = xml.match(/<w:p[\s>/]/g);
  return matches ? matches.length : 0;
}

function buildPreview(xml) {
  let text;
  try {
    text = extractBlocks(xml, DEFAULT_DOCUMENT_LIMITS).blocks.map(renderBlock).join("\n");
  } catch {
    text = "";
  }
  return boundedText(text, MAX_PREVIEW_CHARS);
}

function renderBlock(block) {
  if (block.type === "table") return block.rows.map((row) => row.join(" | ")).join(" / ");
  return block.text;
}

/**
 * Group `<w:t>` fragments into paragraphs. Two fragments share a paragraph when
 * no `</w:p>` sits between them, so table-cell paragraphs stay separate while
 * every run of one paragraph is concatenated in document order. Each fragment
 * keeps its absolute xml offsets so the container can be rebuilt byte-for-byte
 * outside the matched runs.
 */
function collectParagraphs(xml) {
  const fragments = [];
  const pattern = textFragmentPattern();
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    fragments.push({ start: match.index, end: match.index + match[0].length, attributes: match[1] ?? "", text: decodeEntities(match[2]) });
  }
  const closes = [];
  const closePattern = /<\/w:p>/g;
  let close;
  while ((close = closePattern.exec(xml)) !== null) closes.push(close.index);
  const paragraphs = [];
  let closePtr = 0;
  let lastKey = -1;
  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index];
    while (closePtr < closes.length && closes[closePtr] < fragment.start) closePtr++;
    if (closePtr !== lastKey) { paragraphs.push({ fragments: [], text: "", bounds: [] }); lastKey = closePtr; }
    const paragraph = paragraphs[paragraphs.length - 1];
    const begin = paragraph.text.length;
    paragraph.text += fragment.text;
    paragraph.fragments.push({ index, fragment });
    paragraph.bounds.push([begin, paragraph.text.length]);
  }
  return { fragments, paragraphs };
}

/** Paragraph-level occurrence count of `find`, so text Word split across runs still counts. */
function countParagraphMatches(xml, find) {
  const { paragraphs } = collectParagraphs(xml);
  return paragraphs.reduce((sum, paragraph) => sum + countOccurrences(paragraph.text, find), 0);
}

function findParagraphs(xml, find) {
  const { paragraphs } = collectParagraphs(xml);
  const results = [];
  for (let index = 0; index < paragraphs.length; index++) {
    const occurrences = countOccurrences(paragraphs[index].text, find);
    if (occurrences > 0) results.push({ paragraph: index, occurrences, text: boundedText(paragraphs[index].text, MAX_FRAGMENT_TEXT) });
  }
  return results;
}

/** Non-overlapping [start,end) spans of `find` in `text`, capped at `budget`. */
function matchSpans(text, find, budget) {
  const spans = [];
  let position = text.indexOf(find);
  while (position !== -1 && spans.length < budget) {
    spans.push([position, position + find.length]);
    position = text.indexOf(find, position + find.length);
  }
  return spans;
}

/** Non-overlapping occurrence count using literal string search (no regex escaping of user text). */
function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let position = haystack.indexOf(needle);
  while (position !== -1) {
    count += 1;
    position = haystack.indexOf(needle, position + needle.length);
  }
  return count;
}

/**
 * Replace exact text that may span several `<w:t>` runs inside one paragraph.
 * The paragraph's visible text is rebuilt from its runs, the match offsets are
 * mapped back onto the runs they cover, and only those runs' character data is
 * rewritten: the first matched run absorbs the replacement (keeping its own
 * `<w:rPr>` and attributes) and the other matched runs lose only the matched
 * characters. Every byte outside the matched `<w:t>` elements, every run
 * property, and every other archive entry are preserved, so paragraph style and
 * document structure are unchanged. The replacement is applied on decoded text
 * and re-encoded, so `&`, `<`, `>` round-trip correctly, and building strings by
 * concatenation means `$` patterns in user text stay literal.
 */
function replaceTextInDocumentXml(xml, find, replace, replaceAll) {
  const { fragments, paragraphs } = collectParagraphs(xml);
  const newTexts = new Array(fragments.length).fill(null);
  let matchCount = 0;
  let budget = replaceAll ? Number.MAX_SAFE_INTEGER : 1;
  for (const paragraph of paragraphs) {
    if (budget <= 0) break;
    const spans = matchSpans(paragraph.text, find, budget);
    if (spans.length === 0) continue;
    matchCount += spans.length;
    budget -= spans.length;
    applyParagraphReplacement(paragraph, spans, replace, newTexts);
  }
  return { xml: reassemble(xml, fragments, newTexts), matchCount };
}

function applyParagraphReplacement(paragraph, spans, replace, newTexts) {
  for (let position = 0; position < paragraph.fragments.length; position++) {
    const [begin, end] = paragraph.bounds[position];
    const removed = [];
    const insertAt = new Set();
    for (const [start, stop] of spans) {
      const from = Math.max(start, begin);
      const to = Math.min(stop, end);
      if (from < to) removed.push([from - begin, to - begin]);
      if (start >= begin && start < end) insertAt.add(start - begin);
    }
    if (removed.length === 0 && insertAt.size === 0) continue;
    const { index, fragment } = paragraph.fragments[position];
    const drop = new Array(fragment.text.length).fill(false);
    for (const [from, to] of removed) for (let cursor = from; cursor < to; cursor++) drop[cursor] = true;
    let rebuilt = "";
    for (let cursor = 0; cursor <= fragment.text.length; cursor++) {
      if (insertAt.has(cursor)) rebuilt += replace;
      if (cursor < fragment.text.length && !drop[cursor]) rebuilt += fragment.text[cursor];
    }
    newTexts[index] = rebuilt;
  }
}

function reassemble(xml, fragments, newTexts) {
  let out = "";
  let cursor = 0;
  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index];
    out += xml.slice(cursor, fragment.start);
    out += newTexts[index] === null
      ? xml.slice(fragment.start, fragment.end)
      : `<w:t${fragment.attributes}>${encodeEntities(newTexts[index])}</w:t>`;
    cursor = fragment.end;
  }
  return out + xml.slice(cursor);
}

/**
 * Rebuild the container with every original entry in its original order,
 * swapping only `word/document.xml`. Reuses the generic ZIP writer already
 * shipped for XLSX (fflate-backed), so no new dependency is introduced.
 */
async function repackage(archive, nextDocumentXml) {
  const sink = toBuffer();
  const writer = createZipWriter(sink);
  const replacement = Buffer.from(nextDocumentXml, "utf8");
  try {
    for (const name of archive.names()) {
      const bytes = name === DOCUMENT_XML_ENTRY ? replacement : archive.readEntry(name);
      await writer.addEntry(name, bytes, { compress: true });
    }
    await writer.finalize();
    return sink.result();
  } catch (error) {
    try { writer.abort(error); } catch { /* best effort; surface the stable code below */ }
    throw wordError("AGENT_WORD_INVALID_DOCUMENT");
  }
}

/**
 * Prove the repackaged container is still a readable DOCX and that the edit
 * landed exactly as intended BEFORE any bytes are persisted. The occurrence
 * invariant `after === before * occurrences(find in replace)` accounts for a
 * replacement that itself contains the search text (e.g. "a" -> "aa").
 */
function verifyReplacement(originalArchive, nextBytes, find, replace, beforeFind, replacedCount) {
  if (replacedCount !== beforeFind) throw wordError("AGENT_WORD_VERIFICATION_FAILED");
  let archive;
  try {
    archive = BoundedZipArchive.open(Buffer.from(nextBytes), DEFAULT_DOCUMENT_LIMITS);
  } catch {
    throw wordError("AGENT_WORD_VERIFICATION_FAILED");
  }
  const before = originalArchive.names();
  const after = archive.names();
  if (before.length !== after.length || before.some((name, index) => name !== after[index])) throw wordError("AGENT_WORD_VERIFICATION_FAILED");
  let xml;
  try {
    xml = readDocumentXml(archive);
    extractBlocks(xml, DEFAULT_DOCUMENT_LIMITS);
  } catch {
    throw wordError("AGENT_WORD_VERIFICATION_FAILED");
  }
  const afterFind = countParagraphMatches(xml, find);
  if (afterFind !== beforeFind * countOccurrences(replace, find)) throw wordError("AGENT_WORD_VERIFICATION_FAILED");
  if (replace.length > 0) {
    const afterReplace = countParagraphMatches(xml, replace);
    if (afterReplace < 1) throw wordError("AGENT_WORD_VERIFICATION_FAILED");
  }
}

function normalizeFind(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw wordError("AGENT_WORD_INVALID_REQUEST");
  const normalized = value.normalize("NFC");
  if (normalized.length === 0 || normalized.length > MAX_FIND) throw wordError("AGENT_WORD_INVALID_REQUEST");
  return normalized;
}

function requireFind(value) {
  const normalized = normalizeFind(value);
  if (!normalized) throw wordError("AGENT_WORD_INVALID_REQUEST");
  return normalized;
}

function normalizeReplace(value) {
  if (typeof value !== "string") throw wordError("AGENT_WORD_INVALID_REQUEST");
  const normalized = value.normalize("NFC");
  if (normalized.length > MAX_REPLACE) throw wordError("AGENT_WORD_INVALID_REQUEST");
  return normalized;
}

function boundedText(value, max) {
  return value.length > max ? value.slice(0, max) : value;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function wordError(code) {
  return Object.assign(new Error(code), { code });
}
