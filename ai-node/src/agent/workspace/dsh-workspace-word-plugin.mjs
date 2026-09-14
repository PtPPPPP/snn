import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DEFAULT_DOCUMENT_LIMITS } from "../documents/limits.mjs";
import { WordprocessingService } from "../wordprocessing/wordprocessing-service.mjs";
import { FileIngestionService } from "./file-ingestion-service.mjs";
import { WorkspaceManager } from "./workspace-manager.mjs";

const anchor = process.env.SNN_DSH_PLUGIN_RESOLVE_FROM;
if (!anchor) throw new Error("SNN_DSH_PLUGIN_RESOLVE_FROM is required for SNN word bridge");
const requireFromDsh = createRequire(anchor);
const { defineTool } = await import(pathToFileURL(requireFromDsh.resolve("@deepseek-ai/dsh-tools")).href);

export const name = "snn-workspace-word";
export const inject = ["tools"];

/** Registers only the bounded DOCX operations owned by SNN Workspace. */
export function apply(ctx, config = {}) {
  const root = config.workspaceRoot;
  if (typeof root !== "string" || root.length === 0) throw new Error("SNN workspace root is required");
  const manager = new WorkspaceManager();
  const workspacePromise = manager.register(root);
  const files = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: DEFAULT_DOCUMENT_LIMITS.maxDocumentBytes });
  const word = new WordprocessingService({ fileIngestionService: files });
  const workspaceId = async () => (await workspacePromise).id;

  ctx.tools.register(defineTool({
    name: "workspace.word.inspect",
    description: "Inspect one uploaded DOCX (Word) document by server-assigned file_id. Return the file version, paragraph and text-fragment counts, a bounded text preview, and optionally how many times an exact string occurs within single text fragments. Use this before any Word mutation to obtain the version. It never modifies the document.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned DOCX file id from the current Workspace." },
      find: { type: "string", description: "Exact text to locate. Counts only occurrences that fall entirely within one text fragment." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const find = typeof args?.find === "string" && args.find.length > 0 ? args.find : undefined;
        return JSON.stringify(await word.inspect({ workspaceId: await workspaceId(), fileId: typeof args?.file_id === "string" ? args.file_id : "", find }));
      } catch (error) { throw stableWordError(error); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.word.patch",
    description: "Replace exact text in an uploaded DOCX (Word) document while preserving all formatting, after workspace.word.inspect returned the version. The search text must fall entirely within a single text fragment; if it spans multiple styled fragments this tool changes nothing and reports AGENT_WORD_MATCH_NOT_FOUND, so retry with a shorter string. By default exactly one occurrence must match; set replace_all to replace every occurrence. Never guess a version.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned DOCX file id from the current Workspace." },
      expected_version: { type: "string", required: true, description: "Exact version returned by workspace.word.inspect." },
      find: { type: "string", required: true, description: "Exact text to replace, contained within one text fragment." },
      replace: { type: "string", required: true, description: "Replacement text. May be empty to delete the matched text." },
      replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring exactly one. Defaults to false." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        return JSON.stringify(await word.replaceText({
          workspaceId: await workspaceId(),
          fileId: typeof args?.file_id === "string" ? args.file_id : "",
          expectedVersion: typeof args?.expected_version === "string" ? args.expected_version : "",
          find: typeof args?.find === "string" ? args.find : "",
          replace: typeof args?.replace === "string" ? args.replace : "",
          replaceAll: args?.replace_all === true,
        }));
      } catch (error) { throw stableWordError(error); }
    },
  }));
}

function stableWordError(error) {
  return new Error(typeof error?.code === "string" && error.code.startsWith("AGENT_WORD_") ? error.code : "AGENT_WORD_INVALID_DOCUMENT");
}
