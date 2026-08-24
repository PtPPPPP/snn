import { createHash, timingSafeEqual } from "node:crypto";
import { link, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = 1;
const SESSION_ID = /^snn-agent-[a-z0-9-]{8,80}$/;

/** Hash raw token with SHA-256 hex, never persist raw. */
export function hashOwnerToken(token) {
  if (typeof token !== "string" || token.length === 0) throw new TypeError("owner token is required");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Timing-safe compare of two hex digests. */
export function equalHashes(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Server-owned browser ownership bindings. */
export class PublicAgentOwnershipStore {
  #root;
  constructor(root) {
    if (typeof root !== "string" || root.length === 0) throw new TypeError("ownership root is required");
    this.root = root;
  }

  async create(sessionId, ownerTokenHash) {
    assertSessionId(sessionId);
    if (typeof ownerTokenHash !== "string" || !/^[a-f0-9]{64}$/.test(ownerTokenHash)) throw new TypeError("ownerTokenHash must be SHA-256 hex");
    const record = Object.freeze({
      schemaVersion: VERSION,
      sessionId,
      ownerTokenHash,
      createdAt: new Date().toISOString(),
      lastAccessAt: new Date().toISOString(),
    });
    await mkdir(this.root, { recursive: true });
    const target = this.#path(sessionId);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      // Atomic create: write to temp, then hard-link to target (fails if target exists).
      await writeFile(tmp, JSON.stringify(record), { encoding: "utf8", flag: "wx" });
      try {
        await link(tmp, target);
      } catch (error) {
        await rm(tmp, { force: true }).catch(() => {});
        if (error?.code === "EEXIST") throw Object.assign(new Error("Ownership already exists"), { code: "AGENT_OWNERSHIP_EXISTS" });
        throw error;
      }
      await rm(tmp, { force: true });
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      if (error?.code === "AGENT_OWNERSHIP_EXISTS") throw error;
      throw error;
    }
    return record;
  }

  async get(sessionId) {
    assertSessionId(sessionId);
    let text;
    try { text = await readFile(this.#path(sessionId), "utf8"); }
    catch (error) {
      if (error?.code === "ENOENT") throw Object.assign(new Error("Ownership not found"), { code: "AGENT_SESSION_NOT_FOUND" });
      throw error;
    }
    try { return normalize(JSON.parse(text)); }
    catch (error) {
      if (error?.code?.startsWith("AGENT_")) throw error;
      throw Object.assign(new Error("Ownership record is invalid"), { code: "AGENT_OWNERSHIP_CORRUPT" });
    }
  }

  async verify(sessionId, presentedToken) {
    // presentedToken is raw token from cookie
    let record;
    try { record = await this.get(sessionId); }
    catch (error) {
      // map not found to generic 404 to avoid leaking existence to wrong owner
      if (error?.code === "AGENT_SESSION_NOT_FOUND" || error?.code === "AGENT_OWNERSHIP_CORRUPT") {
        throw Object.assign(new Error("Agent session is not available"), { code: "AGENT_SESSION_NOT_FOUND" });
      }
      throw error;
    }
    if (typeof presentedToken !== "string" || presentedToken.length === 0) {
      throw Object.assign(new Error("Agent session is not available"), { code: "AGENT_SESSION_NOT_FOUND" });
    }
    let presentedHash;
    try { presentedHash = hashOwnerToken(presentedToken); } catch {
      throw Object.assign(new Error("Agent session is not available"), { code: "AGENT_SESSION_NOT_FOUND" });
    }
    if (!equalHashes(record.ownerTokenHash, presentedHash)) {
      // fail closed, do not reveal that session exists but belongs to someone else
      throw Object.assign(new Error("Agent session is not available"), { code: "AGENT_SESSION_NOT_FOUND" });
    }
    return record;
  }

  async touch(sessionId) {
    assertSessionId(sessionId);
    let record;
    try { record = await this.get(sessionId); }
    catch { return; }
    const updated = { ...record, lastAccessAt: new Date().toISOString() };
    // Atomic write: temp file + rename so concurrent readers never see a partial file.
    const target = this.#path(sessionId);
    const tmp = `${target}.${process.pid}.${Date.now()}.touch.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(updated), { encoding: "utf8" });
      await rename(tmp, target);
    } catch {
      await rm(tmp, { force: true }).catch(() => {});
    }
  }

  async delete(sessionId) {
    assertSessionId(sessionId);
    await rm(this.#path(sessionId), { force: true });
  }

  async countAll() {
    try {
      const files = await readdir(this.root);
      return files.filter((f) => f.endsWith(".json")).length;
    } catch (error) {
      if (error?.code === "ENOENT") return 0;
      throw error;
    }
  }

  async listAllIds() {
    try {
      const files = await readdir(this.root);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).filter((id) => SESSION_ID.test(id));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async countByOwner(ownerTokenHash) {
    if (typeof ownerTokenHash !== "string" || !/^[a-f0-9]{64}$/.test(ownerTokenHash)) return 0;
    try {
      const files = await readdir(this.root);
      let count = 0;
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const text = await readFile(join(this.root, file), "utf8");
          const rec = normalize(JSON.parse(text));
          if (equalHashes(rec.ownerTokenHash, ownerTokenHash)) count += 1;
        } catch {
          // corrupt file is counted as not belonging to anyone, but will be swept
        }
      }
      return count;
    } catch (error) {
      if (error?.code === "ENOENT") return 0;
      throw error;
    }
  }

  async listByOwner(ownerTokenHash) {
    const out = [];
    try {
      const files = await readdir(this.root);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const text = await readFile(join(this.root, file), "utf8");
          const rec = normalize(JSON.parse(text));
          if (equalHashes(rec.ownerTokenHash, ownerTokenHash)) out.push(rec);
        } catch {}
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return out;
  }

  async sweepExpired(nowMs, ttlMs) {
    const expired = [];
    try {
      const files = await readdir(this.root);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const full = join(this.root, file);
        try {
          const text = await readFile(full, "utf8");
          const rec = normalize(JSON.parse(text));
          const last = Date.parse(rec.lastAccessAt);
          if (!Number.isFinite(last) || (Number.isFinite(ttlMs) && ttlMs > 0 && nowMs - last > ttlMs)) {
            expired.push(rec.sessionId);
          }
        } catch {
          // corrupt records are considered expired for cleanup
          const sessionId = file.replace(/\.json$/, "");
          if (SESSION_ID.test(sessionId)) expired.push(sessionId);
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return expired;
  }

  #path(sessionId) { return join(this.root, `${sessionId}.json`); }
}

function normalize(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  if (value.schemaVersion !== VERSION) throw invalid();
  if (typeof value.sessionId !== "string" || !SESSION_ID.test(value.sessionId)) throw invalid();
  if (typeof value.ownerTokenHash !== "string" || !/^[a-f0-9]{64}$/.test(value.ownerTokenHash)) throw invalid();
  if (typeof value.createdAt !== "string" || typeof value.lastAccessAt !== "string") throw invalid();
  return Object.freeze({ schemaVersion: VERSION, sessionId: value.sessionId, ownerTokenHash: value.ownerTokenHash, createdAt: value.createdAt, lastAccessAt: value.lastAccessAt });
}
function invalid() { return Object.assign(new Error("Ownership record is invalid"), { code: "AGENT_OWNERSHIP_CORRUPT" }); }
function assertSessionId(sessionId) { if (!SESSION_ID.test(sessionId)) throw Object.assign(new Error("Ownership sessionId is invalid"), { code: "AGENT_OWNERSHIP_CORRUPT" }); }
