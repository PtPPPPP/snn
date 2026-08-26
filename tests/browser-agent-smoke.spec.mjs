import { test, expect } from "@playwright/test";

async function mockAgentStatus(page, agent = true) {
  await page.route("**/api/agent/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/agent/sessions" && route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [] }) });
    }
    if (url.pathname === "/api/ai/status") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: true, model: "test", status: "ready", capabilities: { thinking: true, webSearch: false, agent } }) });
    }
    return route.continue();
  });
  // also mock ai status
  await page.route("**/api/ai/status", async (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: true, model: "test", status: "ready", capabilities: { thinking: true, webSearch: false, agent } }) });
  });
}

test("Agent mode switch is visible and preserves chat", async ({ page }) => {
  await mockAgentStatus(page, true);
  await page.goto("/ai/", { waitUntil: "networkidle" });
  // ModeSwitch should be visible
  await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Agent/ })).toBeVisible();
  // Default is Chat
  await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
  // Switch to Agent
  await page.getByRole("tab", { name: /Agent/ }).click();
  await expect(page.getByRole("tab", { name: /Agent/ })).toHaveAttribute("aria-selected", "true");
  // Agent empty state should be visible
  await expect(page.getByTestId("agent-empty")).toBeVisible();
  await expect(page.getByTestId("agent-empty")).toContainText("Agent 可以读取");
  // Chat input should be hidden, Agent composer visible
  await expect(page.getByTestId("agent-composer")).toBeVisible();
  await expect(page.locator("#ai-message")).toHaveCount(0);
  // Switch back to Chat
  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#ai-message")).toBeVisible();
});

test("Agent upload and attachment flow", async ({ page }) => {
  const sessionId = "snn-agent-11111111-1111-4111-8111-111111111111";
  const fileId = "snn-file-22222222-2222-4222-8222-222222222222";
  await mockAgentStatus(page, true);
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sessionId, status: "created" }) });
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [{ sessionId, createdAt: new Date().toISOString(), lastAccessAt: new Date().toISOString() }] }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/files`, async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { fileId, originalName: "notes.md", size: 12, kind: "text" } }) });
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [{ fileId, originalName: "notes.md", size: 12, kind: "text" }] }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/runs`, async (route) => {
    const body = `event: run.started\ndata: {"type":"run.started","runId":"snn-run-00000000-0000-4000-8000-000000000001","sessionId":"${sessionId}","timestamp":"2026-01-01T00:00:00.000Z"}\n\nevent: tool.started\ndata: {"type":"tool.started","runId":"snn-run-00000000-0000-4000-8000-000000000001","sessionId":"${sessionId}","toolCallId":"call1","payload":{"name":"workspace.open","displayName":"Open attached file","risk":"READ","policy":"allow"}}\n\nevent: tool.completed\ndata: {"type":"tool.completed","runId":"snn-run-00000000-0000-4000-8000-000000000001","sessionId":"${sessionId}","toolCallId":"call1","payload":{"name":"workspace.open"}}\n\nevent: message.delta\ndata: {"type":"message.delta","runId":"snn-run-00000000-0000-4000-8000-000000000001","sessionId":"${sessionId}","payload":{"text":"收到 SNN_PUBLIC_TEXT_SENTINEL"}}\n\nevent: run.completed\ndata: {"type":"run.completed","runId":"snn-run-00000000-0000-4000-8000-000000000001","sessionId":"${sessionId}","timestamp":"2026-01-01T00:00:01.000Z"}\n\n`;
    return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body });
  });

  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Agent/ }).click();
  // Upload via file input
  const fileInput = page.getByTestId("agent-file-input");
  await expect(fileInput).toHaveCount(1);
  // Create a file and set input files
  await fileInput.setInputFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("hello world") });
  // Wait for chip to appear
  await expect(page.getByTestId("attachment-chip")).toBeVisible();
  await expect(page.getByTestId("attachment-chip")).toContainText("notes.md");
  // Send
  await page.getByTestId("agent-input").fill("总结这个附件");
  await page.getByTestId("agent-send-button").click();
  // Tool activity should appear
  await expect(page.getByText("workspace.open")).toBeVisible({ timeout: 5000 });
  // Message should appear
  await expect(page.getByText("SNN_PUBLIC_TEXT_SENTINEL")).toBeVisible({ timeout: 5000 });
  // Attachment should be shown in user message
  await expect(page.getByTestId("agent-user-message").last()).toContainText("notes.md");
});

