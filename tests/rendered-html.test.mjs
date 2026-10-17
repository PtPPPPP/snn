import assert from "node:assert/strict";
import test from "node:test";
import { startBuiltWorker } from "../scripts/built-worker.mjs";

const pageTitle = /<title>SNN[^<]*<\/title>/i;

test("renders page title metadata", async (t) => {
  const worker = await startBuiltWorker();
  t.after(() => worker.close());

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), pageTitle);
});

test("homepage exposes functional navigation and removes obsolete Menu control", async (t) => {
  const worker = await startBuiltWorker();
  t.after(() => worker.close());
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }));
  const html = await response.text();
  assert.match(html, /href="#projects"/);
  assert.match(html, /href="\/ai\/"/);
  assert.match(html, /id="projects"/);
  assert.doesNotMatch(html, />\s*Menu\s*</);
});

test("production site URL drives canonical metadata without localhost", async (t) => {
  const worker = await startBuiltWorker({ vars: { NEXT_PUBLIC_SITE_URL: "https://snnai.cn" } });
  t.after(() => worker.close());

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
  );
  const html = await response.text();
  assert.match(html, /https:\/\/snnai\.cn/);
  assert.doesNotMatch(html, /metadataBase[^>]*localhost/);
  for (const og of html.match(/property="og:image" content="[^"]*"/g) ?? []) {
    assert.ok(og.includes("https://snnai.cn"), `og:image must use production URL: ${og}`);
  }
});
