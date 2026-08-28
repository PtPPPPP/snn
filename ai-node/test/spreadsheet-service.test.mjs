import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkbook, workbookToBytes } from "@office-kit/xlsx/io";
import { fromBuffer } from "@office-kit/xlsx/node";
import { createWorkbook, addWorksheet } from "@office-kit/xlsx/workbook";
import { setCell } from "@office-kit/xlsx/worksheet";
import { addCellXf } from "@office-kit/xlsx/styles";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";
import { SpreadsheetService } from "../src/agent/spreadsheets/spreadsheet-service.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { buildTestXlsx } from "./helpers/document-fixtures.mjs";

async function workbookBytes({ duplicateTarget = false } = {}) {
  const workbook = createWorkbook();
  const people = addWorksheet(workbook, "人员信息");
  const headerStyle = addCellXf(workbook.styles, { fontId: 0, fillId: 1, borderId: 0, numFmtId: 0, applyFill: true });
  setCell(people, 1, 1, "姓名", headerStyle);
  setCell(people, 1, 2, "性别", headerStyle);
  setCell(people, 1, 3, "备注", headerStyle);
  setCell(people, 2, 1, "测试用户甲");
  setCell(people, 2, 2, "男");
  setCell(people, 2, 3, "保留");
  setCell(people, 3, 1, "目标用户827");
  setCell(people, 3, 2, "女");
  setCell(people, 3, 3, "删除");
  setCell(people, 4, 1, "测试用户乙");
  setCell(people, 4, 2, "男");
  setCell(people, 4, 3, { kind: "formula", formula: "1+1", t: "normal", cachedValue: 2 });
  if (duplicateTarget) {
    setCell(people, 5, 1, "目标用户827");
    setCell(people, 5, 2, "女");
    setCell(people, 5, 3, "重复");
  }
  const notes = addWorksheet(workbook, "说明");
  setCell(notes, 1, 1, "这个工作表必须保留");
  return Buffer.from(await workbookToBytes(workbook));
}

async function createEnvironment(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "snn-spreadsheet-service-"));
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root, { id: "snn-workspace-spreadsheet" });
  const files = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 50 * 1024 * 1024 });
  const spreadsheets = new SpreadsheetService({ fileIngestionService: files });
  const upload = await files.ingest({
    workspaceId: workspace.id,
    originalName: "人员信息.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: (async function* () { yield options.bytes ?? await workbookBytes(options); })(),
  });
  return { root, workspace, files, spreadsheets, upload };
}

test("spreadsheet inspect returns bounded workbook facts and exact matches", async (t) => {
  const env = await createEnvironment();
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const inspected = await env.spreadsheets.inspect({
    workspaceId: env.workspace.id,
    fileId: env.upload.fileId,
    sheet: "人员信息",
    find: { column: "姓名", equals: "目标用户827" },
  });
  assert.equal(inspected.workbook, "人员信息.xlsx");
  assert.deepEqual(inspected.availableSheets, ["人员信息", "说明"]);
  assert.deepEqual(inspected.headers, ["姓名", "性别", "备注"]);
  assert.equal(inspected.rowCount, 4);
  assert.equal(inspected.matchCount, 1);
  assert.deepEqual(inspected.matches[0], { row: 3, values: { 姓名: "目标用户827", 性别: "女", 备注: "删除" } });
  assert.match(inspected.version, /^[a-f0-9]{64}$/);
});

