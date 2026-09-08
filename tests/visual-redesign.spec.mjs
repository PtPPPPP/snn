import { test, expect } from "@playwright/test";

const sizes = [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [360, 780]];
const routes = [["/", "home"], ["/ai", "ai"], ["/play/rocket", "rocket"], ["/play/rocket/explain", "explain"], ["/play/rocket/train", "train"]];

for (const [width, height] of sizes) {
  test(`visual system and navigation across all pages at ${width}`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    // Deterministic offline service; this suite validates the real frontend,
    // not availability or response quality of the live AI service.
    await page.route("**/api/ai/status", route => route.fulfill({ json: { online: false, status: "offline" } }));
    for (const [route, name] of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("[data-site-shell]")).toHaveCount(1);
      if (name === "explain") await expect(page.getByLabel("飞行进度")).toBeVisible();
      if (name === "train") await expect(page.getByLabel("完整网络图，可横向滚动")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(247, 248, 250)");
      if (name === "home") {
        await expect(page.getByText("界面示例", { exact: true })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "首页实验入口" }).getByRole("link")).toHaveCount(3);
        await expect(page.locator(".project-row")).toHaveCount(3);
      }
      if (name === "ai") {
        await expect(page.getByRole("heading", { name: "从一个问题开始。" })).toBeVisible();
        const input = page.getByRole("textbox", { name: "输入消息" });
        await input.fill("分析这个项目，并说明关键假设。");
        await input.focus();
        expect(await page.locator("[data-chat-composer]").evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
        const composer = await page.locator("[data-chat-composer]").boundingBox();
        expect(composer.bottom ?? composer.y + composer.height).toBeLessThanOrEqual(height);
        expect(composer.x).toBeGreaterThanOrEqual(0);
        expect(composer.x + composer.width).toBeLessThanOrEqual(width);
        await input.fill("");
        await input.blur();
      }
      await page.screenshot({ path: `.preview/visual-redesign/after-${name}-${width}.png`, fullPage: true });
      if (name === "home") await page.screenshot({ path: `.preview/visual-redesign/after-home-${width}-top.png` });
      const toggle = page.getByRole("button", { name: "导航", exact: true });
      if (await toggle.isVisible()) {
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(toggle).toBeFocused();
      }
    }
    expect(errors).toEqual([]);
  });
}

test("mobile history is keyboard isolated, and status is visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/ai/status", route => route.fulfill({ json: { online: false, status: "offline" } }));
  await page.goto("/ai", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "打开历史对话" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "历史对话侧栏" })).toBeVisible();
  await expect(page.getByLabel("AI 服务状态")).toContainText("Offline");
  await expect.poll(async () => Math.round((await page.locator("#conversation-sidebar").boundingBox()).x)).toBe(0);
  await expect(page.getByRole("button", { name: "关闭历史", exact: true })).toBeFocused();
  await page.screenshot({ path: ".preview/visual-redesign/after-ai-390-sidebar.png" });
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("theme contrast of primary and supporting text meets readable contrast", async ({ page }) => {
  await page.goto("/");
  const ratios = await page.evaluate(() => {
    function luminance(hex) {
      const values = hex.trim().slice(1).match(/.{2}/g).map(part => parseInt(part, 16) / 255);
      const linear = values.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    }
    const css = getComputedStyle(document.documentElement);
    const backgrounds = ["--bg", "--surface-1", "--surface-2", "--surface-3"];
    return backgrounds.flatMap(bg => ["--text-primary", "--text-secondary", "--text-muted"].map(fg => {
      const a = luminance(css.getPropertyValue(bg)), b = luminance(css.getPropertyValue(fg));
      return { bg, fg, ratio: (Math.max(a,b) + .05) / (Math.min(a,b) + .05) };
    }));
  });
  for (const item of ratios) expect(item.ratio, JSON.stringify(item)).toBeGreaterThanOrEqual(4.5);
});

for (const width of [1440, 390]) {
  test(`Markdown, formulas and long content remain contained at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/ai/status", route => route.fulfill({ json: { online: false, status: "offline" } }));
    await page.goto("/ai", { waitUntil: "networkidle" });
    const content = [
      "## 先观察，再决策",
      "网络把高度、速度和燃料转化成油门。**这是一段用于界面验收的示例内容。**",
      "- 读入当前状态\n- 计算各层输出\n- 根据反馈更新权重",
      "> 训练记录与实时推理需要分别观察。",
      "$$\ny = \\sum_{i=1}^{n} w_i x_i + b\n$$",
      "| 步骤 | 作用 |\n| --- | --- |\n| 输入 | 高度与速度 |\n| 输出 | 连续油门 |",
      "```js\nconst signal = " + JSON.stringify("long_value_".repeat(90)) + ";\n```",
      "[查看实验说明](/play/rocket/explain)",
    ].join("\n\n");
    await page.evaluate(async content => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("snn-ai", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("conversations", "readwrite");
        tx.objectStore("conversations").put({
          id: "visual-qa-markdown", title: "火箭策略 · 视觉验收示例", createdAt: Date.now(), updatedAt: Date.now(), version: 1,
          messages: [{ role: "user", content: "请解释这段网络计算。" }, { role: "assistant", content }],
        });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
      localStorage.setItem("snn-ai-active-conversation-id", "visual-qa-markdown");
    }, content);
    await page.reload({ waitUntil: "networkidle" });
    const markdown = page.locator(".snn-markdown");
    await expect(markdown.locator("table")).toBeVisible();
    await expect(markdown.locator(".katex-display")).toBeVisible();
    await expect(markdown.locator("pre")).toBeVisible();
    await expect(markdown.locator("ul > li")).toHaveCount(3);
    const overflow = await markdown.evaluate(element => {
      const pre = element.querySelector("pre");
      return { document: document.documentElement.scrollWidth > innerWidth, block: pre.scrollWidth > pre.clientWidth };
    });
    expect(overflow.document).toBe(false);
    expect(overflow.block).toBe(true);
    await page.locator('[class*="messages"]').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: `.preview/visual-redesign/after-ai-${width}-markdown.png` });
  });
}
