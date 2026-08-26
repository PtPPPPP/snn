import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Server-owned bounds for the public workspace fetch capability. */
const MAX_BODY_BYTES = 200 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

function fetchError(code) {
  return Object.assign(new Error(code), { code });
}

/** True when the address belongs to a loopback/link-local/private/mapped range. */
function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map((part) => Number(part));
    return a === 127 || a === 10 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (isIP(address) === 6) {
    const canonical = address.toLowerCase();
    if (canonical === "::" || canonical === "::1" || canonical.startsWith("::ffff:")) return true;
    const first = Number.parseInt(canonical.split(":")[0] || "0", 16);
    if (Number.isNaN(first)) return true;
    const masked = first & 0xfe00;
    return masked === 0xfc00 || masked === 0xfe00 || canonical.startsWith("fe80");
  }
  return true;
}

/** Connect-time lookup guard: resolves first, denies private targets before any socket opens. */
function guardedLookup(allowPrivateNetworks) {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }).then(
      (records) => {
        if (!allowPrivateNetworks && records.some((record) => isPrivateAddress(record.address))) {
          callback(fetchError("WORKSPACE_FETCH_HOST_DENIED"));
          return;
        }
        callback(null, records, options.family ?? 0);
      },
      (error) => callback(error),
    );
  };
}

function requestOnce(url, timeoutMs, lookup) {
  const isHttps = url.protocol === "https:";
  const requester = isHttps ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = requester(url, {
      method: "GET",
      headers: { "user-agent": "SNN-Agent-Fetch/1.0", accept: "text/*, application/json, application/xml" },
      lookup,
      timeout: timeoutMs,
    }, (response) => resolve(response));
    request.on("timeout", () => { request.destroy(fetchError("WORKSPACE_FETCH_TIMEOUT")); });
    request.on("error", (error) => reject(error?.code?.startsWith?.("WORKSPACE_FETCH_") ? error : fetchError("WORKSPACE_FETCH_NETWORK_ERROR")));
    request.end();
  });
}

function assertPublicScheme(url, allowPrivateNetworks) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw fetchError("WORKSPACE_FETCH_SCHEME_DENIED");
  if (!url.hostname) throw fetchError("WORKSPACE_FETCH_INVALID_URL");
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivateNetworks && isIP(bare) !== 0 && isPrivateAddress(bare)) throw fetchError("WORKSPACE_FETCH_HOST_DENIED");
}

/**
 * Fetch a public http(s) URL and return bounded text. Private, loopback, and
 * link-local destinations are denied at connect time via a lookup guard, and
 * every redirect hop is re-validated, so rebinds cannot reach internal hosts.
 */
export async function fetchPublicText(rawUrl, { allowPrivateNetworks = false, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BODY_BYTES } = {}) {
  let url;
  try { url = new URL(typeof rawUrl === "string" ? rawUrl.trim() : ""); }
  catch { throw fetchError("WORKSPACE_FETCH_INVALID_URL"); }
  assertPublicScheme(url, allowPrivateNetworks);

  const lookup = guardedLookup(allowPrivateNetworks);
  let redirects = 0;
  for (;;) {
    let response;
    try {
      response = await requestOnce(url, timeoutMs, lookup);
    } catch (error) {
      if (error?.code?.startsWith?.("WORKSPACE_FETCH_")) throw error;
      throw fetchError("WORKSPACE_FETCH_NETWORK_ERROR");
    }
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume();
      redirects += 1;
      if (redirects > MAX_REDIRECTS) throw fetchError("WORKSPACE_FETCH_TOO_MANY_REDIRECTS");
      try { url = new URL(response.headers.location, url); }
      catch { throw fetchError("WORKSPACE_FETCH_INVALID_URL"); }
      assertPublicScheme(url, allowPrivateNetworks);
      continue;
    }
    try {
      if (status < 200 || status >= 300) throw fetchError("WORKSPACE_FETCH_UPSTREAM_ERROR");
      const contentType = String(response.headers["content-type"] ?? "");
      if (contentType && !/text\/|json|xml|javascript|csv/.test(contentType)) throw fetchError("WORKSPACE_FETCH_CONTENT_DENIED");
      const chunks = [];
      let received = 0;
      for await (const chunk of response) {
        received += chunk.length;
        if (received > maxBytes) throw fetchError("WORKSPACE_FETCH_TOO_LARGE");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    } finally { response.destroy(); }
  }
}
