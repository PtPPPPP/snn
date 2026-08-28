import { createHash } from "node:crypto";
import { loadWorkbook, workbookToBytes } from "@office-kit/xlsx/io";
import { fromBuffer } from "@office-kit/xlsx/node";
import { cellValueAsString } from "@office-kit/xlsx/cell";
import { BoundedZipArchive } from "../documents/bounded-zip.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../documents/limits.mjs";

const MAX_MATCHES_IN_RESULT = 20;
const MAX_CELL_TEXT = 512;
const CFB_ENCRYPTED_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Server-owned XLSX read and mutation service. It only accepts a Workspace
 * file id and delegates bytes persistence to FileIngestionService, keeping
 * host paths and generic binary writes outside the Agent tool surface.
 */
export class SpreadsheetService {
  constructor({ fileIngestionService }) {
    if (!fileIngestionService || typeof fileIngestionService.readFile !== "function" || typeof fileIngestionService.replaceFileBytes !== "function") {
      throw new TypeError("fileIngestionService with managed byte operations is required");
    }
    this.files = fileIngestionService;
  }

  async inspect({ workspaceId, fileId, sheet, find } = {}) {
    const managed = await this.files.readFile({ workspaceId, fileId });
    const { workbook, worksheet } = await this.#openWorkbook(managed.file, managed.bytes, sheet);
    const summary = describeWorksheet(worksheet);
    const requestedFind = normalizeFind(find);
    const matches = requestedFind ? findRows(summary, requestedFind) : [];
    return Object.freeze({
      fileId: managed.file.fileId,
      version: digest(managed.bytes),
      workbook: managed.file.originalName,
      sheet: worksheet.title,
      availableSheets: workbook.sheets.filter((entry) => entry.kind === "worksheet").map((entry) => entry.sheet.title),
      headers: summary.headers.map((header) => header.value),
      usedRange: summary.usedRange,
      rowCount: summary.rowCount,
      nonEmptyCellCount: summary.nonEmptyCellCount,
      matchCount: matches.length,
      matches: matches.slice(0, MAX_MATCHES_IN_RESULT).map((match) => ({ row: match.row, values: match.values })),
      truncated: matches.length > MAX_MATCHES_IN_RESULT,
    });
  }

  async deleteRows({ workspaceId, fileId, expectedVersion, sheet, match, requireMatchCount = 1 } = {}) {
    if (requireMatchCount !== 1) throw spreadsheetError("AGENT_SPREADSHEET_INVALID_REQUEST");
    const requestedFind = normalizeFind(match);
    if (!requestedFind) throw spreadsheetError("AGENT_SPREADSHEET_INVALID_REQUEST");

    const managed = await this.files.readFile({ workspaceId, fileId });
    const actualVersion = digest(managed.bytes);
    if (expectedVersion !== actualVersion) throw spreadsheetError("AGENT_SPREADSHEET_STALE_VERSION");
    const { workbook, worksheet } = await this.#openWorkbook(managed.file, managed.bytes, sheet);
    const summary = describeWorksheet(worksheet);
    const matches = findRows(summary, requestedFind);
    if (matches.length === 0) throw spreadsheetError("AGENT_SPREADSHEET_MATCH_NOT_FOUND");
    if (matches.length !== 1) throw spreadsheetError("AGENT_SPREADSHEET_AMBIGUOUS_MATCH");

    const targetRow = matches[0].row;
    if (targetRow === summary.headerRow) throw spreadsheetError("AGENT_SPREADSHEET_INVALID_REQUEST");
    assertSupportedRowDeletion(worksheet, targetRow);
    deleteWorksheetRow(worksheet, targetRow);

    const nextBytes = Buffer.from(await workbookToBytes(workbook));
    const reloaded = await this.#openWorkbook(managed.file, nextBytes, worksheet.title);
    const verified = describeWorksheet(reloaded.worksheet);
    const remaining = findRows(verified, requestedFind);
    if (remaining.length !== 0 || verified.rowCount !== summary.rowCount - 1) throw spreadsheetError("AGENT_SPREADSHEET_VERIFICATION_FAILED");

    const replaced = await this.files.replaceFileBytes({ workspaceId, fileId, expectedVersion, bytes: nextBytes });
    return Object.freeze({
      modified: true,
      operation: "deleteRows",
      sheet: worksheet.title,
      rowsAffected: 1,
      fileId: replaced.file.fileId,
      previousVersion: replaced.previousVersion,
      newVersion: replaced.version,
      downloadAvailable: true,
    });
  }

  async #openWorkbook(file, bytes, requestedSheet) {
    assertXlsxFile(file, bytes);
    let workbook;
    try { workbook = await loadWorkbook(fromBuffer(Buffer.from(bytes))); }
    catch { throw spreadsheetError("AGENT_SPREADSHEET_INVALID_WORKBOOK"); }
    const worksheets = workbook.sheets.filter((entry) => entry.kind === "worksheet");
    const sheetName = normalizeSheetName(requestedSheet);
    const selected = sheetName
      ? worksheets.find((entry) => entry.sheet.title === sheetName)
      : worksheets.length === 1 ? worksheets[0] : undefined;
    if (!selected) throw spreadsheetError(sheetName ? "AGENT_SPREADSHEET_SHEET_NOT_FOUND" : "AGENT_SPREADSHEET_SHEET_REQUIRED");
    return { workbook, worksheet: selected.sheet };
  }
}

