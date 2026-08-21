import { mkdir, readFile, rm, writeFile, access, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = process.cwd();
const outputDir = path.join(root, "ftp-upload");
const tempDir = path.join(root, ".static-export-temp");

/** 尽力删除临时目录（safe-delete 回收站失败时忽略，残留无害） */
async function rmQuiet(target) {
  try {
    await rm(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

await rmQuiet(tempDir);
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

/** 手动逐文件复制（避免 fs.cp 覆盖时触发 safe-delete trash 失败） */
async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const sourcePath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sourcePath, destPath);
    } else {
      await writeFile(destPath, await readFile(sourcePath));
    }
  }
}

const LINK_SHIM =
  "const Link = ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>;";

/** 给相对 import 补 .js 扩展名（Node ESM 不自动补） */
function addJsExtensions(code) {
  return code.replace(/from "(\.[^".]+)"/g, 'from "$1.js"');
}

/** 把 _sections 子组件编译到 tempDir/_sections/*.js */
const sectionsDir = path.join(root, "app", "_sections");
const sectionsOutDir = path.join(tempDir, "_sections");
await mkdir(sectionsOutDir, { recursive: true });
for (const file of await readdir(sectionsDir)) {
  if (!/\.(tsx|ts)$/.test(file)) continue;
  let source = await readFile(path.join(sectionsDir, file), "utf8");
  if (source.includes("next/link")) {
    source = source.replace('import Link from "next/link";', LINK_SHIM);
    if (source.includes("next/link")) {
      throw new Error(
        `[export-static] ${file} 的 next/link import 未被替换，请检查导入写法`,
      );
    }
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: file,
    })
    .outputText;
  await writeFile(
    path.join(sectionsOutDir, file.replace(/\.(tsx|ts)$/, ".js")),
    addJsExtensions(compiled),
    "utf8",
  );
}

const pageSource = await readFile(path.join(root, "app", "page.tsx"), "utf8");
const compiledPage = ts.transpileModule(pageSource, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "page.tsx",
}).outputText;

const compiledPath = path.join(tempDir, "page.mjs");
await writeFile(compiledPath, addJsExtensions(compiledPage), "utf8");

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
const aiCopySource = await readFile(path.join(root, "lib", "ai-copy.ts"), "utf8");
const compiledAiCopy = ts
  .transpileModule(aiCopySource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "ai-copy.ts",
  })
  .outputText;
