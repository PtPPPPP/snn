import { test, expect } from "@playwright/test";

const viewports = [
  ["1440", { width: 1440, height: 900 }],
  ["1280", { width: 1280, height: 800 }],
  ["390", { width: 390, height: 844 }],
  ["320", { width: 320, height: 700 }],
];

async function assertNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const [name, viewport] of viewports) {
  test(`homepage smoke ${name}px`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator(".site-header .brand-logo")).toBeVisible();
    await expect(page.locator(".nav-open-pill")).toBeVisible();
    await expect(page.locator(".hero h1")).toBeVisible();
    await expect(page.locator('a.button[href="#projects"]')).toBeVisible();
    await expect(page.locator('a[href="/ai/"]').first()).toBeVisible();
    for (const section of ["about", "projects", "activities", "join"]) {
      await expect(page.locator(`#${section}`)).toBeVisible();
      await expect(page.locator(`#${section} h2`)).toBeVisible();
    }
    await expect(page.locator(".wechat-qr-wrap img")).toHaveAttribute("alt", /二维码/);
    await expect(page.locator("footer")).toBeVisible();
    if (viewport.width > 760) {
      await expect(page.locator(".main-nav")).toBeVisible();
      await expect(page.locator('.main-nav a[href="#about"]')).toBeVisible();
    }
    const project = page.locator(".project-row").first();
    const beforeHover = await project.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
    });
    await project.hover();
    const afterHover = await project.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
    });
    expect(afterHover).toEqual(beforeHover);
    await page.screenshot({ path: `.preview/frontend-smoke/homepage-${name}.png`, fullPage: true });
    await assertNoOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("homepage reduced-motion smoke", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".hero h1")).toBeVisible();
  expect(await page.locator(".hero-art").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await assertNoOverflow(page);
});

for (const [name, viewport] of viewports) {
  test(`AI smoke ${name}px`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, model: null, status: "offline" }) }));
    await page.setViewportSize(viewport);
    await page.goto("/ai/", { waitUntil: "networkidle" });
    await expect(page.locator('section[aria-label="SNN AI Chat"]')).toBeVisible();
    await expect(page.locator("#ai-message")).toBeVisible();
    await expect(page.getByRole("button", { name: /深度思考/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /发送/ })).toBeVisible();
    const composer = page.locator("form").filter({ has: page.locator("#ai-message") });
    const composerBox = await composer.boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox.x + composerBox.width).toBeLessThanOrEqual(viewport.width);
    if (viewport.width <= 900) {
      const trigger = page.locator('button[aria-label="打开历史对话"]');
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#conversation-sidebar")).toBeVisible();
      await page.locator('[class*="backdrop"]').click({ position: { x: viewport.width - 2, y: 2 } });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
    await page.screenshot({ path: `.preview/frontend-smoke/ai-${name}.png`, fullPage: true });
    await assertNoOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("AI delete dialog keyboard smoke", async ({ page }) => {
  await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, model: null, status: "offline" }) }));
  await page.goto("/ai/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("snn-ai", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("conversations")) request.result.createObjectStore("conversations", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("snn-ai", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction("conversations", "readwrite"); tx.objectStore("conversations").put({ id: "browser-smoke", title: "Browser smoke conversation", createdAt: Date.now(), updatedAt: Date.now(), messages: [{ role: "user", content: `https://example.com/${"unbroken-token-".repeat(90)}\n第一段消息。\n\n第二段消息。` }], version: 1 }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    localStorage.setItem("snn-ai-active-conversation-id", "browser-smoke");
  });
  await page.reload({ waitUntil: "networkidle" });
  const messageBubble = page.locator('[class*="messageBubble"]').first();
  await expect(messageBubble).toBeVisible();
  expect(await messageBubble.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const deleteButton = page.locator('[aria-label="删除对话：Browser smoke conversation"]');
  await deleteButton.locator("xpath=..").hover();
  await deleteButton.click();
  const dialog = page.locator('[role="dialog"]');
  const cancel = dialog.getByRole("button", { name: "取消" });
  const confirm = dialog.getByRole("button", { name: "删除" });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="删除对话：Browser smoke conversation"]')).toBeFocused();
});
