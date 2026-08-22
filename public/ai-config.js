// SNN AI API base URL injected before the app bundle loads.
//
// Resolution order in lib/ai-client.ts:
//   1. window.__SNN_AI_API_BASE_URL__ (this file)
//   2. build-time env (NOT viable: vite replaces process.env with {} in the
//      client bundle, so NEXT_PUBLIC_* never resolves)
//   3. fallback "/api/ai" (same-origin; requires a Worker/API proxy)
//
// Local development: leave as-is ("/api/ai") or point at a running gateway.
// Production (Workers Builds): the build command overwrites this file from
// the AI_GATEWAY_URL environment variable, e.g.
//   printf 'window.__SNN_AI_API_BASE_URL__="%s";' "$AI_GATEWAY_URL" > public/ai-config.js
// The value must be the public Cloudflare AI Gateway entry point — never the
// tunnel/local AI Node origin.
window.__SNN_AI_API_BASE_URL__ = "/api/ai";
