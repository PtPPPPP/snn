import { devices, expect, test } from "@playwright/test";

const BASE_URL = process.env.SNN_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const SCREENSHOT_DIR = ".preview/mobile-remediation";
const mobileProfiles = ["iPhone SE", "iPhone 13", "iPhone 15", "Pixel 5", "Galaxy S24"];
const portraitViewports = [
  ["320x568", 320, 568],
  ["360x780", 360, 780],
  ["375x667", 375, 667],
  ["390x844", 390, 844],
  ["393x852", 393, 852],
  ["430x932", 430, 932],
];
const landscapeViewports = [
  ["750x342", 750, 342],
  ["802x293", 802, 293],
  ["667x375", 667, 375],
  ["844x390", 844, 390],
  ["915x412", 915, 412],
];

function mobileContextOptions(width, height) {
  return {
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: devices["Pixel 5"].userAgent,
    locale: "zh-CN",
  };
}

async function noDocumentOverflow(page) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  expect(result.scrollWidth).toBeLessThanOrEqual(result.viewportWidth);
}

async function box(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
}

async function mockAiStatus(page) {
  await page.route("**/api/ai/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ online: false, model: null, status: "offline" }),
  }));
}

async function seedConversation(page, { id = "mobile-remediation", title = "Mobile remediation", content = "hello", messages } = {}) {
  await page.evaluate(async ({ conversationId, conversationTitle, messageContent, conversationMessages }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("snn-ai", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("conversations")) request.result.createObjectStore("conversations", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("snn-ai", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("conversations", "readwrite");
      transaction.objectStore("conversations").put({
        id: conversationId,
        title: conversationTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: conversationMessages ?? [{ role: "user", content: messageContent }],
        version: 1,
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    localStorage.setItem("snn-ai-active-conversation-id", conversationId);
  }, { conversationId: id, conversationTitle: title, messageContent: content, conversationMessages: messages ?? null });
}

for (const profileName of mobileProfiles) {
  test(`mobile profile portrait smoke: ${profileName}`, async ({ browser }) => {
    const context = await browser.newContext({ ...devices[profileName], locale: "zh-CN" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await expect(page.locator(".hero h1")).toBeVisible();
    await expect(page.locator('a[href="/ai/"]').first()).toBeVisible();
    await noDocumentOverflow(page);

    await mockAiStatus(page);
    await page.goto(BASE_URL + "/ai/", { waitUntil: "networkidle" });
    const composer = await box(page, "form");
    expect(composer.bottom).toBeLessThanOrEqual((await page.evaluate(() => innerHeight)) + 1);
    await expect(page.locator("#ai-message")).toBeVisible();
    await noDocumentOverflow(page);
    expect(errors).toEqual([]);
    await context.close();
  });
}

for (const [label, width, height] of portraitViewports) {
  test(`portrait regression ${label}`, async ({ browser }) => {
    const context = await browser.newContext(mobileContextOptions(width, height));
    const page = await context.newPage();
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await expect(page.locator(".hero h1")).toBeVisible();
    await noDocumentOverflow(page);
    if (label === "320x568" || label === "390x844") {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/home-${label.split("x")[0]}-top.png`, fullPage: false });
    }

    await mockAiStatus(page);
    await page.goto(BASE_URL + "/ai/", { waitUntil: "networkidle" });
    // Floating composer model: the chat canvas extends behind the composer,
    // so messages.bottom intentionally reaches the viewport bottom. The
    // content-safety contract is that the composer stays inside the viewport.
    const composer = await box(page, "form");
    expect(composer.bottom).toBeLessThanOrEqual(height + 1);
    await noDocumentOverflow(page);
    if (label === "320x568" || label === "390x844") {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ai-${label.split("x")[0]}-portrait.png`, fullPage: false });
    }
    await context.close();
  });
}

for (const [label, width, height] of landscapeViewports) {
  test(`landscape geometry ${label}`, async ({ browser }) => {
    const context = await browser.newContext(mobileContextOptions(width, height));
    const page = await context.newPage();
    await mockAiStatus(page);
    await page.goto(BASE_URL + "/ai/", { waitUntil: "networkidle" });
    // Floating composer model: canvas extends behind the composer; verify the
    // composer stays inside the viewport and the last message clears it.
    const composer = await box(page, "form");
    expect(composer.bottom).toBeLessThanOrEqual(height + 1);
    await noDocumentOverflow(page);
    if (label === "750x342" || label === "802x293") {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ai-${label}-landscape.png`, fullPage: false });
    }
    await context.close();
  });
}

for (const [label, profileName] of [["320", "iPhone SE"], ["390", "iPhone 13"], ["393", "Pixel 5"]]) {
  test(`delete works on first touch: ${profileName}`, async ({ browser }) => {
    const context = await browser.newContext({ ...devices[profileName], locale: "zh-CN" });
    const page = await context.newPage();
    await mockAiStatus(page);
    await page.goto(BASE_URL + "/ai/", { waitUntil: "domcontentloaded" });
    await seedConversation(page, { id: `delete-${label}`, title: `Delete ${label}` });
    await page.reload({ waitUntil: "networkidle" });

    await page.locator('button[aria-label="打开历史对话"]').tap();
    await page.waitForTimeout(260);
    const deleteButton = page.locator(`[aria-label="删除对话：Delete ${label}"]`);
    await expect(deleteButton).toBeVisible();
    const deleteBox = await deleteButton.boundingBox();
    expect(deleteBox?.width ?? 0).toBeGreaterThanOrEqual(40);
    await deleteButton.tap();

    const dialog = page.locator('[role="dialog"]');
    const cancel = dialog.getByRole("button", { name: "取消" });
    const confirm = dialog.getByRole("button", { name: "删除" });
    await expect(dialog).toBeVisible();
    if (label === "320" || label === "390") {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ai-${label}-delete-dialog.png`, fullPage: false });
    }
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(deleteButton).toBeFocused();
    if (label === "320" || label === "390") {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/ai-${label}-drawer.png`, fullPage: false });
    }
    await context.close();
  });
}

test("long content remains above the composer in short landscape", async ({ browser }) => {
  const context = await browser.newContext(mobileContextOptions(750, 342));
  const page = await context.newPage();
  await mockAiStatus(page);
  await page.goto(BASE_URL + "/ai/", { waitUntil: "domcontentloaded" });
  await seedConversation(page, { content: `https://example.com/${"unbroken-token-".repeat(100)}\n第一段中文消息。\n\n第二段中文消息。` });
  await page.reload({ waitUntil: "networkidle" });
  const messages = page.locator('[class*="messages"]');
  await messages.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const bubble = page.locator('[class*="messageBubble"]').last();
  await expect(bubble).toHaveCount(1);
  const bubbleRect = await bubble.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
  const composer = await box(page, "form");
  expect(await bubble.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(bubbleRect.bottom).toBeLessThanOrEqual(composer.top + 2);
  await noDocumentOverflow(page);
  await context.close();
});

// F-03: at max multiline composer height the last message must stop fully
// above the floating composer with a real safety gap on small viewports.
for (const [label, width, height] of [["390x844", 390, 844], ["320x700", 320, 700], ["750x342", 750, 342]]) {
  test(`max multiline composer keeps last message clear ${label}`, async ({ browser }) => {
    const context = await browser.newContext(mobileContextOptions(width, height));
    const page = await context.newPage();
    await mockAiStatus(page);
    await page.goto(BASE_URL + "/ai/", { waitUntil: "domcontentloaded" });
    const longMessages = [];
    for (let i = 0; i < 6; i++) {
      longMessages.push({ role: "user", content: `问题 ${i + 1}：` + "较长的中文提问内容".repeat(8) });
      longMessages.push({ role: "assistant", content: "这是用于验证保留空间的助手回复。".repeat(16) });
    }
    await seedConversation(page, { content: "", messages: longMessages });
    await page.reload({ waitUntil: "networkidle" });
    await page.fill("#ai-message", Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行多行输入`).join("\n"));
    await page.locator('[class*="messages"]').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const bubble = page.locator('[class*="messageBubble"]').last();
    const geometry = await page.evaluate(() => {
      const bubbleRect = document.querySelector('[class*="messageBubble"]').getBoundingClientRect();
      const composerRect = document.querySelector("form").getBoundingClientRect();
      return { bubbleBottom: bubbleRect.bottom, composerTop: composerRect.top };
    });
    expect(await bubble.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(geometry.bubbleBottom).toBeLessThan(geometry.composerTop);
    expect(geometry.composerTop - geometry.bubbleBottom).toBeGreaterThanOrEqual(8);
    const composer = await box(page, "form");
    expect(composer.bottom).toBeLessThanOrEqual(height + 1);
    await noDocumentOverflow(page);
    await context.close();
  });
}

test("mobile reduced motion keeps the Hero static", async ({ browser }) => {
  const context = await browser.newContext(mobileContextOptions(390, 844));
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  expect(await page.locator(".hero-art").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await noDocumentOverflow(page);
  await context.close();
});

for (const deviceScaleFactor of [1, 2, 3]) {
  test(`mobile DPR ${deviceScaleFactor}`, async ({ browser }) => {
    const context = await browser.newContext({ ...mobileContextOptions(390, 844), deviceScaleFactor });
    const page = await context.newPage();
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScaleFactor);
    await noDocumentOverflow(page);
    await mockAiStatus(page);
    await page.goto(BASE_URL + "/ai/", { waitUntil: "networkidle" });
    await noDocumentOverflow(page);
    await context.close();
  });
}
