#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}

node --input-type=module - "${worker}" "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";
import { startBuiltWorker } from "./scripts/built-worker.mjs";

const [workerPath, hostingPath] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));

const worker = await startBuiltWorker();
try {
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }));
  if (response.status !== 200 || !(response.headers.get("content-type") || "").includes("text/html")) {
    throw new Error(`${workerPath} must serve HTML through its ESM default.fetch`);
  }
  await response.text();
} finally {
  await worker.close();
}
NODE

echo "Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present."
