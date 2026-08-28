import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isSafeOriginalName } from "./file-ingestion-service.mjs";

// Must stay aligned with PUBLIC_UPLOAD_MAX_BYTES (bff.mjs), the production
// FileIngestionService maxUploadBytes (src/index.mjs) and the client mirror
// AGENT_UPLOAD_MAX_BYTES (lib/agent-client.ts).
export const UPLOAD_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_ID_RE = /^snn-upload-[a-z0-9-]{8,120}$/;

function code(codeText, message) {
  return Object.assign(new Error(message), { code: codeText });
}

function sha256hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameHex(a, b) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Server-choreographed chunked uploads for the public Agent workspace.
 *
 * The client declares the whole file up front (name + exact total bytes) and
 * then streams fixed-size chunks that the server stages outside any browser-
 * reachable or Agent-visible path. Nothing becomes a workspace file until
 * finalize re-assembles every chunk, verifies the byte math, and hands the
 * stream to the authoritative FileIngestionService. Staging dirs are session-
 * scoped and swept by TTL, so abandoned browsers cannot leak disk forever.
 */
export class ChunkedUploadService {
  constructor({ root, maxFileBytes = UPLOAD_MAX_FILE_BYTES, chunkSize = 4 * 1024 * 1024, ttlMs = 24 * 60 * 60 * 1000, maxOpenUploadsPerSession = 8, clock = Date.now }) {
    if (typeof root !== "string" || root.length === 0) throw new Error("ChunkedUploadService root is required");
    this.root = root;
    this.maxFileBytes = maxFileBytes;
    this.chunkSize = chunkSize;
    this.ttlMs = ttlMs;
    this.maxOpenUploadsPerSession = maxOpenUploadsPerSession;
    this.clock = clock;
    this.finalizing = new Set();
  }

