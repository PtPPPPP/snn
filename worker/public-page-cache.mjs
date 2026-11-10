// Only anonymous, canonical HTML documents are shared at the edge.  Every
// deployment receives a new key so old HTML cannot reference removed bundles.
const PUBLIC_PAGES = new Set(["/", "/learn/neural-networks"]);
const BYPASS_HEADERS = [
  "authorization", "cookie", "range", "rsc", "next-router-state-tree",
  "next-router-prefetch", "next-router-segment-prefetch", "next-url",
  "x-vinext-interception-context", "x-vinext-mounted-slots",
  "x-vinext-rsc-render-mode", "cf-access-jwt-assertion", "cf-authorization",
  "oai-authenticated-user-id", "oai-authenticated-user-email", "purpose", "sec-purpose",
];

/** @param {Request} request @param {string | undefined} version */
export function publicPageCacheKey(request, version) {
  if (!version || request.method !== "GET") return null;
  const url = new URL(request.url);
  if (!PUBLIC_PAGES.has(url.pathname) || url.search) return null;
  if (!request.headers.get("accept")?.toLowerCase().includes("text/html")) return null;
  if (BYPASS_HEADERS.some((name) => request.headers.has(name))) return null;
  if (/\b(?:no-cache|no-store|max-age\s*=\s*0)\b/i.test(request.headers.get("cache-control") || "")) return null;
  if (/\bno-cache\b/i.test(request.headers.get("pragma") || "")) return null;
  url.searchParams.set("__snn_version", version);
  return new Request(url.toString(), { method: "GET" });
}

/** @param {Response} response */
export function canCachePublicPage(response) {
  return response.status === 200 &&
    (response.headers.get("content-type") || "").toLowerCase().includes("text/html") &&
    !response.headers.has("set-cookie") &&
    !/\bnonce-/i.test(response.headers.get("content-security-policy") || "") &&
    !/\b(?:private|no-cache|no-store|(?:s-)?max-age\s*=\s*0)\b/i.test(response.headers.get("cache-control") || "") &&
    !(response.headers.get("vary") || "").split(",").some((value) => value.trim() === "*");
}

/** @param {Response} response @param {'HIT' | 'MISS'} state */
export function publicPageResponse(response, state) {
  const outgoing = new Response(response.body, response);
  outgoing.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  outgoing.headers.set("X-SNN-Page-Cache", state);
  return outgoing;
}

/** @param {Response} response */
export function publicPageCacheCopy(response) {
  const stored = new Response(response.clone().body, response);
  stored.headers.set("Cache-Control", "public, max-age=300");
  return stored;
}
