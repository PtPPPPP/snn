import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { WorkspaceManager } from "./workspace-manager.mjs";
import { WorkspaceFileOpener } from "./workspace-file-opener.mjs";
import { DocumentExtractionService } from "../documents/document-extraction-service.mjs";
import { clampDocumentLimits } from "../documents/limits.mjs";

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
}
