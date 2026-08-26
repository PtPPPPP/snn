import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { fetchPublicText } from "../src/agent/workspace/workspace-url-fetch.mjs";

function fixtureServer(handler) {
  const server = createServer(handler);
  return {
    async listen() { await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); return `http://127.0.0.1:${server.address().port}`; },
    async close() { await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }); },
  };
}

const DENIED = (error) => error.code === "WORKSPACE_FETCH_HOST_DENIED";

test("fetch rejects malformed URLs and non-http schemes", async () => {
  await assert.rejects(() => fetchPublicText("not a url"), (error) => error.code === "WORKSPACE_FETCH_INVALID_URL");
  await assert.rejects(() => fetchPublicText("file:///etc/passwd"), (error) => error.code === "WORKSPACE_FETCH_SCHEME_DENIED");
  await assert.rejects(() => fetchPublicText("ftp://example.com/data"), (error) => error.code === "WORKSPACE_FETCH_SCHEME_DENIED");
});

test("fetch denies loopback and private literal hosts by default", async () => {
  await assert.rejects(() => fetchPublicText("http://127.0.0.1/secret"), DENIED);
  await assert.rejects(() => fetchPublicText("http://10.0.0.1/secret"), DENIED);
  await assert.rejects(() => fetchPublicText("http://192.168.1.1/secret"), DENIED);
  await assert.rejects(() => fetchPublicText("http://[::1]/secret"), DENIED);
});

test("fetch denies hostnames that resolve to private addresses at connect time", async () => {
  // localhost resolves to 127.0.0.1/::1 and must be blocked before any socket opens.
  await assert.rejects(() => fetchPublicText("http://localhost/secret"), DENIED);
});

test("fetch returns bounded text when private networks are allowed by fixture config", async () => {
  const fixture = fixtureServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("public page body");
  });
  const base = await fixture.listen();
  try {
    const text = await fetchPublicText(`${base}/page`, { allowPrivateNetworks: true });
    assert.equal(text, "public page body");
  } finally { await fixture.close(); }
});

test("fetch follows redirects and re-validates every hop", async () => {
  const finalServer = fixtureServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("final destination");
  });
  const finalBase = await finalServer.listen();
  const hopServer = fixtureServer((request, response) => {
    if (request.url === "/hop") {
      response.writeHead(302, { location: `${finalBase}/final` });
      response.end();
    } else if (request.url === "/file-hop") {
      response.writeHead(302, { location: "file:///etc/passwd" });
      response.end();
    } else {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("unexpected");
    }
  });
  const hopBase = await hopServer.listen();
  try {
    const text = await fetchPublicText(`${hopBase}/hop`, { allowPrivateNetworks: true });
    assert.equal(text, "final destination");
    // Redirects to non-http schemes stay denied even mid-chain.
    await assert.rejects(
      () => fetchPublicText(`${hopBase}/file-hop`, { allowPrivateNetworks: true }),
      (error) => error.code === "WORKSPACE_FETCH_SCHEME_DENIED",
    );
  } finally {
    await hopServer.close();
    await finalServer.close();
  }
});

test("fetch enforces body size, content type, status, and timeout bounds", async () => {
  const fixture = fixtureServer((request, response) => {
    if (request.url === "/big") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("x".repeat(300 * 1024));
    } else if (request.url === "/image") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    } else if (request.url === "/missing") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("gone");
    } else {
      // Never answer: lets the client-side timeout fire deterministically.
    }
  });
  const base = await fixture.listen();
  try {
    const opts = { allowPrivateNetworks: true };
    await assert.rejects(() => fetchPublicText(`${base}/big`, opts), (error) => error.code === "WORKSPACE_FETCH_TOO_LARGE");
    await assert.rejects(() => fetchPublicText(`${base}/image`, opts), (error) => error.code === "WORKSPACE_FETCH_CONTENT_DENIED");
    await assert.rejects(() => fetchPublicText(`${base}/missing`, opts), (error) => error.code === "WORKSPACE_FETCH_UPSTREAM_ERROR");
    await assert.rejects(() => fetchPublicText(`${base}/slow`, { ...opts, timeoutMs: 300 }), (error) => error.code === "WORKSPACE_FETCH_TIMEOUT");
  } finally { await fixture.close(); }
});
