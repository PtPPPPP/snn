import assert from "node:assert/strict";
import { request as nodeRequest } from "node:http";
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
  chatConnectTimeoutMs: 40,
  streamIdleTimeoutMs: 40,
  maxOutputTokens: 128,
  maxBodyBytes: 1024,
  systemPrompt: "你是 SNN AI，由 SNN 社团提供的 AI 助手。",
};

async function withNode(fetchImpl, run, config = {}, dependencies = {}) {
  const server = createAiNodeServer({ ...baseConfig, ...config }, {
    fetchImpl,
    logger: { info() {} },
    ...dependencies,
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

function delayedSseResponse(chunks, intervalMs) {
  const encoder = new TextEncoder();
  let timer;
  return new Response(new ReadableStream({
    start(controller) {
      let index = 0;
      timer = setInterval(() => {
        if (index === chunks.length) {
          clearInterval(timer);
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[index++]));
      }, intervalMs);
    },
    cancel() { clearInterval(timer); },
  }), { headers: { "content-type": "text/event-stream" } });
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
        capabilities: { thinking: false, webSearch: false, agent: false },
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
        capabilities: { thinking: true, webSearch: false, agent: false },
      });
    },
  );
});

test("status reports public Agent only after the runtime readiness probe succeeds", async () => {
  const configuredAgent = { enabled: true, host: "127.0.0.1", port: 8788, maxBodyBytes: 16_384, messageMaxLength: 16_384 };
  const configuredPublicAgent = { enabled: true };
  const readiness = {
    snapshot: () => ({ configured: true, state: "failed", runtimeReady: false, toolsReady: "unknown", modelToolCallingVerified: "unknown" }),
  };
  await withNode(
    async () => new Response(JSON.stringify({ data: [{ id: "Qwen3-test" }] })),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/status`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).capabilities, {
        thinking: true,
        webSearch: false,
        agent: false,
        attachments: false,
        agentReadiness: readiness.snapshot(),
      });
    },
    { agent: configuredAgent, publicAgent: configuredPublicAgent },
    { agentReadiness: readiness },
  );
});

test("status exposes the configured deployment revision without exposing configuration paths", async () => {
  await withNode(
    async () => new Response(JSON.stringify({ data: [{ id: "Qwen3-test" }] })),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/status`);
      assert.equal((await response.json()).releaseId, "923823b");
    },
    { releaseId: "923823b" },
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
    { chatConnectTimeoutMs: 5 },
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

test("web search queries local SearXNG and injects results into the local model prompt", async () => {
  let searchUrl;
  let upstreamUrl;
  let upstreamBody;
  await withNode(
    async (url, init) => {
      if (url.includes("/search")) {
        searchUrl = url;
        return Response.json({
          results: [
            { title: "AI 新闻一", url: "https://example.com/a", content: "摘要一" },
            { title: "AI 新闻二", url: "https://example.com/b", content: "摘要二" },
            { title: "坏数据", url: "" },
          ],
        });
      }
      upstreamUrl = url;
      upstreamBody = JSON.parse(init.body);
      return sseResponse(['data: {"choices":[{"delta":{"content":"联网回答"}}]}\n\n', "data: [DONE]\n\n"]);
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "今天有什么新闻？" }], thinking: true, webSearch: true }),
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /联网回答/);
    },
    { webSearch: { baseUrl: "http://127.0.0.1:8080", results: 2, timeoutMs: 40 } },
  );
  assert.match(searchUrl, /^http:\/\/127\.0\.0\.1:8080\/search\?q=.*&format=json$/);
  assert.equal(upstreamUrl, "http://127.0.0.1:8000/v1/chat/completions");
  assert.equal(upstreamBody.model, "Qwen3-test");
  const system = upstreamBody.messages[0];
  assert.equal(system.role, "system");
  assert.ok(system.content.startsWith(baseConfig.systemPrompt));
  assert.match(system.content, /SearXNG/);
  assert.match(system.content, /1\. AI 新闻一/);
  assert.match(system.content, /https:\/\/example\.com\/a/);
  assert.match(system.content, /摘要一/);
  assert.match(system.content, /2\. AI 新闻二/);
  assert.ok(!system.content.includes("坏数据"));
  assert.match(system.content, /当前服务器时间：/);
  assert.equal(upstreamBody.messages.at(-1).content, "今天有什么新闻？");
  assert.equal(upstreamBody.enable_search, undefined);
});

test("web search with empty SearXNG results falls back to the plain local prompt", async () => {
  let upstreamBody;
  await withNode(
    async (url, init) => {
      if (url.includes("/search")) {
        return Response.json({ results: [] });
      }
      upstreamBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "普通回答" } }] }));
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "你好" }], webSearch: true }),
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.reply, "普通回答");
      assert.equal(data.model, "Qwen3-test");
    },
    { webSearch: { baseUrl: "http://127.0.0.1:8080", results: 5, timeoutMs: 40 } },
  );
  assert.ok(upstreamBody.messages[0].content.startsWith(baseConfig.systemPrompt));
  assert.match(upstreamBody.messages[0].content, /当前服务器时间：/);
});

