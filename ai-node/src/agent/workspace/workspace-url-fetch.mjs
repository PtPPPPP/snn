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

/** True when the IPv4 address is loopback/link-local/private/reserved. */
function isPrivateIpv4(address) {
  const [a, b] = address.split(".").map((part) => Number(part));
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return a === 0 // 0.0.0.0/8
    || a === 10 // 10.0.0.0/8
    || a === 127 // loopback
    || (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 CGNAT
    || (a === 169 && b === 254) // 169.254.0.0/16 link-local
    || (a === 172 && b >= 16 && b <= 31) // 172.16.0.0/12
    || (a === 192 && b === 168) // 192.168.0.0/16
    || (a === 192 && b === 0) // 192.0.0.0/24 IETF protocol assignments
    || (a === 198 && (b === 18 || b === 19)) // 198.18.0.0/15 benchmarking
    || a >= 224; // multicast, reserved, broadcast
}

/** Expand a valid IPv6 literal into eight numeric groups (handles :: and embedded IPv4). */
function ipv6Groups(address) {
  const canonical = address.toLowerCase();
  const [head, tail] = canonical.includes("::") ? canonical.split("::") : [canonical, null];
  const parse = (side) => (side === "" ? [] : side.split(":").flatMap((part) => {
    if (part.includes(".")) {
      const octets = part.split(".").map((value) => Number(value));
      if (octets.length !== 4 || octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) return [Number.NaN];
      return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    }
    return [Number.parseInt(part || "0", 16)];
  }));
  const headGroups = parse(head);
  if (tail === null) return headGroups.length === 8 ? headGroups : null;
  const tailGroups = parse(tail);
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 1) return null;
  return [...headGroups, ...Array(missing).fill(0), ...tailGroups];
}

/** True when the IPv6 address is non-public; embedded IPv4 tails are judged as IPv4. */
function isPrivateIpv6(address) {
  const groups = ipv6Groups(address);
  if (!groups || groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return true;
  if (groups.every((g) => g === 0)) return true; // :: unspecified
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1 loopback
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && groups[1] === 0xdb8) return true; // 2001:db8::/32 documentation
  if (groups.slice(0, 5).every((g) => g === 0)) {
    const embedded = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    if (groups[5] === 0xffff) return isPrivateIpv4(embedded); // ::ffff:a.b.c.d IPv4-mapped
    return true; // ::/96 remainder (incl. deprecated IPv4-compatible) denied conservatively
  }
  if (first === 0x64 && groups[1] === 0xff9b) return true; // 64:ff9b::/96 NAT64 well-known prefix
  return false;
}

/** True when the address belongs to any non-public/reserved range. */
function isPrivateAddress(address) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) === 6) return isPrivateIpv6(address);
  return true;
}

/** Connect-time lookup guard: resolves first, denies private targets before any socket opens.
 * Policy: if ANY resolved record is non-public the whole fetch is denied, so
 * mixed A/AAAA result sets can never land on an unvalidated address; when the
 * fetch proceeds, every record handed to the TCP layer is a validated public one. */
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
  if (url.username !== "" || url.password !== "") throw fetchError("WORKSPACE_FETCH_CREDENTIALS_DENIED");
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivateNetworks && isIP(bare) !== 0 && isPrivateAddress(bare)) throw fetchError("WORKSPACE_FETCH_HOST_DENIED");
}

/**
 * Fetch a public http(s) URL and return bounded text plus fetch metadata.
 * Private, loopback, and link-local destinations are denied at connect time
 * via a lookup guard whose validated addresses are used verbatim for the TCP
 * connection, and every redirect hop is re-validated, so rebinds and redirect
 * chains cannot reach internal hosts.
 */
export async function fetchPublicText(rawUrl, { allowPrivateNetworks = false, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BODY_BYTES } = {}) {
  let url;
  try { url = new URL(typeof rawUrl === "string" ? rawUrl.trim() : ""); }
  catch { throw fetchError("WORKSPACE_FETCH_INVALID_URL"); }
  assertPublicScheme(url, allowPrivateNetworks);

  const lookup = guardedLookup(allowPrivateNetworks);
  const visited = new Set();
  let redirects = 0;
  for (;;) {
    visited.add(url.href);
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
      if (visited.has(url.href)) throw fetchError("WORKSPACE_FETCH_REDIRECT_LOOP");
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
      return {
        text: Buffer.concat(chunks).toString("utf8"),
        finalUrl: url.href,
        status,
        contentType: contentType || "unknown",
        bytes: received,
      };
    } finally { response.destroy(); }
  }
}
