import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("production UI: upload, preview, edit, save, download", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") console.log("CONSOLE[" + msg.type() + "]:", msg.text().slice(0, 200)); });
  page.on("request", (req) => { if (req.url().includes("/api/")) console.log("REQ:", req.method(), req.url().slice(0, 130)); });
  page.on("response", async (res) => {
    if (res.url().includes("/api/")) {
      let body = "";
      try { if (res.status() >= 400 || res.url().includes("/files")) body = (await res.text()).slice(0, 150); } catch {}
      console.log("RES:", res.status(), res.url().slice(0, 130), body);
    }
  });
  await page.goto("https://snnai.cn/ai/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: /Agent/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /Agent/ }).click();
  await page.getByTestId("agent-file-input").setInputFiles({ name: "prod-ui-edit.md", mimeType: "text/markdown", buffer: Buffer.from("UI_CHECK_BEFORE") });
  await page.waitForTimeout(8000);
  const panelText = await page.getByTestId("workspace-panel").textContent().catch(() => "PANEL_MISSING");
  console.log("PANEL_TEXT:", String(panelText).slice(0, 300));
  await expect(page.getByTestId("files-panel")).toContainText("prod-ui-edit.md", { timeout: 20_000 });
  await page.getByRole("button", { name: "预览 prod-ui-edit.md" }).click();
  await expect(page.getByTestId("editor-open")).toBeVisible({ timeout: 30_000 });
  console.log("EDIT_BUTTON_PRESENT=true");
  await page.getByTestId("editor-open").click();
  const editor = page.getByTestId("workspace-editor");
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.fill("UI_CHECK_AFTER");
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-save")).toBeHidden({ timeout: 30_000 });
  await expect(page.locator("pre").filter({ hasText: "UI_CHECK_AFTER" })).toBeVisible();
  console.log("SAVE_AND_PREVIEW=PASS");
  const dl = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 prod-ui-edit.md" }).click();
  const content = await readFile(await (await dl).path(), "utf8");
  console.log("DOWNLOAD_BYTES=" + JSON.stringify(content));
  expect(pageErrors).toEqual([]);
  console.log("PROD_UI_FLOW=PASS");
});
