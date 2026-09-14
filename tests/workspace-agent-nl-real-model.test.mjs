import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkbook } from "@office-kit/xlsx/io";
import { fromBuffer } from "@office-kit/xlsx/node";
import { createWorkbook, addWorksheet } from "@office-kit/xlsx/workbook";
import { setCell } from "@office-kit/xlsx/worksheet";
import { buildTestDocx, buildTestPdf } from "../ai-node/test/helpers/document-fixtures.mjs";
import { BoundedZipArchive } from "../ai-node/src/agent/documents/bounded-zip.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../ai-node/src/agent/documents/limits.mjs";
import { extractBlocks } from "../ai-node/src/agent/documents/parsers/docx-parser.mjs";

// Section 36-42: NATURAL-LANGUAGE real-model acceptance. Unlike the guided
// cases in workspace-edit-real-model.test.mjs (which name exact tools), every
// prompt here only states the user's goal. The real Qwen model must itself
// discover -> inspect -> choose a safe tool -> mutate -> verify. Completion is
// judged on authoritative downloaded bytes, never on the model claiming success
// (Section 23/45). Gated on a real deployment; skipped without the env.
const apiBaseUrl = process.env.SNN_REAL_MODEL_AGENT_BASE_URL?.replace(/\/+$/, "");
const browserOrigin = process.env.SNN_REAL_MODEL_ORIGIN?.replace(/\/+$/, "");
const configured = Boolean(apiBaseUrl && browserOrigin);
const SKIP = configured ? false : "set SNN_REAL_MODEL_AGENT_BASE_URL and SNN_REAL_MODEL_ORIGIN (AI11 real Qwen)";
const TERMINALS = new Set(["run.completed", "run.failed", "run.cancelled", "run.incomplete"]);
const PDF_TITLE = "SNN_PDF_TITLE_916";
const PDF_PAD_CHARS = 17_500_000; // > 16 MiB raw, < 50 MiB upload cap

class CookieJar {
  #cookies = new Map();

  absorb(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie") ? [headers.get("set-cookie")] : [];
    for (const value of values) {
      const first = value?.split(";", 1)[0];
      const index = first?.indexOf("=") ?? -1;
      if (index > 0) this.#cookies.set(first.slice(0, index), first.slice(index + 1));
    }
  }

  header() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function parseSseBlock(block) {
  let event = "message";
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const key = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (key === "event") event = value;
    if (key === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  try { return { event, payload: JSON.parse(dataLines.join("\n")) }; } catch { return null; }
}

function buildSpreadsheetFixture() {
  const workbook = createWorkbook();
  const people = addWorksheet(workbook, "人员信息");
  for (const [row, values] of [[1, ["姓名", "性别", "民族", "生日"]], [2, ["测试用户甲", "男", "汉族", "2000-01-01"]], [3, ["目标用户827", "女", "满族", "2001-02-03"]], [4, ["测试用户乙", "男", "回族", "2002-04-05"]]]) {
    values.forEach((value, index) => setCell(people, row, index + 1, value));
  }
  const notes = addWorksheet(workbook, "说明");
  setCell(notes, 1, 1, "SNN_REAL_MODEL_XLSX_SECOND_SHEET");
  return workbookToBytes(workbook);
}

// "Project status: draft" with "draft" split across two runs (`dra` + `ft`), so
// a single-fragment replace cannot match it: only cross-run replacement (s14)
// can. Faithfully exercises Section 39 through the real model.
function buildCrossRunDocx() {
  const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:r><w:t xml:space="preserve">Project</w:t></w:r>'
    + '<w:r><w:t xml:space="preserve"> status:</w:t></w:r>'
    + '<w:r><w:t xml:space="preserve"> dra</w:t></w:r>'
    + '<w:r><w:t xml:space="preserve">ft</w:t></w:r></w:p>'
    + "</w:body></w:document>";
  return buildTestDocx(xml);
}

function buildLargePdf() {
  return buildTestPdf({ pages: [[PDF_TITLE], ["A".repeat(PDF_PAD_CHARS)]] });
}

/**
 * Open a disposable session, run one natural-language turn, and tear it down.
 * Returns the collected stream so each case asserts on authoritative evidence.
 */
async function withSession(body) {
  const cookies = new CookieJar();
  let sessionId = null;

  async function request(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", browserOrigin);
    const cookie = cookies.header();
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(150_000) });
    cookies.absorb(response.headers);
    return response;
  }

  async function upload(name, bytes, type) {
    const form = new FormData();
    form.set("file", new Blob([bytes], { type }), name);
    const response = await request(`/sessions/${encodeURIComponent(sessionId)}/files`, { method: "POST", body: form });
    assert.equal(response.status, 201, `upload of ${name} must succeed`);
    return (await response.json()).file;
  }

