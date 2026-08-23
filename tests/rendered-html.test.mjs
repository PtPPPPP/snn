import assert from "node:assert/strict";
import test from "node:test";

const pageTitle = /<title>SNN[^<]*<\/title>/i;

test("renders page title metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), pageTitle);
});

test("homepage exposes functional navigation and removes obsolete Menu control", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-nav`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.match(html, /href="#projects"/);
  assert.match(html, /href="\/ai\/"/);
  assert.match(html, /id="projects"/);
  assert.doesNotMatch(html, />\s*Menu\s*</);
});

test("production site URL drives canonical metadata without localhost", async () => {
  // The SSR bundle reads process.env.NEXT_PUBLIC_SITE_URL at request time.
  // Set it before the cache-busted import so the module-scope constant picks
  // it up, then verify no localhost leaks into public metadata.
  process.env.NEXT_PUBLIC_SITE_URL = "https://snnai.cn";
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-site-url`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  process.env.NEXT_PUBLIC_SITE_URL = undefined;

  const html = await response.text();
  assert.match(html, /https:\/\/snnai\.cn/);
  assert.doesNotMatch(html, /metadataBase[^>]*localhost/);
  for (const og of html.match(/property="og:image" content="[^"]*"/g) ?? []) {
    assert.ok(og.includes("https://snnai.cn"), `og:image must use production URL: ${og}`);
  }
});