const aiCopyModulePath = path.join(tempDir, "ai-copy.mjs");
await writeFile(aiCopyModulePath, compiledAiCopy, "utf8");
const aiCopy = await import(
  `${pathToFileURL(aiCopyModulePath).href}?t=${Date.now()}`
);
const aiConvStoreSource = await readFile(path.join(root, "lib", "ai-conversation-store.ts"), "utf8");
const aiQueueSource = await readFile(path.join(root, "lib", "ai-conversation-queue.mjs"), "utf8");
const compiledAiConvStore = ts
  .transpileModule(aiConvStoreSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "ai-conversation-store.ts",
  })
  .outputText;
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
if (compiledAiClient.includes("NEXT_PUBLIC_SNN_AI_API_BASE_URL")) {
  throw new Error(
    "[export-static] ai-client.ts 的 process.env 引用未替换，请检查 lib/ai-client.ts",
  );
}
const compiledFtpChat = ts
  .transpileModule(ftpChatSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "ftp-chat.ts",
  })
  .outputText.replace(/(["'])\.\.\/\.\.\/lib\/ai-client\1/g, '"./ai-client.js"')
  .replace(/(["'])\.\.\/\.\.\/lib\/ai-copy\1/g, '"./ai-copy.js"')
  .replace(/(["'])\.\.\/\.\.\/lib\/ai-conversation-store\1/g, '"./ai-conversation-store.js"');
if (compiledFtpChat.includes("lib/ai-client") || compiledFtpChat.includes("lib/ai-copy") || compiledFtpChat.includes("lib/ai-conversation-store")) {
  throw new Error(
    "[export-static] ftp-chat.ts 的 lib import 路径未替换，请检查 app/ai/ftp-chat.ts",
  );
}

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
          <img src="/assets/snn-logo-fixed.png" alt="SNN 社团 Logo" width="1254" height="1254">
          <span>SNN AI<small>SMART NEURAL NETWORK</small></span>
        </a>
        <div class="headerRight">
          <button class="sidebarToggle" id="ai-sidebar-toggle" type="button" aria-label="打开历史对话">☰</button>
          <a class="backLink" href="/">返回官网 <span aria-hidden="true">↗</span></a>
        </div>
      </header>
      <section class="chatShell" aria-label="SNN AI Chat">
        <aside class="sidebar">
          <div class="sidebarHeader">
            <div>
              <p class="sectionCode">${aiCopy.SIDEBAR.sectionCode}</p>
              <h1>${aiCopy.SIDEBAR.title}</h1>
              <p class="description">${aiCopy.SIDEBAR.description}</p>
            </div>
            <button class="sidebarClose" id="ai-sidebar-close" type="button" aria-label="关闭历史">✕</button>
          </div>
          <div class="statusCard" aria-label="AI 服务状态">
            <span class="statusDot statusChecking" id="ai-status-dot" aria-hidden="true"></span>
            <div><strong id="ai-status-label">${aiCopy.STATUS_LABELS.checking}</strong><span id="ai-status-detail">${aiCopy.STATUS_DETAILS.checking}</span></div>
          </div>
          <button class="newChatButton" id="ai-new-chat" type="button"><span>＋</span> 新建对话</button>
          <div class="historyLabel">最近对话</div>
          <nav class="historyList" id="ai-history-list" aria-label="历史对话"></nav>
        </aside>
        <div class="backdrop" id="ai-backdrop" aria-hidden="true"></div>
        <div class="chatPanel">
          <div class="panelHeader"><span>CHAT / HTTP READY</span><span id="ai-panel-state">${aiCopy.NODE_STATES.offline}</span></div>
          <div class="messages" id="ai-messages" aria-live="polite"></div>
          <div class="composerDock">
            <button class="scrollToBottom" id="ai-scroll-to-bottom" type="button" style="display:none" aria-label="回到底部" title="回到底部"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v15M6 13l6 6 6-6" /></svg></button>
            <form class="composer" id="ai-composer">
            <textarea class="composerInput" id="ai-message" aria-label="输入消息" rows="1"></textarea>
            <div class="composerControls">
              <button class="thinkingToggle" id="ai-thinking-toggle" type="button" aria-pressed="false"><span aria-hidden="true">◇</span> ${aiCopy.THINKING_MODE.label}</button>
              <button class="sendButton" id="ai-send" type="submit" aria-label="发送" title="发送"><span aria-hidden="true">↑</span></button>
            </div>
            </form>
          </div>
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
await copyDir(path.join(root, "public", "assets"), path.join(outputDir, "assets"));
await mkdir(path.join(outputDir, "ai"), { recursive: true });
await writeFile(path.join(outputDir, "ai", "index.html"), aiHtml, "utf8");
await writeFile(path.join(outputDir, "ai", "ai.css"), `${staticCss}\n\n${aiCss}`, "utf8");
await writeFile(path.join(outputDir, "ai", "ai-client.js"), compiledAiClient, "utf8");
await writeFile(path.join(outputDir, "ai", "ai-copy.js"), compiledAiCopy, "utf8");
await writeFile(path.join(outputDir, "ai", "ai-conversation-store.js"), compiledAiConvStore, "utf8");
await writeFile(path.join(outputDir, "ai", "ai-conversation-queue.mjs"), aiQueueSource, "utf8");
await writeFile(path.join(outputDir, "ai", "app.js"), compiledFtpChat, "utf8");

const staticConfigPath = path.join(outputDir, "ai-config.js");
if (!(await exists(staticConfigPath))) {
  await writeFile(
    staticConfigPath,
    'window.__SNN_AI_API_BASE_URL__ = "/api/ai";\n',
    "utf8",
  );
}
await rmQuiet(tempDir);

console.log(`Static compatibility package created: ${outputDir}`);
console.log("WARNING: ftp-upload is TEST / COMPATIBILITY ONLY. Never deploy it to the SNN production Cloudflare project.");
