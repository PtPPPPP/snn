import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";
import { WordprocessingService } from "../src/agent/wordprocessing/wordprocessing-service.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { BoundedZipArchive } from "../src/agent/documents/bounded-zip.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../src/agent/documents/limits.mjs";
import { buildTestDocx, docxDocumentXml } from "./helpers/document-fixtures.mjs";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// A styled run (bold + size), an untouched paragraph, and a table, so the test
// can prove `<w:rPr>`, `xml:space="preserve"`, and table structure all survive a
// text-only replacement that targets one fragment.
const STYLED_XML = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"><w:body>`
  + `<w:p><w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t xml:space="preserve">重要目标827</w:t></w:r></w:p>`
  + `<w:p><w:r><w:t>普通段落保持不变</w:t></w:r></w:p>`
  + `<w:tbl><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">表格单元格甲</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>表格单元格乙</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
  + `</w:body></w:document>`;

async function createEnvironment(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "snn-word-service-"));
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root, { id: "snn-workspace-word" });
  const files = new FileIngestionService({ workspaceManager: manager, maxUploadBytes: 50 * 1024 * 1024 });
  const word = new WordprocessingService({ fileIngestionService: files });
  const bytes = options.bytes ?? buildTestDocx(docxDocumentXml(options.blocks ?? [{ text: "合同编号：目标文字827" }, { text: "甲方名称保持不变" }]));
  const upload = await files.ingest({
    workspaceId: workspace.id,
    originalName: options.originalName ?? "合同.docx",
    contentType: DOCX_TYPE,
    body: (async function* () { yield bytes; })(),
  });
  return { root, workspace, files, word, upload };
}

function documentXmlOf(bytes) {
  return BoundedZipArchive.open(bytes, DEFAULT_DOCUMENT_LIMITS).readEntry("word/document.xml").toString("utf8");
}

test("word inspect returns version, counts, and exact fragment matches", async (t) => {
  const env = await createEnvironment();
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const inspected = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "目标文字827" });
  assert.equal(inspected.document, "合同.docx");
  assert.match(inspected.version, /^[a-f0-9]{64}$/);
  assert.equal(inspected.paragraphCount, 2);
  assert.equal(inspected.fragmentCount, 2);
  assert.equal(inspected.matchCount, 1);
  assert.equal(inspected.matches.length, 1);
  assert.equal(inspected.matches[0].occurrences, 1);
  assert.ok(inspected.textPreview.includes("甲方名称保持不变"));
  // inspect never mutates
  const again = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  assert.equal(again.version, inspected.version);
  assert.equal(again.matchCount, 0);
});

test("word patch replaces one fragment, preserves styling, retains fileId, and repackages a readable docx", async (t) => {
  const env = await createEnvironment({ bytes: buildTestDocx(STYLED_XML) });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const before = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "重要目标827" });
  assert.equal(before.matchCount, 1);
  const result = await env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "重要目标827", replace: "已替换标记" });
  assert.equal(result.modified, true);
  assert.equal(result.operation, "replaceText");
  assert.equal(result.matchesReplaced, 1);
  assert.equal(result.fileId, env.upload.fileId);
  assert.notEqual(result.previousVersion, result.newVersion);
  assert.equal(result.downloadAvailable, true);

  const after = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "重要目标827" });
  assert.equal(after.matchCount, 0);
  const confirm = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "已替换标记" });
  assert.equal(confirm.matchCount, 1);

  const downloaded = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  const xml = documentXmlOf(downloaded.bytes);
  assert.ok(xml.includes("<w:rPr><w:b/><w:sz w:val=\"48\"/></w:rPr>"), "run properties must survive");
  assert.ok(xml.includes("xml:space=\"preserve\""), "xml:space must survive");
  assert.ok(xml.includes("已替换标记"));
  assert.ok(xml.includes("普通段落保持不变"));
  assert.ok(xml.includes("<w:tbl>") && xml.includes("<w:tc>"), "table structure must survive");
  assert.ok(xml.includes("表格单元格甲") && xml.includes("表格单元格乙"), "table cell text must survive");
  assert.ok(!xml.includes("重要目标827"));
  assert.equal(downloaded.file.originalName, "合同.docx");
  assert.equal(downloaded.file.virtualPath, "合同.docx");
});

test("word patch replaces text split across runs within one paragraph, preserving structure", async (t) => {
  // Visual text "Project status: draft" split by Word across three styled runs.
  const splitXml = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"><w:body>`
    + `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Project</w:t></w:r><w:r><w:t xml:space="preserve"> status:</w:t></w:r><w:r><w:t xml:space="preserve"> draft</w:t></w:r></w:p>`
    + `<w:p><w:r><w:t>无关段落保持不变</w:t></w:r></w:p>`
    + `</w:body></w:document>`;
  const env = await createEnvironment({ bytes: buildTestDocx(splitXml) });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  // inspect rebuilds paragraph text, so the cross-run phrase is found at paragraph level
  const before = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "Project status: draft" });
  assert.equal(before.matchCount, 1);
  assert.equal(before.matches[0].paragraph, 0);
  const result = await env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "Project status: draft", replace: "Project status: approved" });
  assert.equal(result.modified, true);
  assert.equal(result.matchesReplaced, 1);
  assert.notEqual(result.previousVersion, result.newVersion);

  const after = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "Project status: approved" });
  assert.equal(after.matchCount, 1);
  const gone = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "draft" });
  assert.equal(gone.matchCount, 0);

  const downloaded = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  const xml = documentXmlOf(downloaded.bytes);
  // the FIRST matched run keeps its own <w:rPr> and absorbs the whole replacement
  assert.ok(xml.includes("<w:rPr><w:b/></w:rPr><w:t>Project status: approved</w:t>"), "first matched run must keep <w:rPr> and absorb the replacement");
  assert.ok(!xml.includes("draft"), "old cross-run text must be fully cleared");
  assert.ok(xml.includes("无关段落保持不变"), "unrelated paragraph must survive untouched");
  // all four runs survive (matched chars cleared from the tail runs; runs are never deleted)
  assert.equal((xml.match(/<w:t[\s>]/g) ?? []).length, 4, "every run must survive, only matched characters are cleared");
});