test("Agent XSS-safe filename and model output", async ({ page }) => {
  const sessionId = "snn-agent-33333333-3333-4333-8333-333333333333";
  const evilName = '<img src=x onerror=alert(1)>.pdf';
  const fileId = "snn-file-44444444-4444-4444-8444-444444444444";
  await mockAgentStatus(page, true);
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sessionId, status: "created" }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/files`, async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { fileId, originalName: evilName, size: 10, kind: "pdf" } }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/runs`, async (route) => {
    const body = `event: message.delta\ndata: {"type":"message.delta","runId":"snn-run-1","sessionId":"${sessionId}","payload":{"text":"<script>alert(1)</script> safe"}}\n\nevent: run.completed\ndata: {"type":"run.completed","runId":"snn-run-1","sessionId":"${sessionId}","timestamp":"2026-01-01T00:00:00.000Z"}\n\n`;
    return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body });
  });
  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Agent/ }).click();
  const fileInput = page.getByTestId("agent-file-input");
  await fileInput.setInputFiles({ name: evilName, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByTestId("attachment-chip")).toContainText(evilName);
  // Ensure no script execution: check that no alert and that text is escaped
  // The chip should render as plain text, not as HTML
  const chipHtml = await page.getByTestId("attachment-chip").innerHTML();
  expect(chipHtml).not.toContain("<img");
  expect(chipHtml).toContain("&lt;img");
  await page.getByTestId("agent-input").fill("test xss");
  await page.getByTestId("agent-send-button").click();
  // Model output should be escaped, not executed
  const assistantMsg = page.getByTestId("agent-assistant-message").last();
  await expect(assistantMsg).toContainText("<script>");
  const msgHtml = await assistantMsg.innerHTML();
  expect(msgHtml).not.toContain("<script>alert");
});

test("Agent cancel and reload resume", async ({ page }) => {
  const sessionId = "snn-agent-55555555-5555-4555-8555-555555555555";
  const fileId = "snn-file-66666666-6666-4666-8666-666666666666";
  await mockAgentStatus(page, true);
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sessionId, status: "created" }) });
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [{ sessionId, createdAt: new Date().toISOString(), lastAccessAt: new Date().toISOString() }] }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/files`, async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { fileId, originalName: "a.txt", size: 5, kind: "text" } }) });
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [{ fileId, originalName: "a.txt", size: 5, kind: "text" }] }) });
    return route.continue();
  });
  // Long run that will be cancelled - hang the request to keep UI in streaming
  await page.route(`**/api/agent/sessions/${sessionId}/runs`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise(() => {}); // hang forever
  });
  await page.route(`**/api/agent/sessions/${sessionId}/runs/snn-run-77777777-7777-4777-8777-777777777777/cancel`, async (route) => {
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ status: "cancellation_requested" }) });
  });

  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Agent/ }).click();
  await page.getByTestId("agent-file-input").setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByTestId("attachment-chip")).toBeVisible();
  await page.getByTestId("agent-input").fill("long task");
  await page.getByTestId("agent-send-button").click();
  // Should show streaming state and Stop button
  await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible({ timeout: 3000 });
  await page.getByRole("button", { name: "停止生成" }).click();
  await expect(page.getByText("已停止生成")).toBeVisible({ timeout: 3000 });
  // Reload should retain session
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: /Agent/ })).toBeVisible();
  await page.getByRole("tab", { name: /Agent/ }).click();
  // Session list should still contain the session
  await expect(page.getByText(`Agent ${sessionId.slice(-6)}`)).toBeVisible({ timeout: 3000 });
});

test("Agent limits a multi-file selection to eight pending uploads", async ({ page }) => {
  const sessionId = "snn-agent-88888888-8888-4888-8888-888888888888";
  let uploads = 0;
  await mockAgentStatus(page, true);
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sessionId, status: "created" }) });
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [{ sessionId }] }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/files`, async (route) => {
    if (route.request().method() === "POST") {
      uploads += 1;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { fileId: `file-${uploads}`, originalName: `附件-${uploads}.txt`, size: uploads, kind: "text" } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
  });

  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Agent/ }).click();
  await page.getByTestId("agent-file-input").setInputFiles(
    Array.from({ length: 9 }, (_, index) => ({ name: `附件-${index + 1}.txt`, mimeType: "text/plain", buffer: Buffer.from(String(index)) })),
  );

  await expect(page.getByTestId("attachment-chip")).toHaveCount(8);
  expect(uploads).toBe(8);
  await expect(page.getByText("最多只能附加 8 个文件")).toBeVisible();
});