test("spreadsheet patch removes one exact row, retains fileId, and downloads a valid workbook", async (t) => {
  const env = await createEnvironment();
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const before = await env.spreadsheets.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, sheet: "人员信息", find: { column: "姓名", equals: "目标用户827" } });
  const result = await env.spreadsheets.deleteRows({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, sheet: "人员信息", match: { column: "姓名", equals: "目标用户827" } });
  assert.equal(result.modified, true);
  assert.equal(result.rowsAffected, 1);
  assert.equal(result.fileId, env.upload.fileId);
  assert.notEqual(result.previousVersion, result.newVersion);

  const after = await env.spreadsheets.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, sheet: "人员信息", find: { column: "姓名", equals: "目标用户827" } });
  assert.equal(after.matchCount, 0);
  assert.equal(after.rowCount, 3);
  const downloaded = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  const workbook = await loadWorkbook(fromBuffer(downloaded.bytes));
  const people = workbook.sheets.find((entry) => entry.kind === "worksheet" && entry.sheet.title === "人员信息")?.sheet;
  const notes = workbook.sheets.find((entry) => entry.kind === "worksheet" && entry.sheet.title === "说明")?.sheet;
  assert.ok(people);
  assert.ok(notes);
  assert.equal(people.rows.get(2)?.get(1)?.value, "测试用户甲");
  assert.equal(people.rows.get(3)?.get(1)?.value, "测试用户乙");
  assert.equal(people.rows.get(3)?.get(3)?.value?.kind, "formula");
  assert.ok(workbook.styles.cellXfs.length > 0);
  assert.equal(people.rows.get(1)?.get(1)?.styleId, 0);
  assert.equal(notes.rows.get(1)?.get(1)?.value, "这个工作表必须保留");
});

test("spreadsheet patch fails closed for missing, duplicate, stale, and foreign matches", async (t) => {
  const env = await createEnvironment();
  const foreignRoot = await mkdtemp(join(tmpdir(), "snn-spreadsheet-foreign-"));
  t.after(async () => { await rm(env.root, { recursive: true, force: true }); await rm(foreignRoot, { recursive: true, force: true }); });
  const before = await env.spreadsheets.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, sheet: "人员信息", find: { column: "姓名", equals: "目标用户827" } });
  await assert.rejects(
    env.spreadsheets.deleteRows({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, sheet: "人员信息", match: { column: "姓名", equals: "不存在" } }),
    (error) => error.code === "AGENT_SPREADSHEET_MATCH_NOT_FOUND",
  );
  await assert.rejects(
    env.spreadsheets.deleteRows({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: "0".repeat(64), sheet: "人员信息", match: { column: "姓名", equals: "目标用户827" } }),
    (error) => error.code === "AGENT_SPREADSHEET_STALE_VERSION",
  );
  const foreignManager = new WorkspaceManager();
  const foreign = await foreignManager.register(foreignRoot, { id: "snn-workspace-foreign" });
  const foreignFiles = new FileIngestionService({ workspaceManager: foreignManager, maxUploadBytes: 50 * 1024 * 1024 });
  const foreignSpreadsheets = new SpreadsheetService({ fileIngestionService: foreignFiles });
  await assert.rejects(
    foreignSpreadsheets.inspect({ workspaceId: foreign.id, fileId: env.upload.fileId, sheet: "人员信息" }),
    (error) => error.code === "AGENT_FILE_NOT_FOUND",
  );
});

test("spreadsheet patch leaves duplicate matches and original bytes untouched", async (t) => {
  const env = await createEnvironment({ duplicateTarget: true });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const before = await env.spreadsheets.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, sheet: "人员信息", find: { column: "姓名", equals: "目标用户827" } });
  assert.equal(before.matchCount, 2);
  const original = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  await assert.rejects(
    env.spreadsheets.deleteRows({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, sheet: "人员信息", match: { column: "姓名", equals: "目标用户827" } }),
    (error) => error.code === "AGENT_SPREADSHEET_AMBIGUOUS_MATCH",
  );
  const after = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  assert.deepEqual(after.bytes, original.bytes);
});

test("spreadsheet inspection rejects macro containers before workbook loading", async (t) => {
  const env = await createEnvironment({ bytes: buildTestXlsx({ macro: true, sheets: [{ name: "人员信息", cells: [{ ref: "A1", kind: "s", value: "姓名" }] }] }) });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  await assert.rejects(
    env.spreadsheets.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, sheet: "人员信息" }),
    (error) => error.code === "AGENT_SPREADSHEET_UNSUPPORTED",
  );
});
