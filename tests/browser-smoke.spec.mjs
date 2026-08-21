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

async function mockAiStatusOffline(page) {
  await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, model: null, status: "offline" }) }));
}

async function seedConversation(page, conversation) {
  await page.evaluate(async (conv) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("snn-ai", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("conversations")) request.result.createObjectStore("conversations", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("snn-ai", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction("conversations", "readwrite"); tx.objectStore("conversations").put(conv); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    localStorage.setItem("snn-ai-active-conversation-id", conv.id);
  }, conversation);
}

test("AI delete dialog keyboard smoke", async ({ page }) => {
  await mockAiStatusOffline(page);
  await page.goto("/ai/", { waitUntil: "domcontentloaded" });
  await seedConversation(page, { id: "browser-smoke", title: "Browser smoke conversation", createdAt: Date.now(), updatedAt: Date.now(), messages: [{ role: "user", content: `https://example.com/${"unbroken-token-".repeat(90)}\n第一段消息。\n\n第二段消息。` }], version: 1 });
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

// F-01: a persisted thinking preference must not diverge the first client
// render from the server render (React #418) and must still restore after mount.
test("AI thinking preference restores without hydration errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await mockAiStatusOffline(page);
  await page.addInitScript("localStorage.setItem('snn-ai-thinking-mode', 'true')");
  await page.goto("/ai/", { waitUntil: "networkidle" });
  const toggle = page.getByRole("button", { name: /深度思考/ });
  // Persisted preference restored after hydration, without any hydration error.
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
  // Toggling off persists the preference (read back from storage, not the DOM).
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => localStorage.getItem("snn-ai-thinking-mode"))).toBe("false");
  expect(errors).toEqual([]);
});

// F-02: the title generated for a new conversation's first message must
// survive response completion and reload (previously overwritten with
// "新对话" by a stale-state lookup in the request's finally block).
test("AI first-message title persists after response completion and reload", async ({ page }) => {
  await mockAiStatusOffline(page);
  await page.route("**/api/ai/chat/stream", (route) => route.fulfill({ status: 503, contentType: "text/plain", body: "offline" }));
  await page.goto("/ai/", { waitUntil: "networkidle" });
  await page.fill("#ai-message", "帮我分析一下这个项目");
  await page.keyboard.press("Enter");
  await expect(page.locator('[class*="streamNotice"]').first()).toBeVisible();
  const title = page.locator('[class*="historyItemTitle"]').first();
  await expect(title).toHaveText("帮我分析一下这个项目");
  await page.waitForTimeout(900);
  await expect(title).toHaveText("帮我分析一下这个项目");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator('[class*="historyItemTitle"]').first()).toHaveText("帮我分析一下这个项目");
});

// F-04: disabling the (empty) textarea during streaming must not change its
// geometry — previously it shrank 40px → 36px and made the composer jump.
test("AI composer textarea keeps geometry while disabled", async ({ page }) => {
  await mockAiStatusOffline(page);
  await page.goto("/ai/", { waitUntil: "networkidle" });
  const textarea = page.locator("#ai-message");
  const enabledHeight = await textarea.evaluate((element) => element.getBoundingClientRect().height);
  await textarea.evaluate((element) => { element.disabled = true; });
  const disabledHeight = await textarea.evaluate((element) => element.getBoundingClientRect().height);
  expect(disabledHeight).toBe(enabledHeight);
});

// F-03: with the composer at its max multiline height, the last message must
// stop fully above the floating composer with a real safety gap.
for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  test(`AI max multiline composer keeps last message clear ${viewport.width}px`, async ({ page }) => {
    await mockAiStatusOffline(page);
    const messages = [];
    for (let i = 0; i < 6; i++) {
      messages.push({ role: "user", content: `问题 ${i + 1}：` + "较长的中文提问内容".repeat(8) });
      messages.push({ role: "assistant", content: "这是用于验证保留空间的助手回复。".repeat(16) });
    }
    await page.setViewportSize(viewport);
    await page.goto("/ai/", { waitUntil: "domcontentloaded" });
    await seedConversation(page, { id: `audit-max-${viewport.width}`, title: `max multiline ${viewport.width}`, createdAt: Date.now(), updatedAt: Date.now(), messages, version: 1 });
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
  });
}
