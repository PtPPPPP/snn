import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";

/** Server-owned ceiling for UTF-8 text reads; shared with the attachment open path. */
export const MAX_WORKSPACE_TEXT_BYTES = 256 * 1024;
const MAX_DIRECTORY_ENTRIES = 512;

/** Server-owned workspace identities and canonical read-only filesystem boundary. */
export class WorkspaceManager {
  #workspaces = new Map();

  async register(root, { id = `snn-workspace-${randomUUID()}` } = {}) {
    const canonicalRoot = await realpath(root);
    const rootStat = await stat(canonicalRoot);
    if (!rootStat.isDirectory()) throw new TypeError("Workspace root must be a directory");
    if (typeof id !== "string" || !/^snn-workspace-[a-z0-9-]{3,80}$/.test(id)) throw new TypeError("Workspace id is invalid");
    if (this.#workspaces.has(id)) throw new Error("Workspace id already exists");
    const workspace = Object.freeze({ id, root: canonicalRoot });
    this.#workspaces.set(workspace.id, workspace);
    return workspace;
  }

  get(id) { return this.#workspaces.get(id); }
  resolve(id) {
    const workspace = this.get(id);
    if (!workspace) throw Object.assign(new Error("Unknown workspace"), { code: "SNN_WORKSPACE_NOT_FOUND" });
    return workspace;
  }

  async resolvePath(workspaceId, requestedPath) {
    const workspace = this.resolve(workspaceId);
    if (typeof requestedPath !== "string" || requestedPath.length === 0) throw invalidPath();
    if (requestedPath.startsWith(".snn-")) throw invalidPath();
    if (isAbsolute(requestedPath) || win32.isAbsolute(requestedPath) || /^[a-z]:/i.test(requestedPath) || requestedPath.startsWith("\\\\")) throw invalidPath();
    const candidate = resolve(workspace.root, requestedPath);
    if (!contains(workspace.root, candidate)) throw invalidPath();
    const canonical = await realpath(candidate);
    if (!contains(workspace.root, canonical)) throw invalidPath();
    return canonical;
  }

  async readText(workspaceId, requestedPath) {
    const path = await this.resolvePath(workspaceId, requestedPath);
    const entry = await lstat(path);
    if (!entry.isFile()) throw Object.assign(new Error("Workspace path is not a file"), { code: "SNN_WORKSPACE_NOT_FILE" });
    if (entry.size > MAX_WORKSPACE_TEXT_BYTES) throw Object.assign(new Error("Workspace file exceeds read limit"), { code: "SNN_WORKSPACE_FILE_TOO_LARGE" });
    const bytes = await readFile(path);
    if (bytes.includes(0)) throw Object.assign(new Error("Workspace file is binary"), { code: "SNN_WORKSPACE_BINARY_FILE" });
    return bytes.toString("utf8");
  }

  async list(workspaceId, requestedPath = ".") {
    const path = await this.resolvePath(workspaceId, requestedPath);
    const entries = await readdir(path, { withFileTypes: true });
    if (entries.length > MAX_DIRECTORY_ENTRIES) throw Object.assign(new Error("Workspace directory exceeds list limit"), { code: "SNN_WORKSPACE_DIRECTORY_TOO_LARGE" });
    return Object.freeze(entries.map((entry) => Object.freeze({ name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" })));
  }
}

function contains(root, path) {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}
function invalidPath() { return Object.assign(new Error("Workspace path is outside the allowed boundary"), { code: "SNN_WORKSPACE_PATH_DENIED" }); }
