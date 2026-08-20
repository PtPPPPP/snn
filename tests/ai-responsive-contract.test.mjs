import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/ai/ai-chat.module.css", import.meta.url), "utf8");
const input = await readFile(new URL("../app/ai/chat-input.tsx", import.meta.url), "utf8");

test("AI root and message chain have shrink and overflow protection", () => {
  assert.match(css, /\.messages\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /\.messageRow\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /\.messageBubble\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;[\s\S]*?overflow-x:\s*auto;/);
  assert.doesNotMatch(css, /width:\s*100vw/);
});

test("mobile drawer and modal are viewport safe", () => {
  assert.match(css, /width:\s*min\(280px,\s*80vw\)/);
  assert.match(css, /width:\s*min\(260px,\s*82vw\)/);
  assert.match(css, /\.modal\s*\{[\s\S]*?width:\s*min\(360px,\s*calc\(100%\s*-\s*48px\)\);[\s\S]*?max-height:\s*calc\(100dvh\s*-\s*32px\);/);
  assert.match(css, /\.backdrop\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/);
});

test("composer controls and safe area are bounded", () => {
  assert.match(css, /\.composer\s*\{[\s\S]*?min-width:\s*0;/);
  assert.match(css, /\.composerControls\s*\{[\s\S]*?min-width:\s*0;/);
  assert.match(css, /\.composerInput\s*\{[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("keyboard composition is not treated as Enter send", () => {
  assert.match(input, /event\.nativeEvent\.isComposing/);
  assert.match(input, /event\.isComposing/);
});

test("focus and reduced motion contracts exist", () => {
  assert.match(css, /\.page button:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.typing i\s*\{[\s\S]*?animation:\s*none;/);
});
