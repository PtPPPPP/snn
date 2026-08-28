import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { normalizeThinking, normalizeWebSearch, validateMessages } from "../../shared/ai-validation.mjs";
import { parseSseEvent, takeSseEvents } from "./sse.mjs";

class UpstreamError extends Error {
  constructor(kind, status = null) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

function corsHeaders(origin) {
  return origin
    ? {
        "access-control-allow-origin": origin,
        // Required for the frontend's credentials:"include" cross-origin calls
        // (e.g. agent-client getAgentStatus from snnai.cn -> api.snnai.cn).
        // Only ever sent for allowlisted origins (requestOrigin gates it), and
        // the echoed origin is exact (never a wildcard), so this is safe.
        "access-control-allow-credentials": "true",
        vary: "Origin",
      }
    : {};
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(origin),
  });
  response.end(JSON.stringify(body));
}

function beginSse(response, origin) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    ...corsHeaders(origin),
  });
  response.flushHeaders?.();
}

function writeSse(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function logRequest(logger, data) {
  logger.info(JSON.stringify(data));
}

function requestOrigin(request, config) {
  const origin = request.headers.origin;
  if (!origin) {
    return { allowed: true, origin: undefined };
  }

  return { allowed: config.allowedOrigins.includes(origin), origin };
}

function upstreamUrl(baseUrl, path) {
  return new URL(path.replace(/^\//, ""), `${baseUrl}/`).toString();
}

async function fetchUpstream(fetchImpl, url, init, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;

  try {
    const response = await fetchImpl(url, { ...init, signal });
    if (!response.ok) {
      throw new UpstreamError("http", response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof UpstreamError) {
      throw error;
    }
    if (externalSignal?.aborted) {
      throw new UpstreamError("aborted");
    }
    if (error?.name === "AbortError") {
      throw new UpstreamError("timeout");
    }
    throw new UpstreamError("network");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readJsonBody(request, maxBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("body_too_large");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

function upstreamHeaders(apiKey) {
  const headers = { "content-type": "application/json" };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function upstreamFailureStatus(error) {
  return error.kind === "timeout" ? 504 : error.kind === "network" ? 503 : 502;
}

async function runtimeReady(config, fetchImpl) {
  if (!config.model) {
    return false;
  }

  const response = await fetchUpstream(
    fetchImpl,
    upstreamUrl(config.upstreamBaseUrl, "models"),
    { method: "GET", headers: upstreamHeaders(config.upstreamApiKey) },
    config.statusTimeoutMs,
  );
  await response.json();
  return true;
}

function lastUserQuery(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user" && messages[i].content) {
      return messages[i].content;
    }
  }
  return "";
}

async function fetchSearchResults(config, query, fetchImpl, externalSignal) {
  const url = new URL("search", `${config.webSearch.baseUrl}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  const response = await fetchUpstream(
    fetchImpl,
    url.toString(),
    { method: "GET" },
    config.webSearch.timeoutMs,
    externalSignal,
  );

  const data = await response.json();
  const raw = Array.isArray(data?.results) ? data.results : [];

  return raw
    .filter(
      (item) =>
        item &&
        typeof item.url === "string" &&
        item.url &&
        typeof item.title === "string" &&
        item.title,
    )
    .slice(0, config.webSearch.results)
    .map((item) => ({
      title: item.title.trim(),
      url: item.url.trim(),
      snippet: typeof item.content === "string" ? item.content.trim() : "",
    }));
}

function buildSearchContext(results) {
  const lines = results.map((item, index) => {
    const parts = [`${index + 1}. ${item.title}`, `   URL: ${item.url}`];
    if (item.snippet) {
      parts.push(`   ${item.snippet}`);
    }
    return parts.join("\n");
  });

  return [
    "以下是系统在你提问前替你查好的实时联网搜索结果（来源：SearXNG 聚合搜索）。",
    "你没有工具、函数或代码执行能力，不需要也绝不能调用 searxng_web_search 或任何函数；",
    "禁止输出 tool_call、function、parameter 等标签块——直接基于下面的结果用纯文本回答：",
    "",
    ...lines,
    "",
    "要求：优先采用搜索结果中的信息；引用关键事实时标注来源编号（如 [1]）并附 URL；",
    "如果搜索结果与问题无关或信息不足，直接说明并明确区分你的既有知识与搜索到的内容，不要编造来源。",
  ].join("\n");
}

function withSearchContext(config, messages, results) {
  const systemContent = `${config.systemPrompt}\n\n${buildSearchContext(results)}`;
  return [{ role: "system", content: systemContent }, ...messages];
}

async function applySearchContext(config, messages, webSearch, fetchImpl, externalSignal) {
  if (!webSearch || !config.webSearch) {
    return { messages, systemContent: config.systemPrompt };
  }

  const results = await fetchSearchResults(config, lastUserQuery(messages), fetchImpl, externalSignal);
  if (results.length === 0) {
    return { messages, systemContent: config.systemPrompt };
  }

  const withContext = withSearchContext(config, messages, results);
  return { systemContent: withContext[0].content, messages: withContext.slice(1) };
}

function currentServerTimeLine(now = new Date()) {
  const local = now.toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" });
  return `当前服务器时间：${local}（${now.toISOString()} UTC）。回答涉及"现在/今天/最近"的问题时以该时间为准，不要声称无法获取时间。`;
}

// 兜底：模型偶尔会幻觉出不存在的工具调用块（如 <tool_call>...）。
// 这些块绝不该到达客户端。非流式直接正则剥除；流式用状态机，
// 避免把恰好跨 chunk 的标签截成半截发给前端。
const TOOL_CALL_OPEN = "<tool_call>";
const TOOL_CALL_CLOSE = "</tool_call>";

function stripToolCallBlocks(text) {
  if (typeof text !== "string") {
    return text;
  }
  return text
    .replace(new RegExp(TOOL_CALL_OPEN + "[\\s\\S]*?" + TOOL_CALL_CLOSE, "g"), "")
    .replace(new RegExp(TOOL_CALL_OPEN + "[\\s\\S]*$", ""), "");
}

function createToolCallFilter() {
  let pending = "";
  let inside = false;

  function prefixOverlap(text) {
    const max = Math.min(text.length, TOOL_CALL_OPEN.length - 1);
    for (let len = max; len > 0; len -= 1) {
      if (text.endsWith(TOOL_CALL_OPEN.slice(0, len))) {
        return len;
      }
    }
    return 0;
  }

  return {
    // 输入一个 content delta，返回可以安全发给客户端的文本。
    push(chunk) {
      if (typeof chunk !== "string" || chunk.length === 0) {
        return "";
      }
      // 上一 chunk 扣下的尾巴（可能是半个开/闭标签）必须拼回来，否则跨 chunk 的标签会漏检。
      chunk = pending + chunk;
      pending = "";
      let out = "";
      let cursor = 0;
      while (cursor < chunk.length) {
        if (!inside) {
          const idx = chunk.indexOf(TOOL_CALL_OPEN, cursor);
          if (idx === -1) {
            const rest = chunk.slice(cursor);
            const hold = prefixOverlap(rest);
            out += rest.slice(0, rest.length - hold);
            pending = rest.slice(rest.length - hold);
            break;
          }
          out += chunk.slice(cursor, idx);
          // 跳过整个开标签，从块内容开始找闭合标签。
          cursor = idx + TOOL_CALL_OPEN.length;
          pending = "";
          inside = true;
        } else {
          const idx = chunk.indexOf(TOOL_CALL_CLOSE, cursor);
          if (idx === -1) {
            pending = chunk.slice(cursor);
            // 只保留可能成为 TOOL_CALL_CLOSE 前缀的尾巴，丢弃块内其余内容。
            const max = Math.min(pending.length, TOOL_CALL_CLOSE.length - 1);
            let hold = 0;
            for (let len = max; len > 0; len -= 1) {
              if (pending.endsWith(TOOL_CALL_CLOSE.slice(0, len))) {
                hold = len;
                break;
              }
            }
            pending = pending.slice(pending.length - hold);
            break;
          }
          cursor = idx + TOOL_CALL_CLOSE.length;
          inside = false;
          pending = "";
        }
      }
      return out;
    },
    // 流结束：未闭合的块丢弃，其余 pending 文本放行。
    flush() {
      if (inside) {
        pending = "";
        return "";
      }
      const out = pending;
      pending = "";
      return out;
    },
  };
}

function buildUpstreamBody(config, messages, stream, thinking, systemContent = config.systemPrompt) {
  const thinkingParameters = thinking
    ? {
        chat_template_kwargs: {
          enable_thinking: true,
          preserve_thinking: false,
        },
        reasoning_effort: "xhigh",
        temperature: 1.0,
        top_p: 0.95,
        top_k: 20,
        min_p: 0,
        presence_penalty: 0,
      }
    : {
        chat_template_kwargs: {
          enable_thinking: false,
          preserve_thinking: false,
        },
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0,
        presence_penalty: 1.5,
      };

  return JSON.stringify({
    model: config.model,
    messages: [{ role: "system", content: `${systemContent}\n\n${currentServerTimeLine()}` }, ...messages],
    stream,
    max_tokens: config.maxOutputTokens,
    ...thinkingParameters,
  });
}

async function forwardSse(upstreamResponse, response, config, requestId, upstreamController, thinking, model) {
  if (!upstreamResponse.body) {
    throw new UpstreamError("response");
  }

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let reasoningObserved = false;
  let reasoningStartedAt = null;
  let thinkingMs = null;
  const toolCallFilter = createToolCallFilter();

  function readWithIdleTimeout() {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new UpstreamError("idle_timeout")), config.streamIdleTimeoutMs);
      reader.read().then(
        (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      );
    });
  }

  function handleEvent(eventBlock) {
    const event = parseSseEvent(eventBlock);
    if (!event) {
      return;
    }

    if (event.done) {
      done = true;
      const tail = toolCallFilter.flush();
      if (tail) {
        writeSse(response, "delta", { text: tail });
      }
      writeSse(response, "done", {
        model,
        requestId,
        thinking,
        reasoningObserved,
        ...(reasoningObserved
          ? { thinkingMs: thinkingMs ?? Math.round(performance.now() - reasoningStartedAt) }
          : {}),
      });
      return;
    }

    if (event.invalid) {
      throw new UpstreamError("response");
    }

    const delta = event.payload?.choices?.[0]?.delta;
    const reasoning = delta?.reasoning_content ?? delta?.reasoning;
    if (thinking && typeof reasoning === "string" && reasoning.length > 0) {
      if (!reasoningObserved) {
        reasoningObserved = true;
        reasoningStartedAt = performance.now();
        writeSse(response, "reasoning_start", {});
      }
      // Keep model reasoning internal. The UI only receives an observed-status event.
      return;
    }

    const text = delta?.content;
    if (typeof text === "string" && text.length > 0) {
      const safe = toolCallFilter.push(text);
      if (reasoningObserved && thinkingMs === null && safe.length > 0) {
        thinkingMs = Math.round(performance.now() - reasoningStartedAt);
      }
      if (safe.length > 0) {
        writeSse(response, "delta", { text: safe });
      }
    }
  }

  try {
    while (!done) {
      const { done: streamDone, value } = await readWithIdleTimeout();
      if (streamDone) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parsed = takeSseEvents(buffer);
      buffer = parsed.remaining;
      parsed.events.forEach(handleEvent);
    }

    buffer += decoder.decode();
    const trailing = takeSseEvents(buffer);
    trailing.events.forEach(handleEvent);
    if (trailing.remaining.trim()) {
      handleEvent(trailing.remaining);
    }

    if (!done) {
      throw new UpstreamError("response");
    }
  } catch (error) {
    if (error instanceof UpstreamError) {
      if (error.kind === "idle_timeout") {
        upstreamController.abort();
        await reader.cancel().catch(() => {});
      }
      throw error;
    }
    if (upstreamController.signal.aborted) {
      throw new UpstreamError("aborted");
    }
    throw error instanceof UpstreamError ? error : new UpstreamError("network");
  } finally {
    reader.releaseLock();
  }
}

function agentCapabilities(config, agentReadiness) {
  if (!config.agent?.enabled || !config.publicAgent?.enabled || !agentReadiness?.snapshot) return { agent: false };
  const readiness = agentReadiness.snapshot();
  return { agent: readiness.runtimeReady, attachments: readiness.runtimeReady, agentReadiness: readiness };
}

function statusBody(config, online, agentCaps) {
  const body = online
    ? { online: true, model: config.model, status: "ready", capabilities: { thinking: true, webSearch: Boolean(config.webSearch), ...agentCaps } }
    : { online: false, model: null, status: "offline", capabilities: { thinking: false, webSearch: false, ...agentCaps } };
  if (config.releaseId) body.releaseId = config.releaseId;
  return body;
}

export function createAiNodeServer(config, { fetchImpl = fetch, logger = console, publicBff = null, agentReadiness = null } = {}) {
  return createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const { allowed, origin } = requestOrigin(request, config);
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    // Public Agent BFF is the only Internet-facing agent boundary; it must handle before generic fallback
    if (publicBff && publicBff.isPublicAgentPath(path)) {
      // Enforce feature flag already at BFF level, but double-check
      if (!config.publicAgent?.enabled) {
        sendJson(response, 404, { error: "Not found", requestId }, origin);
        logRequest(logger, { requestId, endpoint: path, status: 404, durationMs: Date.now() - startedAt, upstreamStatus: null });
        return;
      }
      try {
        const handled = await publicBff.handlePublicRequest(request, response);
        // If BFF handled, we have already sent response; just log and return
        if (handled) {
          logRequest(logger, { requestId, endpoint: path, status: response.statusCode, durationMs: Date.now() - startedAt, upstreamStatus: null });
          return;
        }
      } catch {
        // BFF should have handled errors internally, but fallback sanitize
        if (!response.headersSent) sendJson(response, 500, { error: "Agent service is unavailable", requestId }, origin);
        else if (!response.writableEnded) response.end();
        logRequest(logger, { requestId, endpoint: path, status: response.statusCode, durationMs: Date.now() - startedAt, upstreamStatus: null });
        return;
      }
      // If not handled, fall through to 404 below
    }
    const isStatus = path === "/api/ai/status";
    const isChat = path === "/api/ai/chat";
    const isChatStream = path === "/api/ai/chat/stream";
    let upstreamStatus = null;

    try {
      if (!allowed) {
        sendJson(response, 403, { error: "Origin is not allowed", requestId });
        return;
      }

      if (!isStatus && !isChat && !isChatStream) {
        sendJson(response, 404, { error: "Not found", requestId }, origin);
        return;
      }

      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          ...corsHeaders(origin),
        });
        response.end();
        return;
      }

      if (request.method === "GET" && isStatus) {
        try {
          const online = await runtimeReady(config, fetchImpl);
          const agentCaps = agentCapabilities(config, agentReadiness);
          sendJson(
            response,
            200,
            statusBody(config, online, agentCaps),
            origin,
          );
        } catch (error) {
          upstreamStatus = error.status ?? null;
          const agentCaps = agentCapabilities(config, agentReadiness);
          sendJson(response, 200, statusBody(config, false, agentCaps), origin);
        }
        return;
      }

      if (request.method !== "POST" || (!isChat && !isChatStream)) {
        sendJson(response, 405, { error: "Method not allowed", requestId }, origin);
        return;
      }

      let body;
      try {
        body = await readJsonBody(request, config.maxBodyBytes);
      } catch {
        sendJson(response, 400, { error: "Invalid chat request", requestId }, origin);
        return;
      }

      const messages = validateMessages(body?.messages);
      if (!messages) {
        sendJson(response, 400, { error: "Invalid chat request", requestId }, origin);
        return;
      }

      const thinking = normalizeThinking(body?.thinking);
      const webSearch = normalizeWebSearch(body?.webSearch);

      if (webSearch && !config.webSearch) {
        const error = { error: "联网搜索暂时不可用，请关闭联网搜索后重试。", code: "web_search_unavailable", requestId };
        if (isChatStream) { beginSse(response, origin); writeSse(response, "error", error); response.end(); }
        else sendJson(response, 503, error, origin);
        return;
      }

      if (!config.model && !webSearch) {
        if (isChatStream) {
          beginSse(response, origin);
          writeSse(response, "error", { error: "SNN AI node is unavailable", requestId });
          response.end();
        } else {
          sendJson(response, 503, { error: "SNN AI node is unavailable", requestId }, origin);
        }
        return;
      }

      if (isChat) {
        try {
          const search = await applySearchContext(config, messages, webSearch, fetchImpl);
          const upstreamResponse = await fetchUpstream(
            fetchImpl,
            upstreamUrl(config.upstreamBaseUrl, "chat/completions"),
            {
              method: "POST",
              headers: upstreamHeaders(config.upstreamApiKey),
              body: buildUpstreamBody(config, search.messages, false, thinking, search.systemContent),
            },
            config.chatConnectTimeoutMs,
          );
          upstreamStatus = upstreamResponse.status;
          const upstreamBody = await upstreamResponse.json();
          const rawReply = upstreamBody?.choices?.[0]?.message?.content;
          const reply = typeof rawReply === "string" ? stripToolCallBlocks(rawReply).trim() : "";
          if (!reply) {
            upstreamStatus = 502;
            sendJson(response, 502, { error: "SNN AI node is unavailable", requestId }, origin);
            return;
          }

          sendJson(response, 200, { reply, model: config.model, requestId }, origin);
        } catch (error) {
          upstreamStatus = error.status ?? null;
          sendJson(
            response,
            upstreamFailureStatus(error),
            { error: "SNN AI node is unavailable", requestId },
            origin,
          );
        }
        return;
      }

      const upstreamAbortController = new AbortController();
      let clientDisconnected = false;
      const abortUpstream = () => {
        clientDisconnected = true;
        upstreamAbortController.abort();
      };
      request.once("aborted", abortUpstream);
      response.once("close", () => {
        if (!response.writableEnded) {
          abortUpstream();
        }
      });

      beginSse(response, origin);
      try {
        const search = await applySearchContext(config, messages, webSearch, fetchImpl, upstreamAbortController.signal);
        const upstreamResponse = await fetchUpstream(
          fetchImpl,
          upstreamUrl(config.upstreamBaseUrl, "chat/completions"),
          {
            method: "POST",
            headers: upstreamHeaders(config.upstreamApiKey),
            body: buildUpstreamBody(config, search.messages, true, thinking, search.systemContent),
          },
            config.chatConnectTimeoutMs,
            upstreamAbortController.signal,
        );
        upstreamStatus = upstreamResponse.status;
        await forwardSse(
          upstreamResponse,
          response,
          config,
          requestId,
          upstreamAbortController,
          thinking,
          config.model,
        );
      } catch (error) {
        upstreamStatus = error.status ?? null;
        if (!clientDisconnected && !response.writableEnded) {
          writeSse(response, "error", {
            error: "SNN AI node is unavailable",
            code: error.kind === "idle_timeout" ? "stream_timeout" : "upstream_unavailable",
            requestId,
          });
        }
      } finally {
        request.removeListener("aborted", abortUpstream);
        if (!response.writableEnded) {
          response.end();
        }
      }
    } finally {
      logRequest(logger, {
        requestId,
        endpoint: path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        upstreamStatus,
      });
    }
  });
}