test("stream strips hallucinated tool-call blocks before deltas reach the client", async () => {
  await withNode(
    async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"好的，我来查。\\n<tool_call>\\n<function=searxng_web_search"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"(query=\\"time.is 北京时间\\")\\n</parameter>\\n</function>\\n</tool_call> 已查询到北京时间。"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    async (baseUrl) => {
      const response = await fetch(baseUrl + "/api/ai/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "你自己网页搜索 time.is" }] }),
      });
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.ok(!body.includes("tool_call"), "tool_call 标签不应到达客户端");
      assert.ok(!body.includes("searxng_web_search"), "幻觉工具名不应到达客户端");
      assert.ok(!body.includes("function="), "函数调用块不应到达客户端");
      assert.ok(!body.includes("parameter"), "函数参数块不应到达客户端");
      assert.ok(body.includes("好的，我来查。"), "块前文本应保留");
      assert.ok(body.includes("已查询到北京时间。"), "块后文本应保留");
      assert.ok(body.includes("event: done"), "流应正常结束");
    },
  );
});

test("chat reply strips hallucinated tool-call blocks", async () => {
  await withNode(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '<tool_call>\n<function=searxng_web_search>\n<parameter=query>time.is</parameter>\n</function>\n</tool_call> 北京时间是 14:30。',
              },
            },
          ],
        }),
      ),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "你自己搜 time.is" }] }),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.reply, "北京时间是 14:30。");
    },
  );
});

test("web search toggle off skips SearXNG even when search is configured", async () => {
  let searchHit = false;
  let upstreamBody;
  await withNode(
    async (url, init) => {
      if (url.includes("/search")) {
        searchHit = true;
        return Response.json({ results: [{ title: "不该被查到", url: "https://example.com/x" }] });
      }
      upstreamBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "普通回答" } }] }));
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).reply, "普通回答");
    },
    { webSearch: { baseUrl: "http://127.0.0.1:8080", results: 5, timeoutMs: 40 } },
  );
  assert.equal(searchHit, false, "未开启开关时不应请求 SearXNG");
  assert.ok(upstreamBody.messages[0].content.startsWith(baseConfig.systemPrompt));
  assert.doesNotMatch(upstreamBody.messages[0].content, /SearXNG 聚合搜索/);
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

test("malformed upstream stream terminates once with error and never sends done", async () => {
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
      assert.equal((body.match(/event: error/g) ?? []).length, 1);
      assert.equal((body.match(/event: done/g) ?? []).length, 0);
      assert.match(body, /SNN AI node is unavailable/);
    },
  );
});

test("chat stream aborts an idle model stream and emits error without done", async () => {
  let upstreamSignal;
  await withNode(
    async (_url, init) => {
      upstreamSignal = init.signal;
      return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/event-stream" } });
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "测试" }] }),
      });
      const body = await response.text();
      assert.equal(upstreamSignal.aborted, true);
      assert.equal((body.match(/event: error/g) ?? []).length, 1);
      assert.equal((body.match(/event: done/g) ?? []).length, 0);
      assert.match(body, /"code":"stream_timeout"/);
    },
    { streamIdleTimeoutMs: 5 },
  );
});

test("chat stream remains active while model chunks arrive before idle timeout", async () => {
  await withNode(
    async () => delayedSseResponse([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
      "data: [DONE]\n\n",
    ], 5),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/chat/stream`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "测试" }] }),
      });
      const body = await response.text();
      assert.match(body, /"text":"A"/);
      assert.match(body, /"text":"B"/);
      assert.match(body, /event: done/);
      assert.doesNotMatch(body, /event: error/);
    },
    { streamIdleTimeoutMs: 20 },
  );
});

test("downstream disconnect aborts the active model request", async () => {
  let upstreamSignal;
  await withNode(
    async (_url, init) => {
      upstreamSignal = init.signal;
      return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/event-stream" } });
    },
    async (baseUrl) => {
      await new Promise((resolve, reject) => {
        const client = nodeRequest(`${baseUrl}/api/ai/chat/stream`, {
          method: "POST", headers: { "content-type": "application/json" },
        });
        client.once("response", () => {
          client.destroy();
          setTimeout(resolve, 10);
        });
        client.once("error", (error) => {
          if (error.code !== "ECONNRESET") reject(error);
        });
        client.end(JSON.stringify({ messages: [{ role: "user", content: "测试" }] }));
      });
      assert.equal(upstreamSignal.aborted, true);
    },
    { streamIdleTimeoutMs: 100 },
  );
});
