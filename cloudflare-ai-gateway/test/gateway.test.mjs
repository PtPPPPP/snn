import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/index.mjs";

function rateLimiter(success = true) {
  return { async limit() { return { success }; } };
}

function environment(overrides = {}) {
  return {
    AI_ORIGIN_URL: "https://ai-origin.example.com",
    ALLOWED_ORIGINS: "https://www.example.com,http://localhost:5173",
    MAX_CHAT_BODY_BYTES: "1024",
    AI_ORIGIN_TIMEOUT_MS: "20",
    CF_ACCESS_CLIENT_ID: "test-client-id",
    CF_ACCESS_CLIENT_SECRET: "test-client-secret",
    AI_CHAT_RATE_LIMIT: rateLimiter(),
    AI_STATUS_RATE_LIMIT: rateLimiter(),
    ...overrides,
  };
}

function logger() {
  return { log() {} };
}

function chatRequest(body, headers = {}) {
  return new Request("https://gateway.example.com/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("status forwards a valid online contract", async () => {
  const response = await handleRequest(
    new Request("https://gateway.example.com/api/ai/status"),
    environment(),
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ online: true, model: "Qwen3-test", status: "ready" })),
      logger: logger(),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    online: true,
    model: "Qwen3-test",
    status: "ready",
  });
});

test("status becomes offline when the origin is unavailable", async () => {
  const response = await handleRequest(
    new Request("https://gateway.example.com/api/ai/status"),
    environment(),
    { fetchImpl: async () => { throw new TypeError("network"); }, logger: logger() },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    online: false,
    model: null,
    status: "offline",
  });
});

test("chat forwards only messages and adds Access service token headers", async () => {
  let requestHeaders;
  let requestBody;
  const response = await handleRequest(
    chatRequest({
      messages: [{ role: "user", content: "你好" }],
      model: "browser-choice",
      thinking: true,
    }),
    environment(),
    {
      fetchImpl: async (_url, init) => {
        requestHeaders = new Headers(init.headers);
        requestBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({ reply: "你好，我是 SNN AI。", model: "Qwen3-test", requestId: "node-1" }),
        );
      },
      logger: logger(),
    },
  );

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.reply, "你好，我是 SNN AI。");
  assert.equal(requestHeaders.get("CF-Access-Client-Id"), "test-client-id");
  assert.equal(requestHeaders.get("CF-Access-Client-Secret"), "test-client-secret");
  assert.deepEqual(requestBody, { messages: [{ role: "user", content: "你好" }], thinking: true });
  assert.equal(JSON.stringify(body).includes("test-client-secret"), false);
});

test("gateway defaults invalid thinking values to false", async () => {
  let requestBody;
  await handleRequest(
    chatRequest({ messages: [{ role: "user", content: "你好" }], thinking: "true" }),
    environment(),
    {
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ reply: "回答" }));
      },
      logger: logger(),
    },
  );

  assert.equal(requestBody.thinking, false);
});

test("chat rejects invalid JSON and oversized payloads", async () => {
  const invalid = await handleRequest(
    new Request("https://gateway.example.com/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }),
    environment(),
    { logger: logger() },
  );
  assert.equal(invalid.status, 400);

  const oversized = await handleRequest(
    chatRequest({ messages: [{ role: "user", content: "x".repeat(2_000) }] }),
    environment({ MAX_CHAT_BODY_BYTES: "100" }),
    { logger: logger() },
  );
  assert.equal(oversized.status, 413);
});

test("chat maps origin timeout and origin errors without leaking details", async () => {
  const timeout = await handleRequest(
    chatRequest({ messages: [{ role: "user", content: "测试" }] }),
    environment({ AI_ORIGIN_TIMEOUT_MS: "1" }),
    {
      fetchImpl: async (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
      logger: logger(),
    },
  );
  assert.equal(timeout.status, 504);
  assert.equal((await timeout.json()).error, "SNN AI service is unavailable");

  const unavailable = await handleRequest(
    chatRequest({ messages: [{ role: "user", content: "测试" }] }),
    environment(),
    { fetchImpl: async () => new Response("origin failure", { status: 503 }), logger: logger() },
  );
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, "SNN AI service is unavailable");
});

test("gateway applies CORS allow list and chat rate limit", async () => {
  const allowed = await handleRequest(
    new Request("https://gateway.example.com/api/ai/status", {
      headers: { origin: "https://www.example.com" },
    }),
    environment(),
    { fetchImpl: async () => new Response(JSON.stringify({ online: false, model: null, status: "offline" })), logger: logger() },
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://www.example.com");

  const blocked = await handleRequest(
    new Request("https://gateway.example.com/api/ai/status", {
      headers: { origin: "https://untrusted.example.com" },
    }),
    environment(),
    { logger: logger() },
  );
  assert.equal(blocked.status, 403);

  const limited = await handleRequest(
    chatRequest({ messages: [{ role: "user", content: "测试" }] }),
    environment({ AI_CHAT_RATE_LIMIT: rateLimiter(false) }),
    { logger: logger() },
  );
  assert.equal(limited.status, 429);

  const statusLimited = await handleRequest(
    new Request("https://gateway.example.com/api/ai/status"),
    environment({ AI_STATUS_RATE_LIMIT: rateLimiter(false) }),
    { logger: logger() },
  );
  assert.equal(statusLimited.status, 429);
});

test("gateway forwards SSE without buffering and preserves Access headers", async () => {
  let headers;
  const request = new Request("https://gateway.example.com/api/ai/chat/stream", {
    method: "POST",
    headers: {
      origin: "https://www.example.com",
      "content-type": "application/json",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
  });
  const response = await handleRequest(request, environment(), {
    fetchImpl: async (_url, init) => {
      headers = new Headers(init.headers);
      return sseResponse([
        'event: delta\ndata: {"text":"你"}\n\n',
        'event: done\ndata: {"model":"Qwen3-test","requestId":"node-1"}\n\n',
      ]);
    },
    logger: logger(),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://www.example.com");
  assert.equal(headers.get("CF-Access-Client-Id"), "test-client-id");
  assert.equal(headers.get("CF-Access-Client-Secret"), "test-client-secret");
  assert.match(await response.text(), /event: delta/);
});
