import assert from "node:assert/strict";
import test from "node:test";
import { createAiNodeServer } from "../src/server.mjs";

const baseConfig = {
  host: "127.0.0.1",
  port: 0,
  allowedOrigins: ["http://127.0.0.1:8765"],
  upstreamBaseUrl: "http://127.0.0.1:8000/v1",
  upstreamApiKey: "",
  model: "Qwen3-test",
  statusTimeoutMs: 40,
  chatTimeoutMs: 40,
  maxOutputTokens: 128,
  maxBodyBytes: 1024,
  systemPrompt: "你是 SNN AI，由 SNN 社团提供的 AI 助手。",
};

async function withNode(fetchImpl, run, config = {}) {
  const server = createAiNodeServer({ ...baseConfig, ...config }, {
    fetchImpl,
    logger: { info() {} },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
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

test("status is offline when the runtime is unreachable", async () => {
  await withNode(
    async () => {
      throw new TypeError("connection refused");
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/status`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        online: false,
        model: null,
        status: "offline",
      });
    },
  );
});

test("status reports ready only after upstream models responds", async () => {
  await withNode(
    async () => new Response(JSON.stringify({ data: [{ id: "Qwen3-test" }] })),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/status`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        online: true,
        model: "Qwen3-test",
        status: "ready",
      });
    },
  );
});

test("chat forwards only validated messages and returns the website contract", async () => {
  let upstreamBody;
  await withNode(
    async (_url, init) => {
      upstreamBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "你好，我是 SNN AI。" } }] }),
      );
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.reply, "你好，我是 SNN AI。");
      assert.equal(body.model, "Qwen3-test");
      assert.match(body.requestId, /^[0-9a-f-]{36}$/);
      assert.equal(upstreamBody.model, "Qwen3-test");
      assert.equal(upstreamBody.stream, false);
      assert.equal(upstreamBody.max_tokens, 128);
      assert.equal(upstreamBody.messages[0].role, "system");
      assert.equal(upstreamBody.messages.at(-1).content, "你好");
      assert.deepEqual(upstreamBody.chat_template_kwargs, {
        enable_thinking: false,
        preserve_thinking: false,
      });
      assert.equal(upstreamBody.temperature, 0.7);
      assert.equal(upstreamBody.top_p, 0.8);
      assert.equal(upstreamBody.top_k, 20);
      assert.equal(upstreamBody.min_p, 0);
      assert.equal(upstreamBody.presence_penalty, 1.5);
      assert.equal("reasoning_effort" in upstreamBody, false);
    },
  );
});

test("chat rejects invalid input", async () => {
  await withNode(
    async () => new Response(),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "invalid", content: 123 }] }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "Invalid chat request");
    },
  );
});

test("node permits only configured browser origins", async () => {
  await withNode(
    async () => new Response(JSON.stringify({ data: [] })),
    async (baseUrl) => {
      const allowed = await fetch(`${baseUrl}/api/ai/status`, {
        headers: { origin: "http://127.0.0.1:8765" },
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:8765");

      const blocked = await fetch(`${baseUrl}/api/ai/status`, {
        headers: { origin: "http://localhost:9999" },
      });
      assert.equal(blocked.status, 403);
    },
  );
});

test("chat returns 504 when the upstream request times out", async () => {
  await withNode(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "测试" }] }),
      });
      assert.equal(response.status, 504);
      assert.equal((await response.json()).error, "SNN AI node is unavailable");
    },
    { chatTimeoutMs: 5 },
  );
});

test("chat returns 502 when the upstream responds with an error", async () => {
  await withNode(
    async () => new Response(JSON.stringify({ error: "runtime error" }), { status: 500 }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "测试" }] }),
      });
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, "SNN AI node is unavailable");
    },
  );
});

test("chat stream forwards split upstream SSE events as delta and done events", async () => {
  let upstreamBody;
  await withNode(
    async (_url, init) => {
      upstreamBody = JSON.parse(init.body);
      return sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"内部推理"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"你',
        '好"}}]}\n\n: keep-alive\n\ndata: {"choices":[{"delta":{"content":"，我是 SNN AI"}}]}\n\n',
        'data: [DONE]',
      ]);
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
      });
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
      assert.equal(upstreamBody.stream, true);
      assert.equal(upstreamBody.chat_template_kwargs.enable_thinking, false);
      assert.match(body, /event: delta\ndata: {"text":"你好"}/);
      assert.doesNotMatch(body, /内部推理/);
      assert.doesNotMatch(body, /event: reasoning_start/);
      assert.match(body, /event: delta\ndata: {"text":"，我是 SNN AI"}/);
      assert.match(body, /"thinking":false/);
      assert.match(body, /"reasoningObserved":false/);
    },
  );
});

test("thinking mode uses Qwen-compatible parameters without modifying user messages", async () => {
  let upstreamBody;
  await withNode(
    async (_url, init) => {
      upstreamBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "经过分析后的回答。" } }] }),
      );
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "解释 Transformer" }],
          thinking: true,
        }),
      });
      assert.equal(response.status, 200);
      await response.json();
      assert.equal(upstreamBody.messages.at(-1).content, "解释 Transformer");
      assert.deepEqual(upstreamBody.chat_template_kwargs, {
        enable_thinking: true,
        preserve_thinking: false,
      });
      assert.equal(upstreamBody.reasoning_effort, "xhigh");
      assert.equal(upstreamBody.temperature, 1.0);
      assert.equal(upstreamBody.top_p, 0.95);
      assert.equal(upstreamBody.top_k, 20);
      assert.equal(upstreamBody.min_p, 0);
      assert.equal(upstreamBody.presence_penalty, 0);
    },
  );
});

test("thinking stream emits reasoning_start before delta and reports observed reasoning", async () => {
  await withNode(
    async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"先分析问题"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"这是正式回答。"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    async (baseUrl) => {
      const response = await fetch(baseUrl + "/api/ai/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "解释 Transformer" }],
          thinking: true,
        }),
      });
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.ok(body.indexOf("event: reasoning_start") < body.indexOf("event: delta"));
      assert.match(body, /event: delta\ndata: {"text":"这是正式回答。"}/);
      assert.match(body, /"thinking":true/);
      assert.match(body, /"reasoningObserved":true/);
      assert.match(body, /"thinkingMs":\d+/);
      assert.doesNotMatch(body, /先分析问题/);
    },
  );
});

test("chat stream converts malformed upstream events into an SSE error", async () => {
  await withNode(
    async () => sseResponse(["data: not-json\n\n"]),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "测试" }] }),
      });
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.match(body, /event: error/);
      assert.match(body, /SNN AI node is unavailable/);
    },
  );
});
