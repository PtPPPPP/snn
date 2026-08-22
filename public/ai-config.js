// SNN AI API base URL injected before the app bundle loads.
//
// Resolution order in lib/ai-client.ts:
//   1. window.__SNN_AI_API_BASE_URL__ (this file)
//   2. build-time env (NOT viable: vite replaces process.env with {} in the
//      client bundle, so NEXT_PUBLIC_* never resolves)
//   3. fallback "/api/ai" (same-origin; requires a Worker/API proxy)
//
// This is the public Cloudflare AI Gateway entry point — safe to expose to
// browsers (it appears in every visitor's network tab), never a secret.
// Local development against a local AI Node: change to your node/gateway.
window.__SNN_AI_API_BASE_URL__ = "https://api.snnai.cn/api/ai";
