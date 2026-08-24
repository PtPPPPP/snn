import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { documentError } from "../documents/limits.mjs";
import { readWorkspaceFileEntry } from "../documents/document-extraction-service.mjs";
import { ACCESS_MODES, classifyFileAccess } from "../documents/file-access.mjs";
import { MAX_WORKSPACE_TEXT_BYTES } from "./workspace-manager.mjs";

/**
 * Unified fileId-based read path behind the workspace.open tool. The root is
 * fixed at construction; every open revalidates against THIS workspace's
 * current manifest, so deleted or mutated files fail closed and a foreign
 * workspace's file id can never resolve.
 */
export class WorkspaceFileOpener {
  #root;
  #documents;

  constructor({ root, documents }) {
    if (typeof root !== "string" || root.length === 0) throw new TypeError("root is required");
    if (!documents || typeof documents.extract !== "function") throw new TypeError("documents service is required");
    this.#root = root;
    this.#documents = documents;
  }

  /** @param {string} fileId server-assigned id; never a path or filename. */
  async open(fileId) {
    try {
      const entry = await readWorkspaceFileEntry(this.#root, fileId);
      const accessMode = classifyFileAccess(entry);
      if (accessMode === ACCESS_MODES.documentExtract) return await this.#documents.extract(fileId);
      if (accessMode !== ACCESS_MODES.textRead) throw documentError("AGENT_DOCUMENT_UNSUPPORTED");
      return await this.#openText(entry);
    } catch (error) {
      throw normalizeOpenError(error);
    }
  }

  async #openText(entry) {
    const path = join(this.#root, entry.storedName);
    let stats;
    try { stats = await lstat(path); }
    catch { throw documentError("AGENT_DOCUMENT_NOT_FOUND"); }
    if (!stats.isFile()) throw documentError("AGENT_DOCUMENT_NOT_FOUND");
    if (stats.size > MAX_WORKSPACE_TEXT_BYTES || entry.size > MAX_WORKSPACE_TEXT_BYTES) throw documentError("AGENT_DOCUMENT_TOO_LARGE");
    const bytes = await readFile(path);
    if (bytes.length !== entry.size) throw documentError("AGENT_DOCUMENT_INVALID");
    // Identity re-validation: replaced or mutated content never leaves the boundary as text.
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw documentError("AGENT_DOCUMENT_INVALID");
    if (bytes.includes(0)) throw documentError("AGENT_DOCUMENT_INVALID");
    return bytes.toString("utf8");
  }
}

function normalizeOpenError(error) {
  return typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_") ? error : documentError("AGENT_DOCUMENT_INVALID");
}
