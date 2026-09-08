"use client";
import {createElement, memo} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Normalize common model math delimiters, leaving code examples untouched.
function normalizeMath(text) {
 return text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g).map((part,i)=>i%2?part:part
  .replace(/\\\[([\s\S]*?)\\\]/g,(_,math)=>`\n\n$$\n${math}\n$$\n\n`)
  .replace(/\\\(([^\n]*?)\\\)/g,(_,math)=>`$${math}$`)).join('');
}
const plugins=[remarkGfm,remarkMath];
const renderPlugins=[[rehypeKatex,{strict:false,trust:false,throwOnError:false}]];
const components={
 a:({children,href})=>createElement('a',{href,rel:'noreferrer noopener',target:'_blank'},children),
 table:({children})=>createElement('div',{className:'snn-markdown-table',tabIndex:0,role:'region','aria-label':'表格，可横向滚动'},createElement('table',null,children)),
};
/** @param {{text:string}} props */
function MarkdownContent({text}) {
 return createElement('div',{className:'snn-markdown'},createElement(ReactMarkdown,{
  remarkPlugins:plugins,rehypePlugins:renderPlugins,components,skipHtml:true,
 },normalizeMath(text)));
}
export default memo(MarkdownContent);
