import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MarkdownContent from '../app/_components/markdown-content.mjs';
const render=text=>renderToStaticMarkup(React.createElement(MarkdownContent,{text}));
test('renders Markdown and both common math delimiters',()=>{
 const html=render('**重点**\n\n- 输入\n- 输出\n\n$a_1=1.05$，\\(6.3 \\times 10^{-9}\\)\n\n\\[y=x^2\\]\n\n| 输入 | 输出 |\n|---|---|\n|1|2|\n\n```js\nconst x = 1;\n```');
 for(const tag of ['<strong>重点</strong>','<ul>','<table>','<pre>','katex','katex-display']) assert.ok(html.includes(tag),tag);
 assert.ok(!html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g,'').includes('\\times'));
});
test('does not execute HTML, unsafe URLs or trusted math HTML commands',()=>{
 const html=render('<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>\n\n$\\href{javascript:alert(1)}{x}$');
 assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));
});
test('partial streamed formulas and code do not crash',()=>{
 for(const text of ['**正在','$a_1=','$$\\frac{1}{','```js\nconst x =','\\(x^']) assert.doesNotThrow(()=>render(text));
});
