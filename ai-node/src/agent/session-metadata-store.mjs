import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = 1;
const SESSION_ID = /^snn-agent-[a-z0-9-]{8,80}$/;

/** Minimal server-owned binding store; persisted references are never authorization authority. */
export class SessionMetadataStore {
  constructor(root) {
    if (typeof root !== "string" || root.length === 0) throw new TypeError("metadata root is required");
    this.root = root;
  }

  async create(sessionId, binding) {
    assertSessionId(sessionId);
    const metadata = normalize(binding);
    await mkdir(this.root, { recursive: true });
    const target = this.#path(sessionId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(metadata), { encoding: "utf8", flag: "wx" });
      await link(temporary, target);
      await rm(temporary, { force: true });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      if (error?.code === "EEXIST") throw Object.assign(new Error("Session metadata already exists"), { code: "AGENT_SESSION_METADATA_EXISTS" });
      throw error;
    }
    return metadata;
  }

  async get(sessionId) {
    assertSessionId(sessionId);
    let text;
    try { text = await readFile(this.#path(sessionId), "utf8"); }
    catch (error) {
      if (error?.code === "ENOENT") throw Object.assign(new Error("Session capability metadata is missing"), { code: "AGENT_SESSION_METADATA_NOT_FOUND" });
      throw error;
    }
    try { return normalize(JSON.parse(text)); }
    catch (error) {
      if (error?.code?.startsWith("AGENT_")) throw error;
      throw Object.assign(new Error("Session capability metadata is invalid"), { code: "AGENT_SESSION_METADATA_INVALID" });
    }
  }

  async delete(sessionId) { assertSessionId(sessionId); await rm(this.#path(sessionId), { force: true }); }
  #path(sessionId) { return join(this.root, `${sessionId}.json`); }
}

function normalize(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  if (value.schemaVersion !== VERSION || typeof value.workspaceId !== "string" || typeof value.skillId !== "string") throw invalid();
  return Object.freeze({ schemaVersion: VERSION, workspaceId: value.workspaceId, skillId: value.skillId });
}
function invalid() { return Object.assign(new Error("Session capability metadata is invalid"), { code: "AGENT_SESSION_METADATA_INVALID" }); }
function assertSessionId(sessionId) { if (!SESSION_ID.test(sessionId)) throw invalid(); }
