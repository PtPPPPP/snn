// Phase 5B7 black-box acceptance: real browser UI -> real BFF -> real DSH
// runtime -> real edit tool -> real manifest-managed file. Nothing on the
// browser->file path is mocked; only the model provider upstream is scripted.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { bootWorkspaceEditEnv, hasRealRuntime, textPayloads, toolPayloads } from "./helpers/workspace-edit-env.mjs";

const RUNTIME_AVAILABLE = hasRealRuntime();
const USER_MESSAGE = "把这个文件里的 Hello world 改成 Hello SNN，不要只把结果发在聊天里，直接修改文件。";

test.describe("workspace editing black box", () => {
  // Booting the real DSH runtime subprocess dominates the budget.
  test.setTimeout(240_000);
  let env;

  test.beforeAll(async () => {
    test.skip(!RUNTIME_AVAILABLE, "requires sibling DSH built SDK and jsonrpc fixture");
    env = await bootWorkspaceEditEnv("blackbox");
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
});
