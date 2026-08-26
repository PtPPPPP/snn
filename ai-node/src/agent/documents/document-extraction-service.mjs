import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, win32 } from "node:path";
import { documentError } from "./limits.mjs";
import { createDefaultDocumentParserRegistry, TEXT_EXTENSIONS } from "./file-access.mjs";

export { createDefaultDocumentParserRegistry, TEXT_EXTENSIONS };

const MANIFEST_FILENAME = ".snn-workspace-files.json";
const FILE_ID_PATTERN = /^snn-file-[a-z0-9-]{8,80}$/;
const LEGACY_STORED_NAME_PATTERN = /^[a-z0-9.-]+$/i;
const MANAGED_STORED_NAME_PATTERN = /^\.snn-upload-[a-z0-9-]{8,80}$/;

/**
 * Child-side, workspace-scoped document extraction. The service root is fixed
 * at construction; a fileId resolves only through THIS workspace's manifest,
 * so a foreign workspace's file id can never name a file here.
 */
export class DocumentExtractionService {
  #root;
  #limits;
  #registry;
  #onDiagnostic;

  constructor({ workspaceRoot, limits, registry = createDefaultDocumentParserRegistry(), onDiagnostic = () => {} }) {
    if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0) throw new TypeError("workspaceRoot is required");
    this.#root = workspaceRoot;
    this.#limits = limits;
    this.#registry = registry;
    this.#onDiagnostic = onDiagnostic;
  }

  async extract(fileId) {
    try {
      const result = await this.#extract(fileId);
      this.#diagnostic({ fileId, outcome: "extracted", truncated: result.truncated });
      return result.render(basename(result.originalName));
    } catch (error) {
      const category = typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_") ? error.code : "AGENT_DOCUMENT_INVALID";
      this.#diagnostic({ fileId: typeof fileId === "string" ? fileId : undefined, outcome: "failed", failureCategory: category });
      throw documentError(category);
    }
  }

  async #extract(fileId) {
    const entry = await readWorkspaceFileEntry(this.#root, fileId);

    const path = join(this.#root, entry.storedName);
    const bytes = await readFile(path);
    // Identity re-validation closes the manifest→read window: replaced or mutated content never reaches a parser.
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== entry.sha256) throw documentError("AGENT_DOCUMENT_INVALID");
    if (bytes.length > this.#limits.maxDocumentBytes) throw documentError("AGENT_DOCUMENT_TOO_LARGE");

    const parser = this.#selectParser(entry.originalName, bytes);
    const parsed = await parser.parse(bytes, this.#limits);
    const originalName = sanitizeOriginalName(entry.originalName);
    return {
      originalName,
      truncated: parsed.truncated === true,
      render: () => parsed.render(originalName),
      stats: parsedStats(parsed),
    };
  }

  #selectParser(originalName, bytes) {
    const extension = /\.([a-z0-9]+)$/i.exec(typeof originalName === "string" ? originalName : "")?.[1]?.toLowerCase();
    if (!extension) throw documentError("AGENT_DOCUMENT_UNSUPPORTED");
    if (TEXT_EXTENSIONS.has(extension)) throw documentError("AGENT_DOCUMENT_UNSUPPORTED");
    if (extension === "docm" || extension === "xlsm") throw documentError("AGENT_DOCUMENT_UNSUPPORTED");
    const parser = this.#registry.get(extension);
    if (!parser) throw documentError("AGENT_DOCUMENT_UNSUPPORTED");
    // Extension decides the parser; the parser itself rejects signature mismatches.
    assertSignature(extension, bytes);
    return parser;
  }

  #diagnostic(event) {
    try { this.#onDiagnostic(Object.freeze({ ...event })); }
    catch { /* Diagnostics are observational. */ }
  }
}

function parsedStats(parsed) {
  if (parsed.kind === "pdf") return Object.freeze({ pages: parsed.pageCount, declaredPages: parsed.declaredPageCount });
  if (parsed.kind === "docx") return Object.freeze({ blocks: parsed.blocks.length });
  return Object.freeze({ sheets: parsed.sheets.length });
}

/**
 * Resolve one fileId against THIS workspace's manifest with full structural
 * validation. Shared by document extraction and the workspace.open text path.
 * Throws only stable AGENT_DOCUMENT_* errors; a foreign workspace's file id
 * can never name a file here because the root is fixed at construction.
 */
export async function readWorkspaceFileEntry(root, fileId) {
  if (typeof fileId !== "string" || !FILE_ID_PATTERN.test(fileId)) throw documentError("AGENT_DOCUMENT_NOT_FOUND");
  const manifest = await readManifest(root);
  const entry = manifest.files.find((file) => file.fileId === fileId);
  if (!entry) throw documentError("AGENT_DOCUMENT_NOT_FOUND");
  if (typeof entry.storedName !== "string" || (!LEGACY_STORED_NAME_PATTERN.test(entry.storedName) && !MANAGED_STORED_NAME_PATTERN.test(entry.storedName)) || isAbsolute(entry.storedName) || win32.isAbsolute(entry.storedName)) {
    throw documentError("AGENT_DOCUMENT_INVALID");
  }
  let stats;
  try { stats = await stat(join(root, entry.storedName)); }
  catch { throw documentError("AGENT_DOCUMENT_NOT_FOUND"); }
  if (!stats.isFile()) throw documentError("AGENT_DOCUMENT_NOT_FOUND");
  if (stats.size !== entry.size) throw documentError("AGENT_DOCUMENT_INVALID");
  return Object.freeze({
    fileId,
    originalName: typeof entry.originalName === "string" ? entry.originalName : "",
    storedName: entry.storedName,
    size: entry.size,
    kind: entry.kind,
    sha256: entry.sha256,
  });
}

function assertSignature(extension, bytes) {
  if (extension === "pdf") {
    if (!bytes.subarray(0, 5).toString("latin1").startsWith("%PDF-")) throw documentError("AGENT_DOCUMENT_INVALID");
    return;
  }
  if (extension === "docx" || extension === "xlsx") {
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw documentError("AGENT_DOCUMENT_INVALID");
  }
}

function sanitizeOriginalName(name) {
  return typeof name === "string" ? basename(name).slice(0, 200) : "document";
}

async function readManifest(root) {
  try {
    const value = JSON.parse(await readFile(join(root, MANIFEST_FILENAME), "utf8"));
    if (!value || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || !Array.isArray(value.files)) throw documentError("AGENT_DOCUMENT_INVALID");
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") throw documentError("AGENT_DOCUMENT_NOT_FOUND");
    if (typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_")) throw error;
    throw documentError("AGENT_DOCUMENT_INVALID");
  }
}