function assertXlsxFile(file, bytes) {
  if (!/\.xlsx$/i.test(file?.originalName ?? "")) throw spreadsheetError("AGENT_SPREADSHEET_UNSUPPORTED");
  if (Buffer.from(bytes).subarray(0, CFB_ENCRYPTED_MAGIC.length).equals(CFB_ENCRYPTED_MAGIC)) throw spreadsheetError("AGENT_SPREADSHEET_ENCRYPTED");
  let archive;
  try { archive = BoundedZipArchive.open(Buffer.from(bytes), DEFAULT_DOCUMENT_LIMITS); }
  catch { throw spreadsheetError("AGENT_SPREADSHEET_INVALID_WORKBOOK"); }
  if (archive.names().some((name) => /(?:^|\/)vbaProject\./i.test(name) || name.startsWith("xl/externalLinks/"))) {
    throw spreadsheetError("AGENT_SPREADSHEET_UNSUPPORTED");
  }
}

function describeWorksheet(worksheet) {
  const rowNumbers = [...worksheet.rows.keys()].sort((a, b) => a - b);
  const populated = rowNumbers.map((row) => ({ row, cells: worksheet.rows.get(row) })).filter((entry) => entry.cells && entry.cells.size > 0);
  const header = populated[0];
  if (!header) throw spreadsheetError("AGENT_SPREADSHEET_NO_DATA");
  const headers = [...header.cells.entries()]
    .map(([column, cell]) => ({ column, value: boundedCellText(cell.value) }))
    .filter((entry) => entry.value.length > 0)
    .sort((a, b) => a.column - b.column);
  if (headers.length === 0) throw spreadsheetError("AGENT_SPREADSHEET_NO_DATA");
  const maxColumn = Math.max(...populated.flatMap((entry) => [...entry.cells.keys()]));
  const maxRow = Math.max(...rowNumbers);
  return {
    headerRow: header.row,
    headers,
    rows: populated,
    rowCount: populated.length,
    nonEmptyCellCount: populated.reduce((count, entry) => count + [...entry.cells.values()].filter((cell) => boundedCellText(cell.value).length > 0).length, 0),
    usedRange: `A1:${columnName(maxColumn)}${maxRow}`,
  };
}

function normalizeFind(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw spreadsheetError("AGENT_SPREADSHEET_INVALID_REQUEST");
  const column = boundedInput(value.column, 200);
  const equals = boundedInput(value.equals, 500);
  if (!column || !equals) throw spreadsheetError("AGENT_SPREADSHEET_INVALID_REQUEST");
  return { column, equals };
}

function normalizeSheetName(value) {
  if (value === undefined || value === null || value === "") return "";
  return boundedInput(value, 200) ?? "";
}

function boundedInput(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value.normalize("NFC") : null;
}

function findRows(summary, find) {
  const header = summary.headers.find((entry) => entry.value === find.column);
  if (!header) throw spreadsheetError("AGENT_SPREADSHEET_COLUMN_NOT_FOUND");
  return summary.rows
    .filter((entry) => entry.row !== summary.headerRow)
    .filter((entry) => boundedCellText(entry.cells.get(header.column)?.value) === find.equals)
    .map((entry) => ({
      row: entry.row,
      values: Object.fromEntries(summary.headers.map(({ column, value }) => [value, boundedCellText(entry.cells.get(column)?.value)])),
    }));
}

function assertSupportedRowDeletion(worksheet, row) {
  if (worksheet.mergedCells.some((range) => range.minRow <= row && range.maxRow >= row)) throw spreadsheetError("AGENT_SPREADSHEET_UNSUPPORTED_LAYOUT");
  if (worksheet.tables.some((table) => rangeContainsRow(table.ref, row))) throw spreadsheetError("AGENT_SPREADSHEET_UNSUPPORTED_LAYOUT");
}

function deleteWorksheetRow(worksheet, row) {
  worksheet.rows.delete(row);
  const following = [...worksheet.rows.entries()].filter(([current]) => current > row).sort(([left], [right]) => left - right);
  for (const [current, cells] of following) {
    worksheet.rows.delete(current);
    worksheet.rows.set(current - 1, new Map([...cells.entries()].map(([column, cell]) => [column, { ...cell, row: current - 1 }])));
  }
  const dimensions = [...worksheet.rowDimensions.entries()].filter(([current]) => current >= row).sort(([left], [right]) => left - right);
  worksheet.rowDimensions.delete(row);
  for (const [current, dimension] of dimensions) {
    worksheet.rowDimensions.delete(current);
    if (current > row) worksheet.rowDimensions.set(current - 1, { ...dimension, row: current - 1 });
  }
  worksheet._appendRowCursor = Math.max(0, ...worksheet.rows.keys());
}

function rangeContainsRow(range, row) {
  const matches = /^\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)$/i.exec(range ?? "");
  return matches ? row >= Number(matches[1]) && row <= Number(matches[2]) : true;
}

function boundedCellText(value) {
  const text = cellValueAsString(value ?? null);
  return text.length > MAX_CELL_TEXT ? text.slice(0, MAX_CELL_TEXT) : text;
}

function columnName(column) {
  let value = column;
  let out = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function spreadsheetError(code) {
  return Object.assign(new Error(code), { code });
}
