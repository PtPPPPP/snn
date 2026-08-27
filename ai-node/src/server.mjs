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

function buildUpstreamBody(config, messages, stream, thinking, webSearch) {
  if (webSearch) {
    return JSON.stringify({
      model: config.webSearch.model,
      messages: [{ role: "system", content: config.systemPrompt }, ...messages],
      stream,
      max_tokens: config.maxOutputTokens,
      enable_search: true,
      search_options: { forced_search: true },
      enable_thinking: thinking,
    });
  }
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
    messages: [{ role: "system", content: config.systemPrompt }, ...messages],
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
      if (reasoningObserved && thinkingMs === null) {
        thinkingMs = Math.round(performance.now() - reasoningStartedAt);
      }
      writeSse(response, "delta", { text });
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
          const target = webSearch ? config.webSearch : { baseUrl: config.upstreamBaseUrl, apiKey: config.upstreamApiKey, model: config.model };
          const upstreamResponse = await fetchUpstream(
            fetchImpl,
            upstreamUrl(target.baseUrl, "chat/completions"),
            {
              method: "POST",
              headers: upstreamHeaders(target.apiKey),
              body: buildUpstreamBody(config, messages, false, thinking, webSearch),
            },
            config.chatConnectTimeoutMs,
          );
          upstreamStatus = upstreamResponse.status;
          const upstreamBody = await upstreamResponse.json();
          const reply = upstreamBody?.choices?.[0]?.message?.content;
          if (typeof reply !== "string" || !reply.trim()) {
            sendJson(response, 502, { error: "SNN AI node is unavailable", requestId }, origin);
            return;
          }

          sendJson(response, 200, { reply: reply.trim(), model: target.model, requestId }, origin);
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
        const target = webSearch ? config.webSearch : { baseUrl: config.upstreamBaseUrl, apiKey: config.upstreamApiKey, model: config.model };
        const upstreamResponse = await fetchUpstream(
          fetchImpl,
          upstreamUrl(target.baseUrl, "chat/completions"),
          {
            method: "POST",
            headers: upstreamHeaders(target.apiKey),
            body: buildUpstreamBody(config, messages, true, thinking, webSearch),
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
          target.model,
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
