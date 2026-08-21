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

test("composer content reservation derives from live geometry, not static paddings", () => {
  // Single source of truth: extent var + safety gap drive the reserved space.
  assert.match(css, /--snn-composer-extent:\s*128px;/);
  assert.match(css, /--composer-safety-gap:\s*28px;/);
  assert.match(
    css,
    /--messages-reserved-bottom:\s*calc\(var\(--snn-composer-extent\)\s*\+\s*var\(--composer-safety-gap\)\);/,
  );
  assert.match(css, /padding:\s*24px clamp\(20px,\s*3vw,\s*40px\)\s*var\(--messages-reserved-bottom\);/);
  // Breakpoints must not re-introduce static bottom paddings (F-05 regression).
  assert.doesNotMatch(css, /padding-bottom:\s*(220|160|120)px/);
  assert.doesNotMatch(css, /padding:\s*24px 16px 160px/);
  assert.doesNotMatch(css, /padding:\s*12px 16px 120px/);
  // The last message leaves spacing to the reserved area, keeping the
  // last-message/composer gap equal to the safety gap at every breakpoint.
  assert.match(css, /\.messages > \.messageRow:last-of-type\s*\{\s*margin-bottom:\s*0;/);
});

test("composer textarea keeps identical geometry when disabled", () => {
  // Derived min-height (one line + vertical padding) instead of a magic value:
  // a disabled EMPTY textarea otherwise shrinks to its rows-intrinsic height
  // under field-sizing: content and makes the composer jump while streaming.
  assert.match(css, /\.composerInput\s*\{[^}]*min-height:\s*calc\(1\.6em \+ 16px\);/);
  assert.doesNotMatch(css, /\.composerInput\s*\{[^}]*min-height:\s*36px/);
  assert.doesNotMatch(css, /\.composerInput\s*\{[^}]*min-height:\s*38px/);
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
