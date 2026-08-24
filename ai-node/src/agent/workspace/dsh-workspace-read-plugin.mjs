import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { WorkspaceManager } from "./workspace-manager.mjs";
import { WorkspaceFileOpener } from "./workspace-file-opener.mjs";
import { DocumentExtractionService } from "../documents/document-extraction-service.mjs";
import { clampDocumentLimits } from "../documents/limits.mjs";

const execAsync = promisify(execCb);
const MAX_WRITE_BYTES = 256 * 1024;
const MAX_EXECUTE_MS = 30_000;
const MAX_EXECUTE_BUFFER = 256 * 1024;
const MAX_FETCH_BYTES = 200_000;
const FETCH_TIMEOUT_MS = 15_000;

const anchor = process.env.SNN_DSH_PLUGIN_RESOLVE_FROM;
if (!anchor) throw new Error("SNN_DSH_PLUGIN_RESOLVE_FROM is required for SNN workspace read bridge");
const requireFromDsh = createRequire(anchor);
const { defineTool } = await import(pathToFileURL(requireFromDsh.resolve("@deepseek-ai/dsh-tools")).href);

export const name = "snn-workspace-read";
export const inject = ["tools"];

export function apply(ctx, config = {}) {
  const root = config.workspaceRoot;
  if (typeof root !== "string" || root.length === 0) throw new Error("SNN workspace root is required");
  const manager = new WorkspaceManager();
  const workspacePromise = manager.register(root);
  const documents = new DocumentExtractionService({
    workspaceRoot: root,
    limits: clampDocumentLimits(config.documentLimits),
  });
  const opener = new WorkspaceFileOpener({ root, documents });

  ctx.tools.register(defineTool({
    name: "workspace.read",
    description: "Read a UTF-8 text file inside the assigned SNN workspace.",
    parameters: { file_path: { type: "string", required: true, description: "Relative path inside the assigned workspace." } },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try { return await manager.readText((await workspacePromise).id, args.file_path); }
      catch { throw new Error("SNN_WORKSPACE_READ_DENIED"); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.extract",
    description: "Extract bounded text from an uploaded PDF, DOCX, or XLSX document stored in the assigned SNN workspace.",
    parameters: { file_id: { type: "string", required: true, description: "Server-assigned file id of the uploaded document." } },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try { return await documents.extract(typeof args?.file_id === "string" ? args.file_id : ""); }
      catch (error) { throw new Error(typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_") ? error.code : "AGENT_DOCUMENT_INVALID"); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.open",
    description: "Open an attached or uploaded workspace file by its server-assigned file id.",
    parameters: { file_id: { type: "string", required: true, description: "Server-assigned file id of the attached or uploaded file." } },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try { return await opener.open(typeof args?.file_id === "string" ? args.file_id : ""); }
      catch (error) { throw new Error(typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_") ? error.code : "AGENT_DOCUMENT_INVALID"); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.write",
    description: "Write or overwrite a text file inside the assigned SNN workspace. The path must be relative and stay inside the workspace boundary.",
    parameters: {
      file_path: { type: "string", required: true, description: "Relative path inside the assigned workspace." },
      content: { type: "string", required: true, description: "UTF-8 text content to write." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const ws = await workspacePromise;
        const path = await manager.resolvePath(ws.id, args.file_path);
        const content = typeof args.content === "string" ? args.content : "";
        if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) throw new Error("CONTENT_TOO_LARGE");
        await mkdir(path.split(/[\\/]/).slice(0, -1).join("/") || ".", { recursive: true }).catch(() => {});
        await writeFile(path, content, "utf8");
        return `Wrote ${content.length} chars to ${args.file_path}`;
      } catch { throw new Error("SNN_WORKSPACE_WRITE_FAILED"); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.execute",
    description: "Execute a shell command in the assigned SNN workspace directory. Bounded to 30 seconds. Use for build, test, git, and development tasks.",
    parameters: { command: { type: "string", required: true, description: "Shell command to execute." } },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const ws = await workspacePromise;
        const cmd = typeof args.command === "string" ? args.command : "";
        if (!cmd.trim()) throw new Error("EMPTY_COMMAND");
        const { stdout, stderr } = await execAsync(cmd, {
          cwd: ws.root,
          timeout: MAX_EXECUTE_MS,
          maxBuffer: MAX_EXECUTE_BUFFER,
        });
        const out = (stdout || "") + (stderr ? `\n[stderr]\n${stderr}` : "");
        return out.trim() || "(no output)";
      } catch (e) {
        const msg = e.killed ? "Command timed out after 30s" : (e.stderr || e.message || "Execute failed");
        throw new Error(`EXECUTE_ERROR: ${msg}`);
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.fetch",
    description: "Fetch content from a URL. Returns up to 200KB of text. Use for reading documentation, APIs, or web pages.",
    parameters: {
      url: { type: "string", required: true, description: "HTTP(S) URL to fetch." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const url = typeof args.url === "string" ? args.url : "";
        if (!/^https?:\/\//i.test(url)) throw new Error("INVALID_URL");
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        const text = await res.text();
        return text.slice(0, MAX_FETCH_BYTES);
      } catch (e) {
        throw new Error(`FETCH_ERROR: ${e?.message || "Fetch failed"}`);
      }
    },
  }));
}
