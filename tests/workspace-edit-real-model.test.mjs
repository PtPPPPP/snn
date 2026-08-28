import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadWorkbook, workbookToBytes } from "@office-kit/xlsx/io";
import { fromBuffer } from "@office-kit/xlsx/node";
import { createWorkbook, addWorksheet } from "@office-kit/xlsx/workbook";
import { setCell } from "@office-kit/xlsx/worksheet";

const apiBaseUrl = process.env.SNN_REAL_MODEL_AGENT_BASE_URL?.replace(/\/+$/, "");
const browserOrigin = process.env.SNN_REAL_MODEL_ORIGIN?.replace(/\/+$/, "");
const configured = Boolean(apiBaseUrl && browserOrigin);

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

async function buildSpreadsheetFixture() {
  const workbook = createWorkbook();
  const people = addWorksheet(workbook, "人员信息");
  for (const [row, values] of [[1, ["姓名", "性别", "民族", "生日"]], [2, ["测试用户甲", "男", "汉族", "2000-01-01"]], [3, ["目标用户827", "女", "满族", "2001-02-03"]], [4, ["测试用户乙", "男", "回族", "2002-04-05"]]]) {
    values.forEach((value, index) => setCell(people, row, index + 1, value));
  }
  const notes = addWorksheet(workbook, "说明");
  setCell(notes, 1, 1, "SNN_REAL_MODEL_XLSX_SECOND_SHEET");
  return Buffer.from(await workbookToBytes(workbook));
}

