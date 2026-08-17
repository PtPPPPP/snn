import { cp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = process.cwd();
const outputDir = path.join(root, "ftp-upload");
const tempDir = path.join(root, ".static-export-temp");

await rm(tempDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const pageSource = (await readFile(path.join(root, "app", "page.tsx"), "utf8")).replace(
  'import Link from "next/link";',
  "const Link = ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>;",
);
const compiledPage = ts.transpileModule(pageSource, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "page.tsx",
}).outputText;

const compiledPath = path.join(tempDir, "page.mjs");
await writeFile(compiledPath, compiledPage, "utf8");

const { default: Home } = await import(
  `${pathToFileURL(compiledPath).href}?t=${Date.now()}`
);
const body = renderToStaticMarkup(React.createElement(Home));
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="面向人工智能与机器人方向的学生科技社团。一起学习、动手、参赛，把想法做成真正能跑的项目。">
    <title>SNN｜Smart Neural Network 学生科技社团</title>
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    ${body}
  </body>
</html>
`;

const cssSource = await readFile(path.join(root, "app", "globals.css"), "utf8");
const staticCss = cssSource.replace('@import "tailwindcss";', "").trimStart();
const aiCss = await readFile(path.join(root, "app", "ai", "ai-chat.module.css"), "utf8");
const aiClientSource = await readFile(path.join(root, "lib", "ai-client.ts"), "utf8");
const ftpChatSource = await readFile(path.join(root, "app", "ai", "ftp-chat.ts"), "utf8");
const compiledAiClient = ts
  .transpileModule(aiClientSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "ai-client.ts",
  })
  .outputText.replace(
    /const buildBaseUrl = typeof process === "undefined"\s*\? undefined\s*:\s*process\.env\.NEXT_PUBLIC_SNN_AI_API_BASE_URL;/,
    "const buildBaseUrl = undefined;",
  );
const compiledFtpChat = ts
  .transpileModule(ftpChatSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "ftp-chat.ts",
  })
  .outputText.replace(/(["'])\.\.\/\.\.\/lib\/ai-client\1/g, '"./ai-client.js"');

const aiHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="SNN AI Chat 界面。">
    <title>SNN AI｜Smart Neural Network</title>
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="ai.css">
  </head>
  <body>
    <main class="page">
      <header class="header">
        <a class="brand" href="/" aria-label="返回 SNN 首页">
          <img src="/assets/snn-logo-fixed.png" alt="SNN 社团 Logo">
          <span>SNN AI<small>SMART NEURAL NETWORK</small></span>
        </a>
        <a class="backLink" href="/">返回官网 <span aria-hidden="true">↗</span></a>
      </header>
      <section class="chatShell" aria-label="SNN AI Chat">
        <aside class="sidebar">
          <div>
            <p class="sectionCode">NODE / 01</p>
            <h1>SNN AI</h1>
            <p class="description">由 SNN 本地 AI 节点提供推理服务。</p>
          </div>
          <div class="statusCard" aria-label="AI 服务状态">
            <span class="statusDot statusChecking" id="ai-status-dot" aria-hidden="true"></span>
            <div><strong id="ai-status-label">Checking AI Node...</strong><span id="ai-status-detail">正在检查本地 AI 节点</span></div>
          </div>
          <button class="newChatButton" id="ai-new-chat" type="button"><span>＋</span> 新建对话</button>
        </aside>
        <div class="chatPanel">
          <div class="panelHeader"><span>CHAT / HTTP READY</span><span id="ai-panel-state">NODE OFFLINE</span></div>
          <div class="messages" id="ai-messages" aria-live="polite"></div>
          <form class="composer" id="ai-composer">
            <label class="composerLabel" for="ai-message">MESSAGE / 输入消息</label>
            <div class="composerControls">
              <textarea class="composerInput" id="ai-message" placeholder="向 SNN AI 提问…" rows="1"></textarea>
              <button class="sendButton" id="ai-send" type="submit">发送 <span aria-hidden="true">↗</span></button>
            </div>
            <p class="composerHint">Enter 发送 · Shift + Enter 换行</p>
          </form>
        </div>
      </section>
    </main>
    <script src="../ai-config.js"></script>
    <script type="module" src="app.js"></script>
  </body>
</html>
`;

await writeFile(path.join(outputDir, "index.html"), html, "utf8");
await writeFile(path.join(outputDir, "styles.css"), staticCss, "utf8");
await cp(path.join(root, "public", "assets"), path.join(outputDir, "assets"), {
  recursive: true,
  force: true,
});
await mkdir(path.join(outputDir, "ai"), { recursive: true });
await writeFile(path.join(outputDir, "ai", "index.html"), aiHtml, "utf8");
await writeFile(path.join(outputDir, "ai", "ai.css"), `${staticCss}\n\n${aiCss}`, "utf8");
await writeFile(path.join(outputDir, "ai", "ai-client.js"), compiledAiClient, "utf8");
await writeFile(path.join(outputDir, "ai", "app.js"), compiledFtpChat, "utf8");

const staticConfigPath = path.join(outputDir, "ai-config.js");
if (!(await exists(staticConfigPath))) {
  await writeFile(
    staticConfigPath,
    'window.__SNN_AI_API_BASE_URL__ = "/api/ai";\n',
    "utf8",
  );
}
await rm(tempDir, { recursive: true, force: true });

console.log(`Static FTP package created: ${outputDir}`);
