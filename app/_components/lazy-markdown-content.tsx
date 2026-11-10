"use client";

import { lazy, Suspense } from "react";

const MarkdownContent = lazy(() => import("./markdown-content.mjs"));

export default function LazyMarkdownContent({ text }: { text: string }) {
  return (
    <Suspense fallback={<div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</div>}>
      <MarkdownContent text={text} />
    </Suspense>
  );
}