  #sessionDir(sessionId) {
    return join(this.root, sessionId);
  }

  #uploadDir(sessionId, uploadId) {
    return join(this.#sessionDir(sessionId), uploadId);
  }

  async #readMeta(sessionId, uploadId) {
    if (!UPLOAD_ID_RE.test(uploadId ?? "")) throw code("AGENT_UPLOAD_NOT_FOUND", "Upload was not found");
    let raw;
    try {
      raw = await readFile(join(this.#uploadDir(sessionId, uploadId), "meta.json"), "utf8");
    } catch {
      // Same concealment answer for unknown ids and other owners' ids.
      throw code("AGENT_UPLOAD_NOT_FOUND", "Upload was not found");
    }
    const meta = JSON.parse(raw);
    if (meta?.sessionId !== sessionId || meta?.uploadId !== uploadId) throw code("AGENT_UPLOAD_NOT_FOUND", "Upload was not found");
    return meta;
  }

  async #writeMeta(dir, meta) {
    const tmp = join(dir, `meta.json.${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(meta), { flag: "wx" });
    await rm(join(dir, "meta.json"), { force: true });
    await rename(tmp, join(dir, "meta.json"));
  }

  async create({ sessionId, originalName, contentType = "application/octet-stream", totalSize }) {
    if (!isSafeOriginalName(originalName)) throw code("AGENT_FILE_INVALID", "Filename is invalid");
    if (!Number.isSafeInteger(totalSize) || totalSize < 1 || totalSize > this.maxFileBytes) throw code("AGENT_FILE_TOO_LARGE", "File exceeds upload limit");
    const uploadId = `snn-upload-${randomUUID()}`;
    const dir = this.#uploadDir(sessionId, uploadId);
    const sessionDir = this.#sessionDir(sessionId);
    await mkdir(sessionDir, { recursive: true });
    const existing = (await readdir(sessionDir).catch(() => [])).filter((entry) => entry !== ".tmp");
    if (existing.length >= this.maxOpenUploadsPerSession) throw code("AGENT_UPLOAD_LIMIT", "Too many open uploads for this session");
    const meta = {
      uploadId,
      sessionId,
      originalName,
      contentType: typeof contentType === "string" && contentType.length > 0 && contentType.length <= 128 ? contentType : "application/octet-stream",
      totalSize,
      chunkSize: this.chunkSize,
      createdAt: this.clock(),
      chunks: {},
    };
    await mkdir(dir, { recursive: true });
    await this.#writeMeta(dir, meta);
    return this.#publicUpload(meta, []);
  }

  async putChunk({ sessionId, uploadId, index, bytes }) {
    if (!Number.isSafeInteger(index) || index < 0 || index > 1024) throw code("AGENT_CHUNK_INVALID", "Chunk index is invalid");
    const meta = await this.#readMeta(sessionId, uploadId);
    if (index >= Math.ceil(meta.totalSize / meta.chunkSize)) throw code("AGENT_CHUNK_INVALID", "Chunk index is invalid");
    const expected = index === Math.ceil(meta.totalSize / meta.chunkSize) - 1 ? meta.totalSize - index * meta.chunkSize : meta.chunkSize;
    if (!Buffer.isBuffer(bytes) || bytes.length !== expected) throw code("AGENT_CHUNK_INVALID", "Chunk size does not match the declared upload geometry");
    const digest = sha256hex(bytes);
    const previous = meta.chunks[index];
    if (typeof previous === "string") {
      if (!sameHex(previous, digest)) throw code("AGENT_CHUNK_CONFLICT", "Chunk bytes conflict with an already received chunk");
      return this.#chunkResult(meta, index, digest, true);
    }
    const dir = this.#uploadDir(sessionId, uploadId);
    const tmp = join(dir, `chunk-${index}.${randomUUID()}.tmp`);
    await writeFile(tmp, bytes, { flag: "wx" });
    await rename(tmp, join(dir, `chunk-${index}`));
    meta.chunks[index] = digest;
    await this.#writeMeta(dir, meta);
    return this.#chunkResult(meta, index, digest, false);
  }

  /**
   * Re-assembles the staged chunks and hands the byte stream to the
   * authoritative ingestion path. The ingest callback receives
   * ({ originalName, contentType, stream }) and must return the public file.
   */
  async complete({ sessionId, uploadId, ingest }) {
    if (this.finalizing.has(uploadId)) throw code("AGENT_UPLOAD_ALREADY_FINALIZED", "Upload was already finalized");
    const meta = await this.#readMeta(sessionId, uploadId);
    this.finalizing.add(uploadId);
    try {
      const count = Math.ceil(meta.totalSize / meta.chunkSize);
      for (let index = 0; index < count; index += 1) {
        if (typeof meta.chunks[index] !== "string") throw code("AGENT_UPLOAD_INCOMPLETE", "Upload is missing chunks");
      }
      const dir = this.#uploadDir(sessionId, uploadId);
      const stream = (async function* () {
        for (let index = 0; index < count; index += 1) {
          yield await readFile(join(dir, `chunk-${index}`));
        }
      })();
      const file = await ingest({ originalName: meta.originalName, contentType: meta.contentType, stream });
      await rm(dir, { recursive: true, force: true });
      return file;
    } finally {
      this.finalizing.delete(uploadId);
    }
  }

  async cancel({ sessionId, uploadId }) {
    const meta = await this.#readMeta(sessionId, uploadId);
    await rm(this.#uploadDir(meta.sessionId, uploadId), { recursive: true, force: true });
    return { uploadId, status: "cancelled" };
  }

  /** Removes staging for uploads abandoned past the TTL. Completed files live in the workspace manifest and are never touched. */
  async sweepExpired(now = this.clock()) {
    const sessionDirs = await readdir(this.root).catch(() => []);
    let removed = 0;
    for (const sessionId of sessionDirs) {
      const sessionDir = join(this.root, sessionId);
      const entries = await readdir(sessionDir).catch(() => []);
      for (const uploadId of entries) {
        const dir = join(sessionDir, uploadId);
        let meta;
        try {
          meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
        } catch {
          // Orphaned staging (crashed before meta write): fall back to mtime.
          const info = await stat(dir).catch(() => null);
          if (info && now - info.mtimeMs > this.ttlMs) {
            await rm(dir, { recursive: true, force: true });
            removed += 1;
          }
          continue;
        }
        if (now - meta.createdAt > this.ttlMs) {
          await rm(dir, { recursive: true, force: true });
          removed += 1;
        }
      }
    }
    return removed;
  }

  #publicUpload(meta, received) {
    return Object.freeze({ uploadId: meta.uploadId, originalName: meta.originalName, totalSize: meta.totalSize, chunkSize: meta.chunkSize, receivedChunks: received });
  }

  async #chunkResult(meta, index, digest, idempotent) {
    const received = Object.keys(meta.chunks).map((key) => Number(key)).sort((a, b) => a - b);
    return Object.freeze({ index, sha256: digest, idempotent, receivedChunks: received });
  }
}