test("real model edits a disposable uploaded text file through DSH tools", { skip: configured ? false : "set SNN_REAL_MODEL_AGENT_BASE_URL and SNN_REAL_MODEL_ORIGIN", timeout: 180_000 }, async (t) => {
  const cookies = new CookieJar();
  let sessionId = null;

  async function request(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", browserOrigin);
    const cookie = cookies.header();
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(120_000) });
    cookies.absorb(response.headers);
    return response;
  }

  try {
    const sessionResponse = await request("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const session = await sessionResponse.json();
    assert.equal(sessionResponse.status, 201);
    assert.match(session.sessionId, /^snn-agent-/);
    sessionId = session.sessionId;

    const form = new FormData();
    form.set("file", new Blob(["Hello world."], { type: "text/markdown" }), "snn-edit-real-model.md");
    const uploadResponse = await request(`/sessions/${encodeURIComponent(sessionId)}/files`, { method: "POST", body: form });
    const upload = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201);
    assert.match(upload.file.fileId, /^snn-file-/);

    const runResponse = await request(`/sessions/${encodeURIComponent(sessionId)}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "First use workspace.open with the attachment file_id. Then call the native tool named exactly read, not workspace.read, with virtual path snn-edit-real-model.md. Next call the native tool named exactly edit on that same path. Replace the only Hello world with Hello SNN. Do not merely describe the change: modify the file before answering.",
        attachments: [upload.file.fileId],
      }),
    });
    assert.equal(runResponse.status, 200);
    assert.ok(runResponse.body);

    const reader = runResponse.body.getReader();
    const decoder = new TextDecoder();
    const toolEvents = [];
    let terminal = null;
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const boundary = buffer.search(/\r?\n\r?\n/);
        if (boundary < 0) break;
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
        const parsed = parseSseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + separator.length);
        if (!parsed) continue;
        const name = parsed.payload?.payload?.name;
        if (typeof name === "string" && parsed.event.startsWith("tool.")) toolEvents.push(`${parsed.event}:${name}`);
        if (["run.completed", "run.failed", "run.cancelled"].includes(parsed.event)) terminal = parsed.event;
      }
    }
    reader.releaseLock();

    assert.equal(terminal, "run.completed");
    assert.ok(toolEvents.includes("tool.completed:read"), `expected real read tool; observed ${toolEvents.join(", ")}`);
    assert.ok(toolEvents.includes("tool.completed:edit") || toolEvents.includes("tool.completed:write"), `expected real edit or write tool; observed ${toolEvents.join(", ")}`);

    const downloadResponse = await request(`/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(upload.file.fileId)}`, { method: "GET" });
    assert.equal(downloadResponse.status, 200);
    assert.equal(await downloadResponse.text(), "Hello SNN.");
    t.diagnostic(`REAL_MODEL_TOOL_EVENTS=${toolEvents.join(",")}`);
  } finally {
    if (sessionId) {
      const deleted = await request(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null);
      assert.equal(deleted?.status, 200, "temporary real-model session must be deleted");
    }
  }
});

test("real model deletes one exact XLSX row through spreadsheet tools", { skip: configured ? false : "set SNN_REAL_MODEL_AGENT_BASE_URL and SNN_REAL_MODEL_ORIGIN", timeout: 180_000 }, async (t) => {
  const cookies = new CookieJar();
  let sessionId = null;

  async function request(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", browserOrigin);
    const cookie = cookies.header();
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(120_000) });
    cookies.absorb(response.headers);
    return response;
  }

  try {
    const created = await request("/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(created.status, 201);
    sessionId = (await created.json()).sessionId;
    const xlsx = await buildSpreadsheetFixture();
    const expectedVersion = createHash("sha256").update(xlsx).digest("hex");
    const form = new FormData();
    form.set("file", new Blob([xlsx], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "人员信息.xlsx");
    const uploaded = await request(`/sessions/${encodeURIComponent(sessionId)}/files`, { method: "POST", body: form });
    assert.equal(uploaded.status, 201);
    const file = (await uploaded.json()).file;

    const run = await request(`/sessions/${encodeURIComponent(sessionId)}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: `读取我上传的“人员信息.xlsx”。先使用 workspace.spreadsheet.inspect，在工作表“人员信息”的“姓名”列精确查找“目标用户827”。确认只有一条匹配后，使用 workspace.spreadsheet.patch 删除这整条人员记录，expected_version 必须使用 inspect 返回的 version。然后再次调用 workspace.spreadsheet.inspect 验证已经找不到“目标用户827”。不要只回复修改结果，必须直接修改 Workspace 中的原工作簿。初始文件版本校验值为 ${expectedVersion}。`,
        attachments: [file.fileId],
      }),
    });
    assert.equal(run.status, 200);
    assert.ok(run.body);
    const reader = run.body.getReader();
    const decoder = new TextDecoder();
    const toolEvents = [];
    let terminal = null;
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const boundary = buffer.search(/\r?\n\r?\n/);
        if (boundary < 0) break;
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
        const parsed = parseSseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + separator.length);
        if (!parsed) continue;
        const name = parsed.payload?.payload?.name;
        if (typeof name === "string" && parsed.event.startsWith("tool.")) toolEvents.push(`${parsed.event}:${name}`);
        if (["run.completed", "run.failed", "run.cancelled"].includes(parsed.event)) terminal = parsed.event;
      }
    }
    reader.releaseLock();
    assert.equal(terminal, "run.completed");
    assert.ok(toolEvents.includes("tool.completed:workspace.spreadsheet.inspect"), `expected inspect tool; observed ${toolEvents.join(", ")}`);
    assert.ok(toolEvents.includes("tool.completed:workspace.spreadsheet.patch"), `expected patch tool; observed ${toolEvents.join(", ")}`);

    const downloaded = await request(`/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(file.fileId)}`, { method: "GET" });
    assert.equal(downloaded.status, 200);
    const workbook = await loadWorkbook(fromBuffer(Buffer.from(await downloaded.arrayBuffer())));
    const people = workbook.sheets.find((entry) => entry.kind === "worksheet" && entry.sheet.title === "人员信息")?.sheet;
    const notes = workbook.sheets.find((entry) => entry.kind === "worksheet" && entry.sheet.title === "说明")?.sheet;
    assert.equal(people?.rows.get(2)?.get(1)?.value, "测试用户甲");
    assert.equal(people?.rows.get(3)?.get(1)?.value, "测试用户乙");
    assert.equal(notes?.rows.get(1)?.get(1)?.value, "SNN_REAL_MODEL_XLSX_SECOND_SHEET");
    t.diagnostic(`REAL_MODEL_SPREADSHEET_TOOL_EVENTS=${toolEvents.join(",")}`);
  } finally {
    if (sessionId) {
      const deleted = await request(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null);
      assert.equal(deleted?.status, 200, "temporary real-model session must be deleted");
    }
  }
});