test("Removing a pending attachment preserves the workspace file; deleting it removes both", async ({ page }) => {
  const sessionId = "snn-agent-99999999-9999-4999-8999-999999999999";
  const file = { fileId: "remove-delete-file", originalName: "项目报告.pdf", size: 42, kind: "pdf" };
  let deletes = 0;
  await mockAgentStatus(page, true);
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sessionId, status: "created" }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/files/${file.fileId}`, async (route) => {
    if (route.request().method() === "DELETE") {
      deletes += 1;
      return route.fulfill({ status: 204 });
    }
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/files`, async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [file] }) });
  });

  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Agent/ }).click();
  await page.getByTestId("agent-file-input").setInputFiles({ name: file.originalName, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByTestId("attachment-chip")).toBeVisible();
  await page.getByRole("button", { name: `移除附件 ${file.originalName}` }).click();
  await expect(page.getByTestId("attachment-chip")).toHaveCount(0);
  expect(deletes).toBe(0);
  await expect(page.getByTestId("files-panel")).toContainText(file.originalName);

  await page.getByRole("button", { name: `删除文件 ${file.originalName}` }).click();
  expect(deletes).toBe(1);
  await expect(page.getByTestId("files-panel")).toHaveCount(0);
});

test("A late upload result cannot leak into a newly selected session", async ({ page }) => {
  const sessionA = "snn-agent-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sessionB = "snn-agent-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let finishUpload;
  const uploadFinished = new Promise((resolve) => { finishUpload = resolve; });
  await mockAgentStatus(page, true);
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [{ sessionId: sessionA }, { sessionId: sessionB }] }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionA}/files`, async (route) => {
    if (route.request().method() === "POST") {
      await uploadFinished;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { fileId: "late-file", originalName: "学校泳池项目合作意向书(1).docx", size: 12, kind: "docx" } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
  });
  await page.route(`**/api/agent/sessions/${sessionB}/files`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) }));

  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Agent/ }).click();
  await page.getByRole("button", { name: new RegExp(`^Agent ${sessionA.slice(-6)}`) }).click();
  await page.getByTestId("agent-file-input").setInputFiles({ name: "学校泳池项目合作意向书(1).docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("docx") });
  await expect(page.getByText("正在上传…")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^Agent ${sessionB.slice(-6)}`) }).click();
  finishUpload();

  await expect(page.getByTestId("attachment-chip")).toHaveCount(0);
  await expect(page.getByTestId("files-panel")).toHaveCount(0);
});

test("Upload failure leaves no ghost chip and long Unicode names stay within a mobile viewport", async ({ page }) => {
  const sessionId = "snn-agent-cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const longName = "2026 年 SNN Agent 文档理解测试最终版本 FINAL (2).pdf";
  let attempts = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAgentStatus(page, true);
  await page.route("**/api/agent/sessions", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sessionId, status: "created" }) });
    return route.continue();
  });
  await page.route(`**/api/agent/sessions/${sessionId}/files`, async (route) => {
    if (route.request().method() === "POST") {
      attempts += 1;
      if (attempts === 1) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "AGENT_FILE_INVALID" } }) });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { fileId: "unicode-file", originalName: longName, size: 512, kind: "pdf" } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
  });

  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Agent/ }).click();
  const fileInput = page.getByTestId("agent-file-input");
  await fileInput.setInputFiles({ name: longName, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByTestId("attachment-chip")).toHaveCount(0);
  await expect(page.getByText("文件名无效，请修改后重试。")).toBeVisible();
  await fileInput.setInputFiles({ name: longName, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  const chip = page.getByTestId("attachment-chip");
  await expect(chip).toBeVisible();
  await expect(chip.locator("[title]").filter({ hasText: longName })).toHaveAttribute("title", longName);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 900, height: 844 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);
  }
});
