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

test("fetch rejects malformed URLs, non-http schemes, and URL credentials", async () => {
  await assert.rejects(() => fetchPublicText("not a url"), (error) => error.code === "WORKSPACE_FETCH_INVALID_URL");
  for (const scheme of ["file:///etc/passwd", "ftp://example.com/data", "data:text/plain,hi", "javascript:alert(1)", "ws://example.com/", "wss://example.com/"]) {
    await assert.rejects(() => fetchPublicText(scheme), (error) => error.code === "WORKSPACE_FETCH_SCHEME_DENIED");
  }
  await assert.rejects(() => fetchPublicText("https://user:password@example.com/page"), (error) => error.code === "WORKSPACE_FETCH_CREDENTIALS_DENIED");
  await assert.rejects(() => fetchPublicText("http://token@api.example.com/"), (error) => error.code === "WORKSPACE_FETCH_CREDENTIALS_DENIED");
});

test("fetch denies loopback and private IPv4 literals by default", async () => {
  for (const host of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.10.10", "0.0.0.0", "100.64.0.1", "192.0.0.5", "198.18.0.1", "224.0.0.1", "255.255.255.255"]) {
    await assert.rejects(() => fetchPublicText(`http://${host}/secret`), DENIED);
  }
});

test("fetch denies private IPv6 literals in every notation", async () => {
  for (const host of [
    "[::1]",                    // loopback
    "[::]",                     // unspecified
    "[::2]",                    // ::/96 remainder denied conservatively
    "[::ffff:127.0.0.1]",       // IPv4-mapped loopback (dotted tail)
    "[0:0:0:0:0:ffff:7f00:1]",  // IPv4-mapped loopback (expanded hex)
    "[fc00::1]",                // ULA
    "[fd12:3456::1]",           // ULA
    "[fe80::1]",                // link-local
    "[ff02::1]",                // multicast
    "[2001:db8::1]",            // documentation range
    "[64:ff9b::8.8.8.8]",       // NAT64 well-known prefix
  ]) {
    await assert.rejects(() => fetchPublicText(`http://${host}/secret`), DENIED);
  }
});

test("fetch denies hostnames that resolve to private addresses at connect time", async () => {
  // localhost resolves to 127.0.0.1/::1 and must be blocked before any socket opens.
  await assert.rejects(() => fetchPublicText("http://localhost/secret"), DENIED);
});

test("fetch returns bounded text with provenance metadata when private networks are allowed by fixture config", async () => {
  const fixture = fixtureServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("public page body");
  });
  const base = await fixture.listen();
  try {
    const result = await fetchPublicText(`${base}/page`, { allowPrivateNetworks: true });
    assert.equal(result.text, "public page body");
    assert.equal(result.finalUrl, `${base}/page`);
    assert.equal(result.status, 200);
    assert.match(result.contentType, /text\/plain/);
    assert.equal(result.bytes, Buffer.byteLength("public page body"));
  } finally { await fixture.close(); }
});

test("fetch follows redirects, records the final URL, and re-validates every hop", async () => {
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
    const result = await fetchPublicText(`${hopBase}/hop`, { allowPrivateNetworks: true });
    assert.equal(result.text, "final destination");
    assert.equal(result.finalUrl, `${finalBase}/final`);
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

test("fetch rejects redirect loops and redirect chains beyond five hops", async () => {
  const loopServer = fixtureServer((request, response) => {
    if (request.url === "/a") {
      response.writeHead(301, { location: "/b" });
    } else {
      response.writeHead(301, { location: "/a" });
    }
    response.end();
  });
  const chainServer = fixtureServer((request, response) => {
    const hop = Number(request.url.slice(1)) || 0;
    response.writeHead(302, { location: `/${hop + 1}` });
    response.end();
  });
  const loopBase = await loopServer.listen();
  const chainBase = await chainServer.listen();
  try {
    await assert.rejects(() => fetchPublicText(`${loopBase}/a`, { allowPrivateNetworks: true }), (error) => error.code === "WORKSPACE_FETCH_REDIRECT_LOOP");
    await assert.rejects(() => fetchPublicText(`${chainBase}/1`, { allowPrivateNetworks: true }), (error) => error.code === "WORKSPACE_FETCH_TOO_MANY_REDIRECTS");
  } finally {
    await loopServer.close();
    await chainServer.close();
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
    } else if (request.url === "/binary") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(Buffer.from([0, 1, 2]));
    } else if (request.url === "/pdf") {
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end("%PDF-1.4");
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
    await assert.rejects(() => fetchPublicText(`${base}/binary`, opts), (error) => error.code === "WORKSPACE_FETCH_CONTENT_DENIED");
    await assert.rejects(() => fetchPublicText(`${base}/pdf`, opts), (error) => error.code === "WORKSPACE_FETCH_CONTENT_DENIED");
    await assert.rejects(() => fetchPublicText(`${base}/missing`, opts), (error) => error.code === "WORKSPACE_FETCH_UPSTREAM_ERROR");
    await assert.rejects(() => fetchPublicText(`${base}/slow`, { ...opts, timeoutMs: 300 }), (error) => error.code === "WORKSPACE_FETCH_TIMEOUT");
  } finally { await fixture.close(); }
});
