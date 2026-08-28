// Phase 5B7 black-box acceptance: real browser UI -> real BFF -> real DSH
// runtime -> real edit tool -> real manifest-managed file. Nothing on the
// browser->file path is mocked; only the model provider upstream is scripted.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { bootWorkspaceEditEnv, createPublicWebFixture, hasRealRuntime, textPayloads, toolPayloads } from "./helpers/workspace-edit-env.mjs";

const RUNTIME_AVAILABLE = hasRealRuntime();
const USER_MESSAGE = "把这个文件里的 Hello world 改成 Hello SNN，不要只把结果发在聊天里，直接修改文件。";

test.describe("workspace editing black box", () => {
  // Booting the real DSH runtime subprocess dominates the budget.
  test.setTimeout(240_000);
  let env;

  test.beforeAll(async () => {
    test.skip(!RUNTIME_AVAILABLE, "requires sibling DSH built SDK and jsonrpc fixture");
    env = await bootWorkspaceEditEnv("blackbox", { fetchAllowPrivateNetworks: true });
  });

  test.afterAll(async () => {
    if (env) await env.close();
  });

  test("user-triggered edit modifies the real workspace file end to end", async ({ browser }) => {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    // The scripted model provider behaves like an instructed editor: it first
    // reads the attached file, then applies one literal edit, then answers.
    env.upstream.set([
      { match: "直接修改文件", payloads: toolPayloads("bb-read-1", "read", { file_path: "test.md" }) },
      { payloads: toolPayloads("bb-edit-1", "edit", { file_path: "test.md", old_string: "Hello world", new_string: "Hello SNN" }) },
      { payloads: textPayloads("已按要求直接修改文件 test.md，现在内容为 Hello SNN。") },
    ]);

    // The live status poll never goes idle, so wait on real UI signals instead.
    await page.goto(`${env.frontendUrl}/ai/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: /Agent/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: /Agent/ }).click();
    await expect(page.getByRole("tab", { name: /Agent/ })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });

    // Upload test.md with the original content.
    await page.getByTestId("agent-file-input").setInputFiles({ name: "test.md", mimeType: "text/markdown", buffer: Buffer.from("Hello world.") });
    await expect(page.getByTestId("attachment-chip")).toContainText("test.md");
    await expect(page.getByTestId("files-panel")).toContainText("test.md");

    // Send the user instruction with the attachment.
    await page.getByTestId("agent-input").fill(USER_MESSAGE);
    await page.getByTestId("agent-send-button").click();

    // Real tool calls surface in the workspace activity feed.
    const activity = page.getByTestId("workspace-activity");
    await expect(activity).toContainText("读取文件", { timeout: 60_000 });
    await expect(activity).toContainText("编辑文件", { timeout: 60_000 });
    await expect(activity).toContainText("完成", { timeout: 60_000 });

    // The manifest diff must show a Modified entry, not chat-derived guesses.
    const changes = page.getByTestId("workspace-changes");
    await expect(changes).toContainText("修改", { timeout: 60_000 });
    await expect(changes).toContainText("test.md", { timeout: 60_000 });

    // The assistant answer arrives and the run terminates.
    await expect(page.getByTestId("agent-assistant-message").last()).toContainText("Hello SNN", { timeout: 60_000 });

    // Download through the real download endpoint and verify exact content.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载 test.md" }).click();
    const download = await downloadPromise;
    const content = await readFile(await download.path(), "utf8");
    expect(content).toBe("Hello SNN.");

    // The model provider really went through read -> edit -> answer rounds.
    expect(env.upstream.requests.length).toBeGreaterThanOrEqual(3);
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test("user-triggered fetch retrieves real web content into a workspace file", async ({ browser }) => {
    const WEB_BODY = "SNN 网页内容，由 Agent 真实抓取。";
    const web = createPublicWebFixture(WEB_BODY);
    await web.listen();
    const context = await browser.newContext({ acceptDownloads: true });
    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      // The scripted model behaves like an instructed researcher: fetch the URL,
      // persist the fetched text into a workspace file, then answer.
      env.upstream.set([
        { match: "抓取这个网页", payloads: toolPayloads("bb-fetch-1", "workspace.fetch", { url: web.url }) },
        { payloads: toolPayloads("bb-write-1", "write", { file_path: "web-content.txt", content: WEB_BODY }) },
        { payloads: textPayloads("已抓取网页内容并保存到 web-content.txt。") },
      ]);

      await page.goto(`${env.frontendUrl}/ai/`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("tab", { name: /Agent/ })).toBeVisible({ timeout: 30_000 });
      await page.getByRole("tab", { name: /Agent/ }).click();
      await expect(page.getByRole("tab", { name: /Agent/ })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });

      await page.getByTestId("agent-input").fill(`请抓取这个网页的内容并保存到 web-content.txt 文件：${web.url}`);
      await page.getByTestId("agent-send-button").click();

      // The real workspace.fetch tool call surfaces in the activity feed.
      const activity = page.getByTestId("workspace-activity");
      await expect(activity).toContainText("抓取网页", { timeout: 60_000 });
      await expect(activity).toContainText("完成", { timeout: 60_000 });

      // The manifest diff shows the newly created file.
      const changes = page.getByTestId("workspace-changes");
      await expect(changes).toContainText("web-content.txt", { timeout: 60_000 });

      await expect(page.getByTestId("agent-assistant-message").last()).toContainText("web-content.txt", { timeout: 60_000 });

      // Download through the real download endpoint and verify exact content.
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "下载 web-content.txt" }).click();
      const download = await downloadPromise;
      const content = await readFile(await download.path(), "utf8");
      expect(content).toBe(WEB_BODY);

      // The fetch tool really hit the fixture web server.
      expect(web.hits.length).toBeGreaterThanOrEqual(1);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
      await web.close();
    }
  });

  test("file + web combined workflow merges an uploaded note with fetched page content", async ({ browser }) => {
    // MODEL_PROVIDER_SCRIPTED / RUNTIME_AND_TOOLS_REAL: only the upstream model
    // is scripted; everything from the browser to the manifest is production code.
    const NOTE_BODY = "Project Alpha currently supports file editing.";
    const WEB_BODY = "Project Alpha added controlled web fetch.\nRelease date: 2026-08-27.";
    const web = createPublicWebFixture(WEB_BODY);
    await web.listen();
    const context = await browser.newContext({ acceptDownloads: true });
    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      // The scripted model behaves like an instructed editor: read the uploaded
      // note, fetch the provided URL, apply one literal edit, then answer while
      // citing the real source URL.
      env.upstream.set([
        { match: "结合两个来源", payloads: toolPayloads("cb-read-1", "read", { file_path: "notes.md" }) },
        { payloads: toolPayloads("cb-fetch-1", "workspace.fetch", { url: web.url }) },
        {
          payloads: toolPayloads("cb-edit-1", "edit", {
            file_path: "notes.md",
            old_string: "supports file editing.",
            new_string: `supports file editing. It also added controlled web fetch (source: ${web.url}). Release date: 2026-08-27.`,
          }),
        },
        { payloads: textPayloads(`已结合上传的 notes.md 与网页内容更新文件。来源：${web.url}`) },
      ]);

      await page.goto(`${env.frontendUrl}/ai/`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("tab", { name: /Agent/ })).toBeVisible({ timeout: 30_000 });
      await page.getByRole("tab", { name: /Agent/ }).click();
      await expect(page.getByRole("tab", { name: /Agent/ })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });

      // Upload the user note first.
      await page.getByTestId("agent-file-input").setInputFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from(NOTE_BODY) });
      await expect(page.getByTestId("attachment-chip")).toContainText("notes.md");
      await expect(page.getByTestId("files-panel")).toContainText("notes.md");

      await page.getByTestId("agent-input").fill(`读取我上传的 notes.md，再查看这个网页：${web.url}\n结合两个来源更新 notes.md，把网页中的新能力和日期补进去。直接修改文件，并告诉我网页来源。`);
      await page.getByTestId("agent-send-button").click();

      // All three real tool calls surface in the workspace activity feed.
      const activity = page.getByTestId("workspace-activity");
      await expect(activity).toContainText("读取文件", { timeout: 60_000 });
      await expect(activity).toContainText("抓取网页", { timeout: 60_000 });
      await expect(activity).toContainText("编辑文件", { timeout: 60_000 });
      await expect(activity).toContainText("完成", { timeout: 60_000 });

      // Recent Changes shows the modified note.
      const changes = page.getByTestId("workspace-changes");
      await expect(changes).toContainText("修改", { timeout: 60_000 });
      await expect(changes).toContainText("notes.md", { timeout: 60_000 });

      // The answer carries the real source URL from the fetch result.
      await expect(page.getByTestId("agent-assistant-message").last()).toContainText(web.url, { timeout: 60_000 });

      // The downloaded file keeps the original fact and adds the fetched facts.
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "下载 notes.md" }).click();
      const download = await downloadPromise;
      const content = await readFile(await download.path(), "utf8");
      expect(content).toContain("Project Alpha currently supports file editing.");
      expect(content).toContain("controlled web fetch");
      expect(content).toContain("2026-08-27");

      expect(web.hits.length).toBeGreaterThanOrEqual(1);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
      await web.close();
    }
  });

  test("large file uploads through the chunked protocol and preserves bytes", async ({ browser }) => {
    // MODEL_PROVIDER_UNUSED / RUNTIME_AND_TOOLS_REAL: exercises the browser
    // chunked upload path (5 MiB > the 4 MiB direct threshold) against the
    // real BFF staging + finalize, then verifies byte integrity on download.
    const SIZE = 5 * 1024 * 1024;
    const original = Buffer.alloc(SIZE);
    for (let offset = 0; offset < SIZE; offset += 4096) original.write("snn", offset);
    const context = await browser.newContext({ acceptDownloads: true });
    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await page.goto(`${env.frontendUrl}/ai/`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("tab", { name: /Agent/ })).toBeVisible({ timeout: 30_000 });
      await page.getByRole("tab", { name: /Agent/ }).click();
      await expect(page.getByRole("tab", { name: /Agent/ })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });

      await page.getByTestId("agent-file-input").setInputFiles({ name: "large.bin", mimeType: "application/octet-stream", buffer: original });
      await expect(page.getByTestId("attachment-chip")).toContainText("large.bin", { timeout: 30_000 });
      await expect(page.getByTestId("files-panel")).toContainText("large.bin", { timeout: 30_000 });

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "下载 large.bin" }).click();
      const download = await downloadPromise;
      const downloaded = await readFile(await download.path());
      expect(downloaded.length).toBe(SIZE);
      expect(downloaded.equals(original)).toBe(true);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
