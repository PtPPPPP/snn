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
    description: "Inspect an uploaded DOCX by file_id. Returns version, a bounded preview and paginated paragraphs with paragraph indexes. Read all pages with offset/nextOffset before polishing a long document; never treat a truncated preview as the full document. Exact find counts matches across styled runs within each paragraph. Does not modify the document.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned DOCX file id from the current Workspace." },
      find: { type: "string", description: "Exact text to locate within one paragraph; it may span styled runs." },
      offset: { type: "number", description: "Zero-based text-paragraph offset, default 0. Use nextOffset from the preceding page." },
      limit: { type: "number", description: "Paragraphs per page, 1 to 20, default 10. Output is also bounded by text length." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const find = typeof args?.find === "string" && args.find.length > 0 ? args.find : undefined;
        return JSON.stringify(await word.inspect({ workspaceId: await workspaceId(), fileId: typeof args?.file_id === "string" ? args.file_id : "", find, offset: args?.offset, limit: args?.limit }));
      } catch (error) { throw stableWordError(error); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.word.patch",
    description: "Replace exact text within one DOCX paragraph, including text split across styled runs. Use the version from inspect or the last successful patch. Optional paragraph scopes repeated text to one inspected paragraph. Default requires one match; replace_all replaces all scoped matches. Keep paragraph, table and run properties; unchanged prefix/suffix retain their styles, changed text inherits its insertion run style. For polishing, prefer small phrase edits to retain mixed emphasis. No new paragraphs, layout editing, legacy DOC, headers or footers. Never guess a version; re-inspect to verify.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned DOCX file id from the current Workspace." },
      expected_version: { type: "string", required: true, description: "Exact version returned by workspace.word.inspect." },
      find: { type: "string", required: true, description: "Exact text to replace within one paragraph, up to 16000 characters. It may span styled runs." },
      replace: { type: "string", required: true, description: "Replacement text. May be empty to delete the matched text." },
      replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring exactly one. Defaults to false." },
      paragraph: { type: "number", description: "Optional zero-based paragraph index returned by inspect, to disambiguate repeated text." },
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
          replaceAll: args?.replace_all ?? false,
          paragraph: args?.paragraph,
        }));
      } catch (error) { throw stableWordError(error); }
    },
  }));
}

function stableWordError(error) {
  return new Error(typeof error?.code === "string" && error.code.startsWith("AGENT_WORD_") ? error.code : "AGENT_WORD_INVALID_DOCUMENT");
}
