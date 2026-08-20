import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const clientRoot = path.join(root, "dist", "client");
const fontRoot = path.join(root, ".vinext", "fonts");
const worker = (await import(pathToFileURL(path.join(root, "dist", "server", "index.js")).href)).default;
const mime = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

function assetResponse(url) {
  const relative = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "");
  const isFont = relative.startsWith("__fonts/");
  const file = isFont
    ? path.resolve(fontRoot, relative.slice("__fonts/".length))
    : path.resolve(clientRoot, relative.replace(/^assets[\\/]/, "assets/"));
  const base = isFont ? fontRoot : clientRoot;
  if (!file.startsWith(base)) return new Response("forbidden", { status: 403 });
  return readFile(file).then((body) => new Response(body, { headers: { "content-type": mime[path.extname(file)] || "application/octet-stream" } })).catch(() => new Response("Not found", { status: 404 }));
}

createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:3000");
  try {
    const result = url.pathname.startsWith("/assets/") || url.pathname.startsWith("/__fonts/")
      ? await assetResponse(url)
      : await worker.fetch(new Request(`http://127.0.0.1:3000${url.pathname}${url.search}`, { method: request.method, headers: request.headers }), {
        ASSETS: { fetch: (assetRequest) => assetResponse(assetRequest.url) },
      }, { waitUntil() {}, passThroughOnException() {} });
    let body = Buffer.from(await result.arrayBuffer());
    const contentType = result.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      body = Buffer.from(body.toString("utf8").replace(/url\((?:file:\/\/\/)?D:[^)]*?\.vinext[\\/]fonts[\\/]/g, "url(/__fonts/"));
    }
    response.writeHead(result.status, { ...Object.fromEntries(result.headers), "content-length": body.length });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(String(error));
  }
}).listen(3000, "127.0.0.1", () => console.log("browser smoke server listening on http://127.0.0.1:3000"));
