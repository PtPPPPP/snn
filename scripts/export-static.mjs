import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = process.cwd();
const outputDir = path.join(root, "ftp-upload");
const tempDir = path.join(root, ".static-export-temp");

await rm(outputDir, { recursive: true, force: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

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

await writeFile(path.join(outputDir, "index.html"), html, "utf8");
await writeFile(path.join(outputDir, "styles.css"), staticCss, "utf8");
await cp(path.join(root, "public", "assets"), path.join(outputDir, "assets"), {
  recursive: true,
});
await rm(tempDir, { recursive: true, force: true });

console.log(`Static FTP package created: ${outputDir}`);
