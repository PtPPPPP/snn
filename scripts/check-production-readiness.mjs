import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const placeholder = (value) => /example\.com|localhost|127\.0\.0\.1|YOUR_|CHANGE_ME|placeholder|dummy|xxxx|000000/i.test(value || "");

export function validateProductionConfig(config) {
  const errors = [];
  const requireHttpsPublic = (name, value) => {
    if (!value) errors.push(`${name} is required`);
    else if (!/^https:\/\//i.test(value)) errors.push(`${name} must use HTTPS`);
    else if (placeholder(value)) errors.push(`${name} still uses a placeholder or local endpoint`);
  };

  requireHttpsPublic("SNN_PUBLIC_ORIGIN", config.publicOrigin);
  requireHttpsPublic("SNN_AI_GATEWAY_URL", config.gatewayUrl);
  if (!config.originUrl || placeholder(config.originUrl) || !/^https:\/\//i.test(config.originUrl)) {
    errors.push("AI_ORIGIN_URL must be a real HTTPS origin (private/Tunnel origin is allowed)");
  }
  if (!config.allowedOrigins || config.allowedOrigins.some((origin) => placeholder(origin) || !/^https:\/\//i.test(origin))) {
    errors.push("ALLOWED_ORIGINS must contain only real HTTPS production origins");
  }
  for (const [name, value] of [["AI_CHAT_RATE_LIMIT_NAMESPACE_ID", config.chatNamespace], ["AI_STATUS_RATE_LIMIT_NAMESPACE_ID", config.statusNamespace]]) {
    if (!/^\d+$/.test(String(value || "")) || /^0+$/.test(String(value)) || ["878701", "878702"].includes(String(value))) {
      errors.push(`${name} must be a real Cloudflare Rate Limit namespace ID`);
    }
  }
  if (config.requireSecrets && (!config.accessClientId || !config.accessClientSecret || !config.modelApiKey)) {
    errors.push("required production secrets are missing (values are never printed)");
  }
  return errors;
}

function readVar(source, name) {
  return source.match(new RegExp(`['\"]${name}['\"]\\s*:\\s*['\"]([^'\"]+)`))?.[1] || "";
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(full));
    else files.push(full);
  }
  return files;
}

export async function scanClientArtifact(directory, forbidden = []) {
  const findings = [];
  for (const file of await walkFiles(directory)) {
    if (!/\.(js|mjs|css|html)$/.test(file)) continue;
    const content = await readFile(file, "utf8");
    for (const marker of forbidden) if (content.includes(marker)) findings.push({ file, marker });
  }
  return findings;
}

async function main() {
  const gateway = await readFile(path.join(root, "cloudflare-ai-gateway", "wrangler.jsonc"), "utf8");
  const config = {
    publicOrigin: process.env.SNN_PUBLIC_ORIGIN,
    gatewayUrl: process.env.SNN_AI_GATEWAY_URL,
    originUrl: process.env.AI_ORIGIN_URL || readVar(gateway, "AI_ORIGIN_URL"),
    allowedOrigins: (process.env.ALLOWED_ORIGINS || readVar(gateway, "ALLOWED_ORIGINS")).split(",").map((value) => value.trim()).filter(Boolean),
    chatNamespace: process.env.AI_CHAT_RATE_LIMIT_NAMESPACE_ID || readVar(gateway, "namespace_id"),
    statusNamespace: process.env.AI_STATUS_RATE_LIMIT_NAMESPACE_ID || readVar(gateway, "namespace_id"),
    accessClientId: process.env.CF_ACCESS_CLIENT_ID,
    accessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
    modelApiKey: process.env.QWEN_UPSTREAM_API_KEY,
    requireSecrets: process.argv.includes("--strict"),
  };
  const errors = validateProductionConfig(config);
  const clientDir = path.join(root, "dist", "client");
  if (await stat(clientDir).then(() => true).catch(() => false)) {
    const findings = await scanClientArtifact(clientDir, ["CF-Access-Client-Secret", "QWEN_UPSTREAM_API_KEY", "AI_ORIGIN_URL", "Bearer "]);
    if (findings.length) errors.push("production client artifact contains an internal credential or origin marker");
  }
  if (errors.length) {
    console.error("Production preflight failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Production preflight passed (configuration only; no deployment performed).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
