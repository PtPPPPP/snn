import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, posix } from "node:path";
import { TEXT_EXTENSIONS } from "../documents/file-access.mjs";

const MANIFEST = ".snn-workspace-files.json";
const VERSION = 2;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const FILE_ID = /^snn-file-[a-z0-9-]{8,80}$/;
const STORED_NAME = /^\.snn-upload-[a-z0-9-]{8,80}$/;
const MAX_FILENAME_BYTES = 240;

/** Trusted server ingestion path. It is deliberately not an Agent tool. */
export class FileIngestionService {
  constructor({ workspaceManager, maxUploadBytes = 1_048_576, maxFiles = 100, maxTotalBytes = 10_485_760, io = {} }) {
    this.workspaceManager = workspaceManager;
    this.maxUploadBytes = maxUploadBytes;
    this.maxFiles = maxFiles;
    this.maxTotalBytes = maxTotalBytes;
    this.io = { writeFile, rename, rm, readFile, stat, ...io };
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
    const file = Object.freeze({ fileId, originalName: safeName, virtualPath: safeName, storedName, size: bytes.length, contentType: normalizeType(contentType), kind, sha256: createHash("sha256").update(bytes).digest("hex") });
    try {
      await this.io.writeFile(stage, bytes, { flag: "wx" });
      await this.io.rename(stage, target);
      await this.#save(workspace, { schemaVersion: VERSION, files: [...manifest.files, file] });
    } catch (error) {
      await this.io.rm(stage, { force: true }).catch(() => {});
      await this.io.rm(target, { force: true }).catch(() => {});
      throw error;
    }
    return publicFile(file);
  }

