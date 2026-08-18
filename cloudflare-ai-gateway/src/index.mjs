import { validateMessages } from "../../shared/ai-validation.mjs";

class OriginError extends Error {
  constructor(kind, status = null) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function allowedOrigins(environment) {
  return (environment.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(request, environment) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return { allowed: true, origin: null };
  }

  return { allowed: allowedOrigins(environment).includes(origin), origin };
}

function corsHeaders(origin) {
  if (!origin) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function jsonResponse(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

function sseResponse(body, origin) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      ...corsHeaders(origin),
    },
  });
}

function requestId() {
  return crypto.randomUUID();
}

function clientRateLimitKey(request) {
  return request.headers.get("cf-connecting-ip") || "unknown-client";
}

async function enforceRateLimit(binding, request) {
  if (!binding || typeof binding.limit !== "function") {
    throw new Error("Rate limiting binding is not configured");
  }

  const { success } = await binding.limit({ key: clientRateLimitKey(request) });
  return success;
}

function originUrl(environment, path) {
  const origin = new URL(environment.AI_ORIGIN_URL);
  if (origin.protocol !== "https:") {
    throw new Error("AI_ORIGIN_URL must use HTTPS");
  }
  return new URL(path.replace(/^\//, ""), `${origin.toString().replace(/\/+$/, "")}/`).toString();
}

function originHeaders(environment) {
  if (!environment.CF_ACCESS_CLIENT_ID || !environment.CF_ACCESS_CLIENT_SECRET) {
    throw new Error("Cloudflare Access service token is not configured");
  }

  return {
    "CF-Access-Client-Id": environment.CF_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": environment.CF_ACCESS_CLIENT_SECRET,
  };
}

async function fetchOrigin(fetchImpl, environment, path, init) {
  const controller = new AbortController();
  const timeoutMs = parsePositiveInteger(environment.AI_ORIGIN_TIMEOUT_MS, 45_000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(originUrl(environment, path), {
      ...init,
      headers: {
        ...originHeaders(environment),
        ...init.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OriginError("http", response.status);
    }

    return response;
  } catch (error) {
    if (error instanceof OriginError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new OriginError("timeout");
    }
    throw new OriginError("network");
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeLog(logger, data) {
  logger.log(JSON.stringify(data));
}

export async function handleRequest(request, environment, { fetchImpl = fetch, logger = console } = {}) {
  const startedAt = Date.now();
  const id = requestId();
  const url = new URL(request.url);
  const { allowed, origin } = isAllowedOrigin(request, environment);
  let responseStatus = 500;
  let originStatus = null;
  let rateLimited = false;

  try {
    if (!allowed) {
      responseStatus = 403;
      return jsonResponse(responseStatus, { error: "Origin is not allowed", requestId: id }, null);
    }

    const isStatus = url.pathname === "/api/ai/status";
    const isChat = url.pathname === "/api/ai/chat";
    const isChatStream = url.pathname === "/api/ai/chat/stream";
    if (!isStatus && !isChat && !isChatStream) {
      responseStatus = 404;
      return jsonResponse(responseStatus, { error: "Not found", requestId: id }, origin);
    }

    if (request.method === "OPTIONS") {
      responseStatus = 204;
      return new Response(null, { status: responseStatus, headers: corsHeaders(origin) });
    }

    if (isStatus && request.method === "GET") {
      const withinLimit = await enforceRateLimit(environment.AI_STATUS_RATE_LIMIT, request);
      if (!withinLimit) {
        rateLimited = true;
        responseStatus = 429;
        return jsonResponse(responseStatus, { error: "Too many requests", requestId: id }, origin);
      }

      try {
        const originResponse = await fetchOrigin(fetchImpl, environment, "/api/ai/status", {
          method: "GET",
        });
        originStatus = originResponse.status;
        const body = await originResponse.json();
        const validStatus =
          typeof body?.online === "boolean" && typeof body?.status === "string";
        responseStatus = 200;
        return jsonResponse(
          responseStatus,
          validStatus
            ? {
                online: body.online,
                model: typeof body.model === "string" ? body.model : null,
                status: body.status,
              }
            : { online: false, model: null, status: "offline" },
          origin,
        );
      } catch (error) {
        originStatus = error.status ?? null;
        responseStatus = 200;
        return jsonResponse(
          responseStatus,
          { online: false, model: null, status: "offline" },
          origin,
        );
      }
    }

    if ((isChat || isChatStream) && request.method === "POST") {
      const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
      const maxBytes = parsePositiveInteger(environment.MAX_CHAT_BODY_BYTES, 65_536);
      if (contentLength > maxBytes) {
        responseStatus = 413;
        return jsonResponse(responseStatus, { error: "Request is too large", requestId: id }, origin);
      }

      const bodyBytes = await request.arrayBuffer();
      if (bodyBytes.byteLength > maxBytes) {
        responseStatus = 413;
        return jsonResponse(responseStatus, { error: "Request is too large", requestId: id }, origin);
      }

      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bodyBytes));
      } catch {
        responseStatus = 400;
        return jsonResponse(responseStatus, { error: "Invalid chat request", requestId: id }, origin);
      }

      const messages = validateMessages(body?.messages);
      if (!messages) {
        responseStatus = 400;
        return jsonResponse(responseStatus, { error: "Invalid chat request", requestId: id }, origin);
      }

      const withinLimit = await enforceRateLimit(environment.AI_CHAT_RATE_LIMIT, request);
      if (!withinLimit) {
        rateLimited = true;
        responseStatus = 429;
        return jsonResponse(responseStatus, { error: "Too many requests", requestId: id }, origin);
      }

      if (isChatStream) {
        try {
          const originResponse = await fetchOrigin(fetchImpl, environment, "/api/ai/chat/stream", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages }),
          });
          originStatus = originResponse.status;
          responseStatus = 200;
          return sseResponse(originResponse.body, origin);
        } catch (error) {
          originStatus = error.status ?? null;
          responseStatus = error.kind === "timeout" ? 504 : 503;
          return jsonResponse(
            responseStatus,
            { error: "SNN AI service is unavailable", requestId: id },
            origin,
          );
        }
      }

      try {
        const originResponse = await fetchOrigin(fetchImpl, environment, "/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        originStatus = originResponse.status;
        const responseBody = await originResponse.json();
        if (typeof responseBody?.reply !== "string" || !responseBody.reply.trim()) {
          responseStatus = 503;
          return jsonResponse(
            responseStatus,
            { error: "SNN AI service is unavailable", requestId: id },
            origin,
          );
        }

        responseStatus = 200;
        return jsonResponse(
          responseStatus,
          {
            reply: responseBody.reply,
            ...(typeof responseBody.model === "string" ? { model: responseBody.model } : {}),
            ...(typeof responseBody.requestId === "string"
              ? { requestId: responseBody.requestId }
              : { requestId: id }),
          },
          origin,
        );
      } catch (error) {
        originStatus = error.status ?? null;
        responseStatus = error.kind === "timeout" ? 504 : 503;
        return jsonResponse(
          responseStatus,
          { error: "SNN AI service is unavailable", requestId: id },
          origin,
        );
      }
    }

    responseStatus = 405;
    return jsonResponse(responseStatus, { error: "Method not allowed", requestId: id }, origin);
  } catch {
    responseStatus = 503;
    return jsonResponse(responseStatus, { error: "SNN AI gateway is unavailable", requestId: id }, origin);
  } finally {
    safeLog(logger, {
      requestId: id,
      method: request.method,
      endpoint: url.pathname,
      status: responseStatus,
      durationMs: Date.now() - startedAt,
      rateLimited,
      originStatus,
    });
  }
}

const gateway = {
  fetch(request, environment) {
    return handleRequest(request, environment);
  },
};

export default gateway;
