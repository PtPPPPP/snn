import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const VALID_ROLES = new Set(["assistant", "system", "user"]);
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARACTERS = 12_000;
const MAX_TOTAL_CHARACTERS = 48_000;

class UpstreamError extends Error {
  constructor(kind, status) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

function sendJson(response, status, body, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };

  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }

  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

function logRequest(logger, data) {
  logger.info(JSON.stringify(data));
}

function requestOrigin(request, config) {
  const origin = request.headers.origin;
  if (!origin) {
    return { allowed: true, origin: undefined };
  }

  return {
    allowed: config.allowedOrigins.includes(origin),
    origin,
  };
}

function upstreamUrl(config, path) {
  return new URL(path.replace(/^\//, ""), `${config.upstreamBaseUrl}/`).toString();
}

async function fetchUpstream(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new UpstreamError("http", response.status);
    }

    return response;
  } catch (error) {
    if (error instanceof UpstreamError) {
      throw error;
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

function validateMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return null;
  }

  let totalCharacters = 0;
  const messages = [];

  for (const message of value) {
    if (
      !message ||
      typeof message !== "object" ||
      !VALID_ROLES.has(message.role) ||
      typeof message.content !== "string"
    ) {
      return null;
    }

    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARACTERS) {
      return null;
    }

    totalCharacters += content.length;
    if (totalCharacters > MAX_TOTAL_CHARACTERS) {
      return null;
    }

    messages.push({ role: message.role, content });
  }

  return messages;
}

function upstreamHeaders(config) {
  const headers = { "content-type": "application/json" };
  if (config.upstreamApiKey) {
    headers.authorization = `Bearer ${config.upstreamApiKey}`;
  }
  return headers;
}

async function runtimeReady(config, fetchImpl) {
  if (!config.model) {
    return false;
  }

  const response = await fetchUpstream(
    fetchImpl,
    upstreamUrl(config, "models"),
    { method: "GET", headers: upstreamHeaders(config) },
    config.statusTimeoutMs,
  );
  await response.json();
  return true;
}

function upstreamFailureStatus(error) {
  return error.kind === "timeout" ? 504 : error.kind === "network" ? 503 : 502;
}

export function createAiNodeServer(config, { fetchImpl = fetch, logger = console } = {}) {
  return createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const { allowed, origin } = requestOrigin(request, config);
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    let upstreamStatus = null;

    if (!allowed) {
      sendJson(response, 403, { error: "Origin is not allowed", requestId });
      logRequest(logger, {
        requestId,
        endpoint: path,
        status: 403,
        durationMs: Date.now() - startedAt,
        upstreamStatus,
      });
      return;
    }

    if (request.method === "OPTIONS") {
      const headers = origin
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type",
            vary: "Origin",
          }
        : {};
      response.writeHead(204, headers);
      response.end();
      return;
    }

    try {
      if (request.method === "GET" && path === "/api/ai/status") {
        try {
          const online = await runtimeReady(config, fetchImpl);
          sendJson(
            response,
            200,
            online
              ? { online: true, model: config.model, status: "ready" }
              : { online: false, model: null, status: "offline" },
            origin,
          );
        } catch (error) {
          upstreamStatus = error.status ?? null;
          sendJson(response, 200, { online: false, model: null, status: "offline" }, origin);
        }
        return;
      }

      if (request.method === "POST" && path === "/api/ai/chat") {
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

        if (!config.model) {
          sendJson(response, 503, { error: "SNN AI node is unavailable", requestId }, origin);
          return;
        }

        try {
          const upstreamResponse = await fetchUpstream(
            fetchImpl,
            upstreamUrl(config, "chat/completions"),
            {
              method: "POST",
              headers: upstreamHeaders(config),
              body: JSON.stringify({
                model: config.model,
                messages: [
                  { role: "system", content: config.systemPrompt },
                  ...messages,
                ],
                stream: false,
                max_tokens: config.maxOutputTokens,
              }),
            },
            config.chatTimeoutMs,
          );

          upstreamStatus = upstreamResponse.status;
          const upstreamBody = await upstreamResponse.json();
          const reply = upstreamBody?.choices?.[0]?.message?.content;
          if (typeof reply !== "string" || !reply.trim()) {
            sendJson(response, 502, { error: "SNN AI node is unavailable", requestId }, origin);
            return;
          }

          sendJson(
            response,
            200,
            { reply: reply.trim(), model: config.model, requestId },
            origin,
          );
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

      sendJson(response, 404, { error: "Not found", requestId }, origin);
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
