import path from "node:path";
import { unstable_dev } from "wrangler";

// The bundle imports cloudflare:workers. Use local workerd so tests exercise
// the real Workers module loader and request bindings.
export async function startBuiltWorker({ root = process.cwd(), vars = {} } = {}) {
  const worker = await unstable_dev(path.join(root, "dist/server/index.js"), {
    config: path.join(root, "dist/server/wrangler.json"),
    local: true,
    bundle: false,
    ip: "127.0.0.1",
    port: 0,
    logLevel: "error",
    persist: false,
    vars,
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
      watch: false,
    },
  });
  return {
    async fetch(request) {
      const response = await worker.fetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.method === "GET" || request.method === "HEAD"
          ? undefined : await request.arrayBuffer(),
        redirect: "manual",
      });
      // Wrangler's HTTP client decompresses the body. Do not forward the old
      // encoding/length to browsers or they will try to decompress it again.
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      headers.delete("connection");
      headers.delete("keep-alive");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
    close: () => worker.stop(),
  };
}
