const DEFAULT_ALLOWED_ORIGINS = ["http://127.0.0.1:8765", "http://localhost:8765"];

function readPositiveInteger(value, fallback, name) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function normalizeUpstreamBaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error("QWEN_UPSTREAM_BASE_URL must use http://127.0.0.1");
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function loadConfig(environment = process.env) {
  const host = environment.SNN_AI_NODE_HOST || "127.0.0.1";
  if (host !== "127.0.0.1") {
    throw new Error("SNN AI Node must listen on 127.0.0.1 only");
  }

  const allowedOrigins = (environment.SNN_AI_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    host,
    port: readPositiveInteger(environment.SNN_AI_NODE_PORT, 8787, "SNN_AI_NODE_PORT"),
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ALLOWED_ORIGINS,
    upstreamBaseUrl: normalizeUpstreamBaseUrl(
      environment.QWEN_UPSTREAM_BASE_URL || "http://127.0.0.1:8000/v1",
    ),
    upstreamApiKey: environment.QWEN_UPSTREAM_API_KEY || "",
    model: environment.QWEN_MODEL || "",
    statusTimeoutMs: readPositiveInteger(
      environment.AI_STATUS_TIMEOUT_MS,
      4_000,
      "AI_STATUS_TIMEOUT_MS",
    ),
    chatTimeoutMs: readPositiveInteger(
      environment.AI_CHAT_TIMEOUT_MS,
      45_000,
      "AI_CHAT_TIMEOUT_MS",
    ),
    maxOutputTokens: readPositiveInteger(
      environment.AI_MAX_OUTPUT_TOKENS,
      512,
      "AI_MAX_OUTPUT_TOKENS",
    ),
    maxBodyBytes: readPositiveInteger(
      environment.AI_MAX_BODY_BYTES,
      65_536,
      "AI_MAX_BODY_BYTES",
    ),
    systemPrompt:
      environment.AI_SYSTEM_PROMPT || "你是 SNN AI，由 SNN 社团提供的 AI 助手。",
  };
}
