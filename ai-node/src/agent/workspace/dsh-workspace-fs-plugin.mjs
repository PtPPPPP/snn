import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { FileIngestionService } from "./file-ingestion-service.mjs";
import { WorkspaceManager } from "./workspace-manager.mjs";

const anchor = process.env.SNN_DSH_PLUGIN_RESOLVE_FROM;
if (!anchor) throw new Error("SNN_DSH_PLUGIN_RESOLVE_FROM is required for SNN workspace filesystem bridge");
const requireFromDsh = createRequire(anchor);
const fsModule = await import(pathToFileURL(requireFromDsh.resolve("@deepseek-ai/dsh-fs")).href);
const { FileSystem, FsError, FsTargetKey, FsVersion } = fsModule;

export const name = "snn-workspace-fs";

export function apply(ctx, config = {}) {
  if (typeof config.workspaceRoot !== "string" || config.workspaceRoot.length === 0) throw new Error("SNN workspace root is required");
  class SnnWorkspaceFileSystem extends FileSystem {
    constructor() {
      super(ctx);
      this.manager = new WorkspaceManager();
      this.workspacePromise = this.manager.register(config.workspaceRoot);
      this.files = new FileIngestionService({ workspaceManager: this.manager, maxUploadBytes: config.maxEditableBytes ?? 1_048_576 });
    }
    async workspace() { return this.workspacePromise; }
    async resolve(path, options = {}) {
      this.aborted(options.signal);
      const virtualPath = this.path(path);
      return { targetKey: FsTargetKey(`snn:${virtualPath}`), displayPath: virtualPath };
    }
    processPath() { throw new FsError("SNN virtual filesystem has no host path", "FS_PERMISSION_DENIED"); }
    fileUrl() { throw new FsError("SNN virtual filesystem has no host URL", "FS_PERMISSION_DENIED"); }
    contains(parent, child) { return child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`); }
    async lstat(path, options = {}, signal) { const target = await this.resolve(path, { ...options, signal }); return this.info(target, signal); }
    async stat(target, signal) { return this.info(target, signal); }
    async info(target, signal) {
      this.aborted(signal);
      const workspace = await this.workspace();
      const { file } = await this.files.resolveVirtualPath({ workspaceId: workspace.id, virtualPath: target.displayPath });
      return file ? { version: FsVersion(file.sha256), type: "file", size: file.size } : undefined;
    }
    async readText(target, signal) { this.aborted(signal); const workspace = await this.workspace(); try { return (await this.files.readEditableText({ workspaceId: workspace.id, virtualPath: target.displayPath })).content; } catch (error) { throw this.error(error); } }
    async streamText(target, signal) { return [await this.readText(target, signal)]; }
    async readBytes(target, signal, maxBytes) { const text = await this.readText(target, signal); const bytes = Buffer.from(text, "utf8"); if (bytes.length > maxBytes) throw new FsError("File exceeds read limit", "FS_TOO_LARGE"); return bytes; }
    async listDir() { return []; }
    async writeText(target, content, expected, signal) { this.aborted(signal); const workspace = await this.workspace(); try { const result = await this.files.writeEditableText({ workspaceId: workspace.id, virtualPath: target.displayPath, content, expected }); return { operation: result.operation, version: FsVersion(result.version), before: result.before, after: result.after }; } catch (error) { throw this.error(error); } }
    async editText(target, edit, expected, signal) {
      const before = await this.readText(target, signal);
      const matches = [...before.matchAll(new RegExp(escapeRegExp(edit.oldString), "g"))];
      if (matches.length === 0) throw new FsError("Edit text was not found", "FS_EDIT_NOT_FOUND");
      if (!edit.replaceAll && matches.length !== 1) throw new FsError("Edit text is ambiguous", "FS_AMBIGUOUS_EDIT");
      const after = edit.replaceAll ? before.split(edit.oldString).join(edit.newString) : before.replace(edit.oldString, edit.newString);
      const written = await this.writeText(target, after, expected ? { kind: "replaceIfVersion", version: expected.version } : undefined, signal);
      return { version: written.version, before, after };
    }
    path(value) { if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.startsWith("/") || /^[a-z]:/i.test(value) || value.startsWith("//") || value.split("/").some((part) => part === "" || part === "." || part === "..") || /[\0-\x1f]/.test(value)) throw new FsError("Workspace path is invalid", "FS_SANDBOX_DENIED"); return value.normalize("NFC"); }
    aborted(signal) { if (signal?.aborted) throw new FsError("Filesystem operation aborted", "FS_ABORTED"); }
    error(error) { const code = error?.code; if (code === "AGENT_FILE_NOT_FOUND") return new FsError("File was not found", "FS_NOT_FOUND"); if (code === "AGENT_FILE_NOT_EDITABLE") return new FsError("File is not editable", "FS_NOT_TEXT"); if (code === "AGENT_FILE_TOO_LARGE") return new FsError("File exceeds editable size limit", "FS_TOO_LARGE"); if (code === "AGENT_FILE_EXISTS") return new FsError("File was not observed before overwrite", "FS_NOT_OBSERVED"); if (code === "AGENT_FILE_STALE") return new FsError("File changed since it was read", "FS_STALE_VERSION"); return new FsError("Workspace filesystem operation failed", "FS_IO_ERROR"); }
  }
  new SnnWorkspaceFileSystem();
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
