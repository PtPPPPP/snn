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
    description: "Inspect an uploaded XLSX workbook. Omit sheet to discover worksheet names; then select a sheet. Returns version, headers, row facts and cell addresses/values/formulas in range (default A1:L20, at most 400 positions). Request successive ranges to read a whole column. Optional column/equals finds exact rows. Never modifies the workbook.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned XLSX file id from the current Workspace." },
      sheet: { type: "string", description: "Exact worksheet name. Omit to discover names in a multi-sheet workbook, or to read the only worksheet." },
      column: { type: "string", description: "Exact header name to match. Provide together with equals." },
      equals: { type: "string", description: "Exact cell value to match under column. Provide together with column." },
      range: { type: "string", description: "Cell range to inspect, e.g. B1:B100 or A1:D20. At most 400 positions; use successive ranges for larger columns." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const hasColumn = typeof args?.column === "string";
        const hasEquals = typeof args?.equals === "string";
        if (hasColumn !== hasEquals) throw Object.assign(new Error("invalid"), { code: "AGENT_SPREADSHEET_INVALID_REQUEST" });
        return JSON.stringify(await spreadsheets.inspect({ workspaceId: await workspaceId(), fileId: typeof args?.file_id === "string" ? args.file_id : "", sheet: args?.sheet, range: args?.range, find: hasColumn ? { column: args.column, equals: args.equals } : undefined }));
      } catch (error) { throw stableSpreadsheetError(error); }
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.spreadsheet.patch",
    description: "Modify an uploaded XLSX after inspect, using its exact version and sheet. operation updateCells changes up to 100 existing value cells using edits_json; it preserves formula cells, styles and other workbook parts. Formula cells cannot be overwritten. Values are literal strings/numbers/booleans/null, never executable formulas. Excel must recalculate formulas when opening the result. operation deleteRows (legacy default) deletes one exact column/equals match. Re-inspect to verify; use the returned new version for subsequent batches.",
    parameters: {
      file_id: { type: "string", required: true, description: "Server-assigned XLSX file id from the current Workspace." },
      expected_version: { type: "string", required: true, description: "Exact version returned by workspace.spreadsheet.inspect." },
      sheet: { type: "string", required: true, description: "Exact worksheet name returned by inspect." },
      operation: { type: "string", description: "updateCells to edit values, or deleteRows to remove an exact row. Defaults to deleteRows for compatibility." },
      edits_json: { type: "string", description: 'For updateCells: JSON array, e.g. [{"cell":"B2","value":42},{"cell":"B3","value":"已完成"}]. Max 100 existing cells per batch. Do not include formula cells.' },
      column: { type: "string", description: "For deleteRows: exact header name used by inspect." },
      equals: { type: "string", description: "For deleteRows: exact cell value matching exactly one data row." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        if (args?.operation === "updateCells") {
          if (typeof args.edits_json !== "string" || args.edits_json.length > 1_100_000) throw Object.assign(new Error("invalid"), { code: "AGENT_SPREADSHEET_INVALID_REQUEST" });
          let edits;
          try { edits = JSON.parse(args.edits_json); } catch { throw Object.assign(new Error("invalid"), { code: "AGENT_SPREADSHEET_INVALID_REQUEST" }); }
          return JSON.stringify(await spreadsheets.updateCells({ workspaceId: await workspaceId(), fileId: args.file_id, expectedVersion: args.expected_version, sheet: args.sheet, edits }));
        }
        if (args?.operation !== undefined && args.operation !== "deleteRows") throw Object.assign(new Error("invalid"), { code: "AGENT_SPREADSHEET_INVALID_REQUEST" });
        return JSON.stringify(await spreadsheets.deleteRows({ workspaceId: await workspaceId(), fileId: typeof args?.file_id === "string" ? args.file_id : "", expectedVersion: typeof args?.expected_version === "string" ? args.expected_version : "", sheet: args?.sheet, match: { column: args?.column, equals: args?.equals } }));
      } catch (error) { throw stableSpreadsheetError(error); }
    },
  }));
}

function stableSpreadsheetError(error) {
  return new Error(typeof error?.code === "string" && error.code.startsWith("AGENT_SPREADSHEET_") ? error.code : "AGENT_SPREADSHEET_INVALID_WORKBOOK");
}