  async function streamRun(message, attachments) {
    const response = await request(`/sessions/${encodeURIComponent(sessionId)}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, attachments }),
    });
    assert.equal(response.status, 200, "run must be admitted");
    assert.ok(response.body);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolEvents = [];
    const messageText = [];
    let terminal = null;
    let terminalPayload = null;
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const boundary = buffer.search(/\r?\n\r?\n/);
        if (boundary < 0) break;
        const rest = buffer.slice(boundary);
        let separatorLength = 0;
        for (let step = 0; step < 2; step += 1) {
          if (rest.charCodeAt(separatorLength) === 13) separatorLength += 1;
          separatorLength += 1;
        }
        const separator = rest.slice(0, separatorLength);
        const parsed = parseSseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + separator.length);
        if (!parsed) continue;
        const name = parsed.payload?.payload?.name;
        if (typeof name === "string" && parsed.event.startsWith("tool.")) toolEvents.push(`${parsed.event}:${name}`);
        const delta = parsed.payload?.payload?.text ?? parsed.payload?.text;
        if (typeof delta === "string" && parsed.event.startsWith("message.")) messageText.push(delta);
        if (TERMINALS.has(parsed.event)) { terminal = parsed.event; terminalPayload = parsed.payload; }
      }
    }
    reader.releaseLock();
    return { terminal, terminalPayload, toolEvents, text: messageText.join(""), raw: JSON.stringify(terminalPayload ?? {}) };
  }

  async function downloadBytes(fileId) {
    const response = await request(`/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`, { method: "GET" });
    assert.equal(response.status, 200, "download must succeed");
    return Buffer.from(await response.arrayBuffer());
  }

  try {
    const created = await request("/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(created.status, 201);
    sessionId = (await created.json()).sessionId;
    assert.match(sessionId, /^snn-agent-/);
    await body({ upload, streamRun, downloadBytes, sessionId, t: request });
  } finally {
    if (sessionId) {
      const deleted = await request(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null);
      assert.equal(deleted?.status, 200, "temporary real-model session must be deleted");
    }
  }
}

test("NL Case A (text): model edits an uploaded .md from a goal-only prompt", { skip: SKIP, timeout: 200_000 }, async (t) => {
  await withSession(async ({ upload, streamRun, downloadBytes }) => {
    const file = await upload("notes.md", Buffer.from("Project Alpha is old.\n", "utf8"), "text/markdown");
    const run = await streamRun("把 notes.md 里的项目状态改成 active。直接修改文件，改好后告诉我。", [file.fileId]);
    assert.equal(run.terminal, "run.completed", `expected a normal finish; got ${run.terminal} ${run.raw}`);
    const after = (await downloadBytes(file.fileId)).toString("utf8");
    assert.match(after, /active/, `downloaded file must reflect the change; got: ${after}`);
    assert.doesNotMatch(after, /old/, "the stale status must be gone");
    t.diagnostic(`NL_TEXT_TOOLS=${run.toolEvents.join(",")}`);
  });
});

test("NL Case B (css): model classifies, reads and edits a .css from a goal-only prompt", { skip: SKIP, timeout: 200_000 }, async (t) => {
  await withSession(async ({ upload, streamRun, downloadBytes }) => {
    const file = await upload("theme.css", Buffer.from(".card {\n  border-radius: 8px;\n}\n", "utf8"), "text/css");
    const run = await streamRun("把卡片圆角改成 16px，直接修改文件。", [file.fileId]);
    assert.equal(run.terminal, "run.completed", `expected a normal finish; got ${run.terminal} ${run.raw}`);
    const after = (await downloadBytes(file.fileId)).toString("utf8");
    assert.match(after, /16px/, `css must be edited to 16px; got: ${after}`);
    assert.doesNotMatch(after, /8px/, "the old radius must be gone");
    t.diagnostic(`NL_CSS_TOOLS=${run.toolEvents.join(",")}`);
  });
});

test("NL Case C (docx): model replaces cross-run Word text and the file stays valid", { skip: SKIP, timeout: 200_000 }, async (t) => {
  await withSession(async ({ upload, streamRun, downloadBytes }) => {
    const docx = buildCrossRunDocx();
    const file = await upload("项目状态.docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const run = await streamRun("把文档里的项目状态从 draft 改成 approved，直接修改 Word 文件。", [file.fileId]);
    assert.equal(run.terminal, "run.completed", `expected a normal finish; got ${run.terminal} ${run.raw}`);
    const after = await downloadBytes(file.fileId);
    // Authoritative integrity: the container still opens, the XML still parses,
    // the target changed, and the phrase is now "approved" (Section 17/39).
    const archive = BoundedZipArchive.open(after, DEFAULT_DOCUMENT_LIMITS);
    const xml = archive.readEntry("word/document.xml").toString("utf8");
    assert.doesNotMatch(xml, /draft/, "draft must be replaced");
    assert.match(xml, /approved/, "approved must be present");
    const text = extractBlocks(xml, DEFAULT_DOCUMENT_LIMITS).blocks.map((block) => block.text ?? "").join("\n");
    assert.match(text, /Project status:\s*approved/, `visible text must read approved; got: ${text}`);
    t.diagnostic(`NL_DOCX_TOOLS=${run.toolEvents.join(",")}`);
  });
});

test("NL Case D (xlsx): model deletes one exact row and preserves the other sheet", { skip: SKIP, timeout: 200_000 }, async (t) => {
  await withSession(async ({ upload, streamRun, downloadBytes }) => {
    const xlsx = Buffer.from(await buildSpreadsheetFixture());
    const file = await upload("人员信息.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const run = await streamRun("删除用户名等于“目标用户827”的整行，不要修改其它工作表。", [file.fileId]);
    assert.equal(run.terminal, "run.completed", `expected a normal finish; got ${run.terminal} ${run.raw}`);
    const after = await downloadBytes(file.fileId);
    const workbook = await loadWorkbook(fromBuffer(after));
    const people = workbook.sheets.find((entry) => entry.kind === "worksheet" && entry.sheet.title === "人员信息")?.sheet;
    const notes = workbook.sheets.find((entry) => entry.kind === "worksheet" && entry.sheet.title === "说明")?.sheet;
    const names = [...(people?.rows.values() ?? [])].map((row) => row.get(1)?.value).filter(Boolean);
    assert.ok(!names.includes("目标用户827"), `target row must be deleted; got ${names.join(",")}`);
    assert.ok(names.includes("测试用户甲") && names.includes("测试用户乙"), "other rows must survive");
    assert.equal(notes?.rows.get(1)?.get(1)?.value, "SNN_REAL_MODEL_XLSX_SECOND_SHEET", "the other sheet must be untouched");
    t.diagnostic(`NL_XLSX_TOOLS=${run.toolEvents.join(",")}`);
  });
});

test("NL Case E (pdf >16MiB): upload+attach succeed and the model reads the first-page title", { skip: SKIP, timeout: 220_000 }, async (t) => {
  await withSession(async ({ upload, streamRun }) => {
    const pdf = buildLargePdf();
    assert.ok(pdf.length > 16 * 1024 * 1024, `fixture must exceed 16 MiB; got ${pdf.length}`);
    assert.ok(pdf.length < 50 * 1024 * 1024, `fixture must stay under the upload cap; got ${pdf.length}`);
    const file = await upload("big-report.pdf", pdf, "application/pdf");
    assert.equal(file.size, pdf.length, "stored size must match the uploaded bytes");
    const run = await streamRun("阅读这个 PDF，告诉我第一页标题。", [file.fileId]);
    // Section 9/41 regression: a >16 MiB file must never be mysteriously
    // rejected at the attachment layer. It reaches a clean terminal.
    assert.doesNotMatch(run.raw, /ATTACHMENT_LIMIT_EXCEEDED/, "attachment must not reject a >16MiB file");
    assert.ok(run.terminal === "run.completed" || run.terminal === "run.incomplete", `expected a clean terminal; got ${run.terminal} ${run.raw}`);
    const answered = run.text.includes(PDF_TITLE) || run.toolEvents.some((event) => event.includes("workspace.extract") || event.includes(":read"));
    assert.ok(answered, `model must read/extract the PDF and surface the title; text=${run.text.slice(0, 200)} tools=${run.toolEvents.join(",")}`);
    t.diagnostic(`NL_PDF_TOOLS=${run.toolEvents.join(",")} TEXT_HEAD=${run.text.slice(0, 120)}`);
  });
});

test("NL Case F (max-tokens): an over-long generation ends as run.incomplete, never run.completed", { skip: SKIP, timeout: 220_000 }, async (t) => {
  await withSession(async ({ streamRun }) => {
    const run = await streamRun("请从整数 1 开始逐个往上数，每个整数单独占一行，一直数下去，不要停止、不要总结、不要省略，直到系统强制截断你为止。", []);
    // Section 20-24/42: hitting the output ceiling is truncation, not success.
    assert.equal(run.terminal, "run.incomplete", `output-limit truncation must be run.incomplete; got ${run.terminal} ${run.raw}`);
    assert.notEqual(run.terminal, "run.completed", "max-tokens must never be reported as completed");
    assert.match(run.raw, /max_tokens/, `incomplete reason must be max_tokens; got ${run.raw}`);
    t.diagnostic(`NL_MAXTOKENS_TERMINAL=${run.terminal}`);
  });
});
