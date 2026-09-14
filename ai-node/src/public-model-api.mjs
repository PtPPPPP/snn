import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Separate bearer-authenticated OpenAI surface; website routes keep their protocol.
export function createPublicModelApi(config, { apiKey = process.env.SNN_PUBLIC_MODEL_API_KEY, fetchImpl = fetch, concurrency = 2 } = {}) {
  let active = 0;
  return async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (path !== '/v1' && !path.startsWith('/v1/')) return false;
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const error = (status, message, type) => reply(status, { error: { message, type, code: type } });
    if (!apiKey) { error(503, 'Public API is not enabled', 'service_unavailable'); return true; }
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${apiKey}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      error(401, 'Invalid API key', 'invalid_api_key'); return true;
    }
    if (path === '/v1/models' && req.method === 'GET') {
      reply(200, { object: 'list', data: [{ id: config.model, object: 'model', created: 0, owned_by: 'snn' }] }); return true;
    }
    if (path !== '/v1/chat/completions' || req.method !== 'POST') {
      error(404, 'Unsupported endpoint', 'not_found'); return true;
    }
    if (active >= concurrency) { res.setHeader('retry-after', '3'); error(429, 'Model is busy; retry shortly', 'rate_limit_exceeded'); return true; }
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const disconnected = () => controller.abort();
    res.on('close', disconnected);
    try {
      let bytes = 0; const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 262144) { error(413, 'Request exceeds 256 KiB', 'invalid_request_error'); return true; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { error(400, 'Invalid JSON', 'invalid_request_error'); return true; }
      if (!body || !Array.isArray(body.messages) || !body.messages.length || body.model !== config.model) {
        error(400, 'Specify the supported model and a nonempty messages array', 'invalid_request_error'); return true;
      }
      if (body.stream !== undefined && typeof body.stream !== 'boolean') {
        error(400, 'stream must be boolean', 'invalid_request_error'); return true;
      }
      if (body.n !== undefined && body.n !== 1) { error(400, 'Only n=1 is supported', 'invalid_request_error'); return true; }
      const budget = body.max_completion_tokens ?? body.max_tokens ?? 2048;
      if (!Number.isInteger(budget) || budget < 1 || budget > 4096) {
        error(400, 'Token limit must be between 1 and 4096', 'invalid_request_error'); return true;
      }
      delete body.max_completion_tokens;
      body.max_tokens = budget;
      const headers = { 'content-type': 'application/json' };
      if (config.upstreamApiKey) headers.authorization = `Bearer ${config.upstreamApiKey}`;
      const upstream = await fetchImpl(`${config.upstreamBaseUrl}/chat/completions`, {
        method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
      });
      if (!upstream.ok) { await upstream.body?.cancel(); error(upstream.status >= 500 ? 502 : upstream.status, 'Model rejected the request', 'upstream_error'); return true; }
      res.writeHead(200, { 'content-type': body.stream ? 'text/event-stream; charset=utf-8' : 'application/json', 'cache-control': 'no-cache, no-transform' });
      res.flushHeaders();
      await pipeline(Readable.fromWeb(upstream.body), res, { signal: controller.signal });
    } catch {
      if (!res.headersSent && !res.destroyed) error(controller.signal.aborted ? 504 : 502, 'Model request failed', 'upstream_error');
      else if (!res.destroyed) res.destroy();
    } finally {
      clearTimeout(timer); res.off('close', disconnected); active--;
    }
    return true;
  };
}