test("word patch refuses text spanning more than one paragraph and leaves bytes untouched", async (t) => {
  const twoParagraphXml = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"><w:body>`
    + `<w:p><w:r><w:t>第一段结尾</w:t></w:r></w:p>`
    + `<w:p><w:r><w:t>第二段开头</w:t></w:r></w:p>`
    + `</w:body></w:document>`;
  const env = await createEnvironment({ bytes: buildTestDocx(twoParagraphXml) });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const before = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "第一段结尾第二段开头" });
  assert.equal(before.matchCount, 0);
  const original = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  await assert.rejects(
    env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "第一段结尾第二段开头", replace: "x" }),
    (error) => error.code === "AGENT_WORD_MATCH_NOT_FOUND",
  );
  // a string fully inside one paragraph still matches
  const within = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "第一段结尾" });
  assert.equal(within.matchCount, 1);
  const after = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  assert.deepEqual(after.bytes, original.bytes);
});

test("word patch replaces cross-run text inside a table cell and leaves other cells untouched", async (t) => {
  // "状态：草稿" is split across two runs INSIDE the first table cell's paragraph;
  // each `<w:tc><w:p>` is its own paragraph, so cells never bleed into one another.
  const tableXml = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"><w:body>`
    + `<w:p><w:r><w:t>表格外段落</w:t></w:r></w:p>`
    + `<w:tbl><w:tr>`
    + `<w:tc><w:p><w:r><w:t>状态：</w:t></w:r><w:r><w:t>草稿</w:t></w:r></w:p></w:tc>`
    + `<w:tc><w:p><w:r><w:t>其它单元格</w:t></w:r></w:p></w:tc>`
    + `</w:tr></w:tbl>`
    + `</w:body></w:document>`;
  const env = await createEnvironment({ bytes: buildTestDocx(tableXml) });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const before = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "状态：草稿" });
  assert.equal(before.matchCount, 1);
  const result = await env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "状态：草稿", replace: "状态：已批准" });
  assert.equal(result.matchesReplaced, 1);
  const after = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "状态：已批准" });
  assert.equal(after.matchCount, 1);
  const downloaded = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  const xml = documentXmlOf(downloaded.bytes);
  assert.ok(xml.includes("状态：已批准"), "table cell text must be replaced");
  assert.ok(!xml.includes("草稿"), "old cell text must be gone");
  assert.ok(xml.includes("其它单元格"), "sibling cell must be untouched");
  assert.ok(xml.includes("表格外段落"), "paragraph outside the table must be untouched");
  assert.ok(xml.includes("<w:tbl>") && xml.includes("<w:tc>"), "table structure must survive");
});