  async list(workspaceId) { const workspace = this.workspaceManager.resolve(workspaceId); return (await this.#load(workspace)).files.map(publicFile); }
  async readFile({ workspaceId, fileId }) {
    if (!FILE_ID.test(fileId)) throw code("AGENT_FILE_NOT_FOUND", "File was not found");
    const workspace = this.workspaceManager.resolve(workspaceId);
    const manifest = await this.#load(workspace);
    const file = manifest.files.find((item) => item.fileId === fileId);
    if (!file) throw code("AGENT_FILE_NOT_FOUND", "File was not found");
    const target = join(workspace.root, file.storedName);
    const metadata = await this.io.stat(target);
    if (!metadata.isFile() || metadata.size !== file.size || metadata.size > this.maxUploadBytes) throw code("AGENT_FILE_MUTATED", "File integrity check failed");
    const bytes = await this.io.readFile(target);
    if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw code("AGENT_FILE_MUTATED", "File integrity check failed");
    return { file: publicFile(file), bytes };
  }
  async resolveVirtualPath({ workspaceId, virtualPath }) {
    const workspace = this.workspaceManager.resolve(workspaceId);
    const path = validateVirtualPath(virtualPath);
    const manifest = await this.#load(workspace);
    return { workspace, virtualPath: path, file: manifest.files.find((item) => item.virtualPath === path) };
  }
  async readEditableText({ workspaceId, virtualPath }) {
    const resolved = await this.resolveVirtualPath({ workspaceId, virtualPath });
    if (!resolved.file) throw code("AGENT_FILE_NOT_FOUND", "File was not found");
    if (!isEditableTextFile(resolved.file)) throw code("AGENT_FILE_NOT_EDITABLE", "File is not editable");
    const bytes = await readFile(join(resolved.workspace.root, resolved.file.storedName));
    if (bytes.length !== resolved.file.size || createHash("sha256").update(bytes).digest("hex") !== resolved.file.sha256 || bytes.includes(0)) throw code("AGENT_FILE_MUTATED", "File integrity check failed");
    let content;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw code("AGENT_FILE_NOT_EDITABLE", "File is not valid UTF-8"); }
    return { ...resolved, content, version: resolved.file.sha256 };
  }
  async writeEditableText({ workspaceId, virtualPath, content, expected }) {
    if (typeof content !== "string") throw code("AGENT_FILE_NOT_EDITABLE", "File content must be text");
    const bytes = Buffer.from(content, "utf8");
    if (bytes.length > this.maxUploadBytes) throw code("AGENT_FILE_TOO_LARGE", "File exceeds editable size limit");
    const resolved = await this.resolveVirtualPath({ workspaceId, virtualPath });
    const manifest = await this.#load(resolved.workspace);
    const current = manifest.files.find((item) => item.virtualPath === resolved.virtualPath);
    if (current?.kind !== undefined && !isEditableTextFile(current)) throw code("AGENT_FILE_NOT_EDITABLE", "File is not editable");
    if (!current && !isEditableTextPath(resolved.virtualPath)) throw code("AGENT_FILE_NOT_EDITABLE", "File type is not editable");
    if (expected?.kind === "createIfAbsent" && current) throw code("AGENT_FILE_EXISTS", "File already exists");
    if (expected?.kind === "replaceIfVersion" && (!current || current.sha256 !== expected.version)) throw code("AGENT_FILE_STALE", "File changed since it was read");
    const before = current ? (await this.readEditableText({ workspaceId, virtualPath: resolved.virtualPath })).content : null;
    const fileId = current?.fileId ?? `snn-file-${randomUUID()}`;
    const storedName = `.snn-upload-${randomUUID()}`;
    const next = Object.freeze({ fileId, originalName: current?.originalName ?? basename(resolved.virtualPath), virtualPath: resolved.virtualPath, storedName, size: bytes.length, contentType: current?.contentType ?? "text/plain", kind: "text", sha256: createHash("sha256").update(bytes).digest("hex") });
    const stage = join(resolved.workspace.root, `.${fileId}.stage`);
    const target = join(resolved.workspace.root, storedName);
    try {
      await this.io.writeFile(stage, bytes, { flag: "wx" });
      await this.io.rename(stage, target);
      await this.#save(resolved.workspace, { schemaVersion: VERSION, files: [...manifest.files.filter((item) => item.fileId !== fileId), next] });
    } catch (error) {
      await this.io.rm(stage, { force: true }).catch(() => {});
      await this.io.rm(target, { force: true }).catch(() => {});
      throw error;
    }
    if (current) await this.io.rm(join(resolved.workspace.root, current.storedName), { force: true }).catch(() => {});
    return { operation: current ? "update" : "create", file: next, before, after: content, version: next.sha256 };
  }
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
  async #save(workspace, manifest) { const temp = join(workspace.root, `${MANIFEST}.${process.pid}.${Date.now()}.tmp`); try { await this.io.writeFile(temp, JSON.stringify(manifest), { flag: "wx" }); await this.io.rename(temp, join(workspace.root, MANIFEST)); } finally { await this.io.rm(temp, { force: true }).catch(() => {}); } }
}

async function readBounded(body, max) { const chunks = []; let size = 0; for await (const chunk of body) { size += chunk.length; if (size > max) throw code("AGENT_FILE_TOO_LARGE", "File exceeds upload limit"); chunks.push(chunk); } return Buffer.concat(chunks); }
function validateName(name) { if (!isSafeOriginalName(name)) throw code("AGENT_FILE_INVALID", "Filename is invalid"); return name; }
function normalizeType(type) { return typeof type === "string" && type.length <= 128 ? type.toLowerCase() : "application/octet-stream"; }
function isSafeOriginalName(name) { return typeof name === "string" && name.length > 0 && Buffer.byteLength(name, "utf8") <= MAX_FILENAME_BYTES && name === basename(name) && !/[\\/\0-\x1f]/.test(name) && !/^[a-z]:/i.test(name) && !RESERVED.test(name) && !/[. ]$/.test(name); }
function normalize(value) { if (!value || (value.schemaVersion !== 1 && value.schemaVersion !== VERSION) || !Array.isArray(value.files)) throw code("AGENT_FILE_MANIFEST_INVALID", "Workspace file inventory is invalid"); const ids = new Set(); const paths = new Set(); const files = value.files.map((file) => ({ ...file, virtualPath: file.virtualPath ?? file.originalName })); for (const file of files) { if (!FILE_ID.test(file?.fileId) || !isSafeOriginalName(file.originalName) || !isSafeVirtualPath(file.virtualPath) || typeof file.storedName !== "string" || (!STORED_NAME.test(file.storedName) && !isSafeOriginalName(file.storedName)) || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.contentType !== "string" || (file.kind !== "text" && file.kind !== "opaque") || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(file.sha256) || ids.has(file.fileId) || paths.has(file.virtualPath)) throw code("AGENT_FILE_MANIFEST_INVALID", "Workspace file inventory is invalid"); ids.add(file.fileId); paths.add(file.virtualPath); } return { schemaVersion: VERSION, files }; }
function publicFile(file) { return Object.freeze({ fileId: file.fileId, originalName: file.originalName, virtualPath: file.virtualPath, size: file.size, kind: file.kind, contentType: file.contentType }); }
function validateVirtualPath(value) { if (!isSafeVirtualPath(value)) throw code("AGENT_FILE_PATH_INVALID", "Workspace path is invalid"); return value.normalize("NFC"); }
function isSafeVirtualPath(value) { if (typeof value !== "string" || value.length === 0 || value !== value.normalize("NFC") || value.includes("\\") || /[\0-\x1f]/.test(value) || value.startsWith("/") || /^[a-z]:/i.test(value) || value.startsWith("//")) return false; const normalized = posix.normalize(value); return normalized === value && normalized !== "." && !normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === ".."); }
function isEditableTextFile(file) { return file.kind === "text" && isEditableTextPath(file.virtualPath ?? file.originalName); }
function isEditableTextPath(path) { const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase(); return extension === undefined || TEXT_EXTENSIONS.has(extension); }
function code(code, message) { return Object.assign(new Error(message), { code }); }
