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

function readBoolean(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function readCsv(value, name) {
  if (!value) return [];
  const names = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!names.every((item) => /^[A-Z][A-Z0-9_]*$/.test(item))) throw new Error(`${name} contains an invalid environment variable name`);
  return [...new Set(names)];
}

function requireConfigString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required when SNN_AGENT_INTERNAL_ENABLED=true`);
  return value.trim();
}

function readJsonStringArray(value, name) {
  if (!value) return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${name} must be a JSON string array`); }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string" && item.length > 0)) {
    throw new Error(`${name} must be a JSON string array`);
  }
  return parsed;
}

function loadAgentConfig(environment) {
  const enabled = readBoolean(environment.SNN_AGENT_INTERNAL_ENABLED, false, "SNN_AGENT_INTERNAL_ENABLED");
  const host = environment.SNN_AGENT_INTERNAL_HOST || "127.0.0.1";
  if (host !== "127.0.0.1") throw new Error("SNN Agent Internal API must listen on 127.0.0.1 only");
  const base = {
    enabled,
    host,
    port: readPositiveInteger(environment.SNN_AGENT_INTERNAL_PORT, 8788, "SNN_AGENT_INTERNAL_PORT"),
    maxBodyBytes: readPositiveInteger(environment.SNN_AGENT_INTERNAL_MAX_BODY_BYTES, 16_384, "SNN_AGENT_INTERNAL_MAX_BODY_BYTES"),
    messageMaxLength: readPositiveInteger(environment.SNN_AGENT_INTERNAL_MESSAGE_MAX_LENGTH, 16_384, "SNN_AGENT_INTERNAL_MESSAGE_MAX_LENGTH"),
  };
  if (!enabled) return base;

  const passthrough = readCsv(environment.SNN_AGENT_DSH_ENV_PASSTHROUGH, "SNN_AGENT_DSH_ENV_PASSTHROUGH");
  const required = readCsv(environment.SNN_AGENT_DSH_ENV_REQUIRED, "SNN_AGENT_DSH_ENV_REQUIRED");
  const missing = required.filter((name) => !environment[name]);
  if (missing.length > 0) throw new Error(`Missing required DSH environment: ${missing.join(",")}`);
  return {
    ...base,
    sdkPath: requireConfigString(environment.SNN_AGENT_DSH_SDK_PATH, "SNN_AGENT_DSH_SDK_PATH"),
    toolHostPath: requireConfigString(environment.SNN_AGENT_DSH_TOOL_HOST_PATH, "SNN_AGENT_DSH_TOOL_HOST_PATH"),
    workspaceId: requireConfigString(environment.SNN_AGENT_WORKSPACE_ID, "SNN_AGENT_WORKSPACE_ID"),
    sessionMetadataRoot: requireConfigString(environment.SNN_AGENT_SESSION_METADATA_ROOT, "SNN_AGENT_SESSION_METADATA_ROOT"),
    runtimeExecutable: requireConfigString(environment.SNN_AGENT_DSH_RUNTIME_EXECUTABLE, "SNN_AGENT_DSH_RUNTIME_EXECUTABLE"),
    runtimeArguments: readJsonStringArray(environment.SNN_AGENT_DSH_RUNTIME_ARGUMENTS, "SNN_AGENT_DSH_RUNTIME_ARGUMENTS"),
    cordisConfig: requireConfigString(environment.SNN_AGENT_DSH_CORDIS_CONFIG, "SNN_AGENT_DSH_CORDIS_CONFIG"),
    runtimeCwd: requireConfigString(environment.SNN_AGENT_DSH_RUNTIME_CWD, "SNN_AGENT_DSH_RUNTIME_CWD"),
    provider: requireConfigString(environment.SNN_AGENT_DSH_PROVIDER, "SNN_AGENT_DSH_PROVIDER"),
    model: requireConfigString(environment.SNN_AGENT_DSH_MODEL, "SNN_AGENT_DSH_MODEL"),
    requestTimeoutMs: readPositiveInteger(environment.SNN_AGENT_DSH_REQUEST_TIMEOUT_MS, 120_000, "SNN_AGENT_DSH_REQUEST_TIMEOUT_MS"),
    shutdownTimeoutMs: readPositiveInteger(environment.SNN_AGENT_DSH_SHUTDOWN_TIMEOUT_MS, 10_000, "SNN_AGENT_DSH_SHUTDOWN_TIMEOUT_MS"),
    environment: Object.fromEntries(passthrough.map((name) => [name, environment[name]]).filter(([, value]) => value !== undefined)),
  };
}