test("word patch fails closed for missing, stale, no-op, and foreign targets", async (t) => {
  const env = await createEnvironment();
  const foreignRoot = await mkdtemp(join(tmpdir(), "snn-word-foreign-"));
  t.after(async () => { await rm(env.root, { recursive: true, force: true }); await rm(foreignRoot, { recursive: true, force: true }); });
  const before = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "目标文字827" });
  await assert.rejects(
    env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "不存在的文字", replace: "x" }),
    (error) => error.code === "AGENT_WORD_MATCH_NOT_FOUND",
  );
  await assert.rejects(
    env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: "0".repeat(64), find: "目标文字827", replace: "x" }),
    (error) => error.code === "AGENT_WORD_STALE_VERSION",
  );
  await assert.rejects(
    env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "目标文字827", replace: "目标文字827" }),
    (error) => error.code === "AGENT_WORD_INVALID_REQUEST",
  );
  const foreignManager = new WorkspaceManager();
  const foreign = await foreignManager.register(foreignRoot, { id: "snn-workspace-foreign" });
  const foreignFiles = new FileIngestionService({ workspaceManager: foreignManager, maxUploadBytes: 50 * 1024 * 1024 });
  const foreignWord = new WordprocessingService({ fileIngestionService: foreignFiles });
  await assert.rejects(
    foreignWord.inspect({ workspaceId: foreign.id, fileId: env.upload.fileId }),
    (error) => error.code === "AGENT_FILE_NOT_FOUND",
  );
});

test("word patch rejects ambiguous matches and replaces all when asked", async (t) => {
  const env = await createEnvironment({ bytes: buildTestDocx(docxDocumentXml([{ text: "甲方：重复标记" }, { text: "乙方：重复标记" }])) });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const before = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "重复标记" });
  assert.equal(before.matchCount, 2);
  const original = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  await assert.rejects(
    env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "重复标记", replace: "已改" }),
    (error) => error.code === "AGENT_WORD_AMBIGUOUS_MATCH",
  );
  const untouched = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  assert.deepEqual(untouched.bytes, original.bytes);
  const result = await env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "重复标记", replace: "已改", replaceAll: true });
  assert.equal(result.matchesReplaced, 2);
  const after = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "重复标记" });
  assert.equal(after.matchCount, 0);
  const confirm = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "已改" });
  assert.equal(confirm.matchCount, 2);
});

test("word patch round-trips XML entities through decode and re-encode", async (t) => {
  const entityXml = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"><w:body>`
    + `<w:p><w:r><w:t xml:space="preserve">A &amp; B &lt; C</w:t></w:r></w:p>`
    + `</w:body></w:document>`;
  const env = await createEnvironment({ bytes: buildTestDocx(entityXml) });
  t.after(() => rm(env.root, { recursive: true, force: true }));
  const before = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "A & B < C" });
  assert.equal(before.matchCount, 1);
  const result = await env.word.replaceText({ workspaceId: env.workspace.id, fileId: env.upload.fileId, expectedVersion: before.version, find: "A & B < C", replace: "X & Y > Z" });
  assert.equal(result.matchesReplaced, 1);
  const downloaded = await env.files.readFile({ workspaceId: env.workspace.id, fileId: env.upload.fileId });
  const xml = documentXmlOf(downloaded.bytes);
  assert.ok(xml.includes("X &amp; Y &gt; Z"), `replacement must be re-encoded: ${xml}`);
  assert.ok(!xml.includes("X & Y > Z"), "raw ampersand/angle must not leak into XML");
  const after = await env.word.inspect({ workspaceId: env.workspace.id, fileId: env.upload.fileId, find: "X & Y > Z" });
  assert.equal(after.matchCount, 1);
});

test("word inspect rejects macro containers and non-docx files", async (t) => {
  const macro = await createEnvironment({ bytes: buildTestDocx(docxDocumentXml([{ text: "x" }]), { extraEntries: [{ name: "word/vbaProject.bin", data: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]) }] }) });
  t.after(() => rm(macro.root, { recursive: true, force: true }));
  await assert.rejects(
    macro.word.inspect({ workspaceId: macro.workspace.id, fileId: macro.upload.fileId }),
    (error) => error.code === "AGENT_WORD_UNSUPPORTED",
  );
  const notDocx = await createEnvironment({ originalName: "notes.txt", bytes: Buffer.from("hello world", "utf8") });
  t.after(() => rm(notDocx.root, { recursive: true, force: true }));
  await assert.rejects(
    notDocx.word.inspect({ workspaceId: notDocx.workspace.id, fileId: notDocx.upload.fileId }),
    (error) => error.code === "AGENT_WORD_UNSUPPORTED",
  );
});
