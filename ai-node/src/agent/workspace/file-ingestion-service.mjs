import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const MANIFEST = ".snn-workspace-files.json";
const VERSION = 1;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const FILE_ID = /^snn-file-[a-z0-9-]{8,80}$/;
const STORED_NAME = /^\.snn-upload-[a-z0-9-]{8,80}$/;
const MAX_FILENAME_BYTES = 240;

/** Trusted server ingestion path. It is deliberately not an Agent tool. */
export class FileIngestionService {
  constructor({ workspaceManager, maxUploadBytes = 1_048_576, maxFiles = 100, maxTotalBytes = 10_485_760 }) {
    this.workspaceManager = workspaceManager;
    this.maxUploadBytes = maxUploadBytes;
    this.maxFiles = maxFiles;
    this.maxTotalBytes = maxTotalBytes;
  }

  async ingest({ workspaceId, originalName, contentType = "application/octet-stream", body }) {
    const workspace = this.workspaceManager.resolve(workspaceId);
    const safeName = validateName(originalName);
    const bytes = await readBounded(body, this.maxUploadBytes);
    const manifest = await this.#load(workspace);
    if (manifest.files.length >= this.maxFiles || manifest.files.reduce((sum, file) => sum + file.size, 0) + bytes.length > this.maxTotalBytes) throw code("AGENT_WORKSPACE_QUOTA_EXCEEDED", "Workspace quota exceeded");
    const fileId = `snn-file-${randomUUID()}`;
    const storedName = `.snn-upload-${fileId.slice("snn-file-".length)}`;
    if (manifest.files.some((file) => file.originalName === safeName)) throw code("AGENT_FILE_CONFLICT", "A file with this name already exists");
    const stage = join(workspace.root, `.${fileId}.stage`);
    const target = join(workspace.root, storedName);
    const kind = bytes.includes(0) ? "opaque" : "text";
    const file = Object.freeze({ fileId, originalName: safeName, storedName, size: bytes.length, contentType: normalizeType(contentType), kind, sha256: createHash("sha256").update(bytes).digest("hex") });
    try {
      await writeFile(stage, bytes, { flag: "wx" });
      await rename(stage, target);
      await this.#save(workspace, { schemaVersion: VERSION, files: [...manifest.files, file] });
    } catch (error) {
      await rm(stage, { force: true }).catch(() => {});
      await rm(target, { force: true }).catch(() => {});
      throw error;
    }
    return publicFile(file);
  }

  async list(workspaceId) { const workspace = this.workspaceManager.resolve(workspaceId); return (await this.#load(workspace)).files.map(publicFile); }
  async remove({ workspaceId, fileId }) {
    if (!FILE_ID.test(fileId)) throw code("AGENT_FILE_NOT_FOUND", "File was not found");
    const workspace = this.workspaceManager.resolve(workspaceId); const manifest = await this.#load(workspace);
    const file = manifest.files.find((item) => item.fileId === fileId); if (!file) throw code("AGENT_FILE_NOT_FOUND", "File was not found");
    const target = join(workspace.root, file.storedName); await rm(target); await this.#save(workspace, { schemaVersion: VERSION, files: manifest.files.filter((item) => item.fileId !== fileId) });
  }

  async #load(workspace) {
    try { return normalize(JSON.parse(await readFile(join(workspace.root, MANIFEST), "utf8"))); }
    catch (error) { if (error?.code === "ENOENT") return { schemaVersion: VERSION, files: [] }; if (error?.code?.startsWith("AGENT_")) throw error; throw code("AGENT_FILE_MANIFEST_INVALID", "Workspace file inventory is invalid"); }
  }
  async #save(workspace, manifest) { const temp = join(workspace.root, `${MANIFEST}.${process.pid}.${Date.now()}.tmp`); try { await writeFile(temp, JSON.stringify(manifest), { flag: "wx" }); await rename(temp, join(workspace.root, MANIFEST)); } finally { await rm(temp, { force: true }).catch(() => {}); } }
}

async function readBounded(body, max) { const chunks = []; let size = 0; for await (const chunk of body) { size += chunk.length; if (size > max) throw code("AGENT_FILE_TOO_LARGE", "File exceeds upload limit"); chunks.push(chunk); } return Buffer.concat(chunks); }
function validateName(name) { if (!isSafeOriginalName(name)) throw code("AGENT_FILE_INVALID", "Filename is invalid"); return name; }
function normalizeType(type) { return typeof type === "string" && type.length <= 128 ? type.toLowerCase() : "application/octet-stream"; }
function isSafeOriginalName(name) { return typeof name === "string" && name.length > 0 && Buffer.byteLength(name, "utf8") <= MAX_FILENAME_BYTES && name === basename(name) && !/[\\/\0-\x1f]/.test(name) && !/^[a-z]:/i.test(name) && !RESERVED.test(name) && !/[. ]$/.test(name); }
function normalize(value) { if (!value || value.schemaVersion !== VERSION || !Array.isArray(value.files)) throw code("AGENT_FILE_MANIFEST_INVALID", "Workspace file inventory is invalid"); const ids = new Set(); const names = new Set(); for (const file of value.files) { if (!FILE_ID.test(file?.fileId) || !isSafeOriginalName(file.originalName) || typeof file.storedName !== "string" || (!STORED_NAME.test(file.storedName) && !isSafeOriginalName(file.storedName)) || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.contentType !== "string" || (file.kind !== "text" && file.kind !== "opaque") || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(file.sha256) || ids.has(file.fileId) || names.has(file.originalName)) throw code("AGENT_FILE_MANIFEST_INVALID", "Workspace file inventory is invalid"); ids.add(file.fileId); names.add(file.originalName); } return value; }
function publicFile(file) { return Object.freeze({ fileId: file.fileId, originalName: file.originalName, size: file.size, kind: file.kind, contentType: file.contentType }); }
function code(code, message) { return Object.assign(new Error(message), { code }); }