function loadPublicAgentConfig(environment, agentConfig) {
  const enabled = readBoolean(environment.SNN_AGENT_PUBLIC_ENABLED, false, "SNN_AGENT_PUBLIC_ENABLED");
  const base = {
    enabled,
    // public API uses same host/port as public AI Node (no separate daemon)
    workspaceBase: environment.SNN_AGENT_PUBLIC_WORKSPACE_BASE || "",
    ownershipRoot: environment.SNN_AGENT_PUBLIC_OWNERSHIP_ROOT || "",
    cookieName: environment.SNN_AGENT_PUBLIC_COOKIE_NAME || "snn_agent_owner",
    cookieSecure: readBoolean(environment.SNN_AGENT_PUBLIC_COOKIE_SECURE, false, "SNN_AGENT_PUBLIC_COOKIE_SECURE"),
    sessionTtlMs: readPositiveInteger(environment.SNN_AGENT_PUBLIC_SESSION_TTL_MS, 24 * 60 * 60 * 1000, "SNN_AGENT_PUBLIC_SESSION_TTL_MS"),
    limits: {
      maxSessionsGlobal: readPositiveInteger(environment.SNN_AGENT_PUBLIC_MAX_SESSIONS_GLOBAL, 100, "SNN_AGENT_PUBLIC_MAX_SESSIONS_GLOBAL"),
      maxSessionsPerOwner: readPositiveInteger(environment.SNN_AGENT_PUBLIC_MAX_SESSIONS_PER_OWNER, 10, "SNN_AGENT_PUBLIC_MAX_SESSIONS_PER_OWNER"),
      maxActiveRunsGlobal: readPositiveInteger(environment.SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_GLOBAL, 20, "SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_GLOBAL"),
      maxActiveRunsPerOwner: readPositiveInteger(environment.SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_PER_OWNER, 3, "SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_PER_OWNER"),
      maxActiveWorkspaces: readPositiveInteger(environment.SNN_AGENT_PUBLIC_MAX_WORKSPACES, 100, "SNN_AGENT_PUBLIC_MAX_WORKSPACES"),
    },
  };
  if (!enabled) return base;
  if (!agentConfig.enabled) throw new Error("SNN_AGENT_PUBLIC_ENABLED requires SNN_AGENT_INTERNAL_ENABLED=true");
  if (!base.workspaceBase) throw new Error("SNN_AGENT_PUBLIC_WORKSPACE_BASE is required when SNN_AGENT_PUBLIC_ENABLED=true");
  if (!base.ownershipRoot) throw new Error("SNN_AGENT_PUBLIC_OWNERSHIP_ROOT is required when SNN_AGENT_PUBLIC_ENABLED=true");
  return base;
}

function normalizeUpstreamBaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error("QWEN_UPSTREAM_BASE_URL must use http://127.0.0.1");
  }

  return parsed.toString().replace(/\/+$/, "");
}

function normalizeWebSearchBaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("QWEN_WEB_SEARCH_BASE_URL must use HTTPS");
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

  const webSearchBaseUrl = environment.QWEN_WEB_SEARCH_BASE_URL?.trim();
  const webSearchApiKey = environment.QWEN_WEB_SEARCH_API_KEY || "";
  const webSearchModel = environment.QWEN_WEB_SEARCH_MODEL?.trim() || "";
  const webSearchConfigured = Boolean(webSearchBaseUrl && webSearchApiKey && webSearchModel);
  if ((webSearchBaseUrl || webSearchApiKey || webSearchModel) && !webSearchConfigured) {
    throw new Error("QWEN web search requires base URL, API key, and model");
  }

  const agent = loadAgentConfig(environment);
  const publicAgent = loadPublicAgentConfig(environment, agent);
  return {
    host,
    port: readPositiveInteger(environment.SNN_AI_NODE_PORT, 8787, "SNN_AI_NODE_PORT"),
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ALLOWED_ORIGINS,
    upstreamBaseUrl: normalizeUpstreamBaseUrl(
      environment.QWEN_UPSTREAM_BASE_URL || "http://127.0.0.1:8000/v1",
    ),
    upstreamApiKey: environment.QWEN_UPSTREAM_API_KEY || "",
    model: environment.QWEN_MODEL || "",
    webSearch: webSearchConfigured ? { baseUrl: normalizeWebSearchBaseUrl(webSearchBaseUrl), apiKey: webSearchApiKey, model: webSearchModel } : null,
    statusTimeoutMs: readPositiveInteger(
      environment.AI_STATUS_TIMEOUT_MS,
      4_000,
      "AI_STATUS_TIMEOUT_MS",
    ),
    chatConnectTimeoutMs: readPositiveInteger(
      environment.AI_CHAT_CONNECT_TIMEOUT_MS,
      45_000,
      "AI_CHAT_CONNECT_TIMEOUT_MS",
    ),
    streamIdleTimeoutMs: readPositiveInteger(
      environment.AI_STREAM_IDLE_TIMEOUT_MS,
      60_000,
      "AI_STREAM_IDLE_TIMEOUT_MS",
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
    agent,
    publicAgent,
  };
}
