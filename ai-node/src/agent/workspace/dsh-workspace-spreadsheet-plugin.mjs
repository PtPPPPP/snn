import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DEFAULT_DOCUMENT_LIMITS } from "../documents/limits.mjs";
import { SpreadsheetService } from "../spreadsheets/spreadsheet-service.mjs";
import { FileIngestionService } from "./file-ingestion-service.mjs";
import { WorkspaceManager } from "./workspace-manager.mjs";

const anchor = process.env.SNN_DSH_PLUGIN_RESOLVE_FROM;
if (!anchor) throw new Error("SNN_DSH_PLUGIN_RESOLVE_FROM is required for SNN spreadsheet bridge");
const requireFromDsh = createRequire(anchor);
const { defineTool } = await import(pathToFileURL(requireFromDsh.resolve("@deepseek-ai/dsh-tools")).href);

export const name = "snn-workspace-spreadsheet";
export const inject = ["tools"];

/** Registers only the bounded XLSX operations owned by SNN Workspace. */
export function apply(ctx, config = {}) {
  const root = config.workspaceRoot;
  if (typeof root !== "string" || root.length === 0) throw new Error("SNN workspace root is required");
  const manager = new WorkspaceManager();
  const workspacePromise = manager.register(root);
  const files = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: DEFAULT_DOCUMENT_LIMITS.maxDocumentBytes });
  const spreadsheets = new SpreadsheetService({ fileIngestionService: files });
  const workspaceId = async () => (await workspacePromise).id;

  ctx.tools.register(defineTool({
    name: "workspace.spreadsheet.inspect",
    description: "Inspect one uploaded XLSX workbook by server-assigned file_id. Return sheet names, headers, used range, row count, and optionally exact matches for a column/value. Use this before any spreadsheet mutation. It never modifies the workbook.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned XLSX file id from the current Workspace." },
      sheet: { type: "string", description: "Exact worksheet name. Omit only when the workbook has exactly one worksheet." },
      column: { type: "string", description: "Exact header name to match. Provide together with equals." },
      equals: { type: "string", description: "Exact cell value to match under column. Provide together with column." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const hasColumn = typeof args?.column === "string";
        const hasEquals = typeof args?.equals === "string";
        if (hasColumn !== hasEquals) throw Object.assign(new Error("invalid"), { code: "AGENT_SPREADSHEET_INVALID_REQUEST" });
        return JSON.stringify(await spreadsheets.inspect({ workspaceId: await workspaceId(), fileId: typeof args?.file_id === "string" ? args.file_id : "", sheet: args?.sheet, find: hasColumn ? { column: args.column, equals: args.equals } : undefined }));
      } catch (error) { throw stableSpreadsheetError(error); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.spreadsheet.patch",
    description: "Delete exactly one data row from an uploaded XLSX workbook after workspace.spreadsheet.inspect found one exact match. Use only with the returned file version, exact worksheet name, exact header, and exact cell value. Never guess a row number. If zero or multiple rows match, this tool changes nothing.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned XLSX file id from the current Workspace." },
      expected_version: { type: "string", required: true, description: "Exact version returned by workspace.spreadsheet.inspect." },
      sheet: { type: "string", required: true, description: "Exact worksheet name returned by inspect." },
      column: { type: "string", required: true, description: "Exact header name used by inspect." },
      equals: { type: "string", required: true, description: "Exact cell value that must match exactly one data row." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        return JSON.stringify(await spreadsheets.deleteRows({ workspaceId: await workspaceId(), fileId: typeof args?.file_id === "string" ? args.file_id : "", expectedVersion: typeof args?.expected_version === "string" ? args.expected_version : "", sheet: args?.sheet, match: { column: args?.column, equals: args?.equals } }));
      } catch (error) { throw stableSpreadsheetError(error); }
    },
  }));
}

function stableSpreadsheetError(error) {
  return new Error(typeof error?.code === "string" && error.code.startsWith("AGENT_SPREADSHEET_") ? error.code : "AGENT_SPREADSHEET_INVALID_WORKBOOK");
}
