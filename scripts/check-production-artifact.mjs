import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const workerPath = path.join(root, "dist", "server", "index.js");
const workerConfigPath = path.join(root, "dist", "server", "wrangler.json");
const clientPath = path.join(root, "dist", "client");
const manifestPath = path.join(clientPath, ".vite", "manifest.json");

async function exists(file) {
  return stat(file).then(() => true).catch(() => false);
}

export function validateProductionArtifact({ workerConfig, manifest, aiSource, clientDir }) {
  const errors = [];
  if (JSON.stringify(workerConfig).includes("ftp-upload")) {
    errors.push("production Worker configuration must not reference ftp-upload");
  }
  if (workerConfig.main !== "index.js") {
    errors.push("production Worker entry must be dist/server/index.js");
  }
  if (workerConfig.assets?.directory !== "../client") {
    errors.push("production Worker assets must point to dist/client");
  }
  const assetNames = Object.values(manifest)
    .flatMap((entry) => [entry.file, ...(entry.css || [])])
    .filter((value) => typeof value === "string");
  const aiAsset = assetNames.find((asset) => asset.includes("ai-chat") && asset.endsWith(".js"));
  if (!aiAsset) {
    errors.push("production client manifest is missing the React AI route asset");
  } else if (!aiSource?.includes("webSearch") || !aiSource.includes("联网搜索")) {
    errors.push("production React AI asset is missing the current web-search feature contract");
  }
  // The legacy FTP static template (public/ai or copied ftp-upload/ai) must
  // never shadow the React /ai route: a stale ai/index.html in the client
  // output takes precedence over SSR and breaks the deployed chat page.
  if (clientDir) {
    const legacyFiles = ["ai/index.html", "ai.html", "index.html"];
    for (const rel of legacyFiles) {
      const p = path.join(clientDir, rel);
      if (existsSync(p)) errors.push(`stale file in dist/client shadows the /ai route: ${rel}`);
    }
  }
  return errors;
}

async function main() {
  const required = [workerPath, workerConfigPath, clientPath, manifestPath];
  const missing = [];
  for (const file of required) if (!await exists(file)) missing.push(path.relative(root, file));
  if (missing.length) throw new Error(`production React artifact is missing: ${missing.join(", ")}`);

  const workerConfig = JSON.parse(await readFile(workerConfigPath, "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const assetNames = Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css || [])]);
  const aiAsset = assetNames.find((asset) => typeof asset === "string" && asset.includes("ai-chat") && asset.endsWith(".js"));
  const aiSource = aiAsset ? await readFile(path.join(clientPath, aiAsset), "utf8") : "";
  const errors = validateProductionArtifact({ workerConfig, manifest, aiSource, clientDir: clientPath });
  if (errors.length) throw new Error(errors.join("\n"));

  console.log("Production React artifact verified:");
  console.log("- runtime: Cloudflare Worker dist/server/index.js");
  console.log("- client assets: dist/client");
  console.log("- AI route: React client asset present");
  console.log("- compatibility artifact: ftp-upload is not a production target");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  main().catch((error) => { console.error(`Production artifact check failed: ${error.message}`); process.exitCode = 1; });
}
