import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { DEFAULT_SSE_HEARTBEAT_MS, startSseHeartbeat } from "../src/agent/sse-heartbeat.mjs";
import { parseSseEvent, takeSseEvents } from "../src/sse.mjs";

// Production measurement against the live tunnel: 122.3s of silence survived and
// roughly 125.0s was cut. The beat has to sit far below the surviving figure.
const MEASURED_EDGE_IDLE_SURVIVAL_MS = 122_300;

function fakeResponse() {
  const response = new EventEmitter();
  response.writableEnded = false;
  response.destroyed = false;
  response.writes = [];
  response.write = (frame) => { response.writes.push(frame); return true; };
  return response;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await sleep(10);
  }
}

test("heartbeat writes only comment frames until it is stopped", async () => {
  const response = fakeResponse();
  const heartbeat = startSseHeartbeat(response, { intervalMs: 5 });
  assert.equal(heartbeat.isRunning(), true);

  await sleep(28);
  heartbeat.stop();
  const beats = response.writes.length;
  assert.ok(beats >= 2, `expected at least two beats, got ${beats}`);
  assert.equal(response.writes.every((frame) => frame === ": ping\n\n"), true);
  assert.equal(heartbeat.isRunning(), false);

  // Stopping must be durable: no further beat may appear and no listener may
  // stay registered on the response.
  await sleep(25);
  assert.equal(response.writes.length, beats);
  assert.equal(response.listenerCount("close"), 0);
});

test("a beat is discarded by the SNN SSE parser and never reaches a consumer", async () => {
  const response = fakeResponse();
  const heartbeat = startSseHeartbeat(response, { intervalMs: 5 });
  await sleep(15);
  heartbeat.stop();
  const frame = response.writes[0];

  // Interleave beats with one real business event and run the exact parser the
  // AI Node upstream proxy uses. Only the business event may survive.
  const { events, remaining } = takeSseEvents(`${frame}${frame}event: message.delta\ndata: {"type":"message.delta"}\n\n`);
  assert.equal(remaining, "");
  const parsed = events.map(parseSseEvent).filter(Boolean);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].payload.type, "message.delta");
});

test("heartbeat stops when the response closes", async () => {
  const response = fakeResponse();
  const heartbeat = startSseHeartbeat(response, { intervalMs: 5 });
  await sleep(18);
  const beats = response.writes.length;
  assert.ok(beats >= 1);

  response.emit("close");
  assert.equal(heartbeat.isRunning(), false);
  assert.equal(response.listenerCount("close"), 0);
  await sleep(25);
  assert.equal(response.writes.length, beats);
});

test("heartbeat stops rather than writing to a response that already ended", async () => {
  const response = fakeResponse();
  const heartbeat = startSseHeartbeat(response, { intervalMs: 5 });
  // Assigned synchronously, so the first tick cannot have fired yet.
  response.writableEnded = true;

  await sleep(25);
  assert.equal(response.writes.length, 0);
  assert.equal(heartbeat.isRunning(), false);
});

test("heartbeat is inert when the interval is not a positive integer", () => {
  for (const intervalMs of [0, -1, 1.5, Number.NaN]) {
    const response = fakeResponse();
    const heartbeat = startSseHeartbeat(response, { intervalMs });
    assert.equal(heartbeat.isRunning(), false, `interval ${intervalMs} should not start a timer`);
    assert.equal(response.listenerCount("close"), 0);
    heartbeat.stop();
  }
});

test("the default beat interval keeps at least an 8x margin under the edge cutoff", () => {
  assert.equal(DEFAULT_SSE_HEARTBEAT_MS, 15_000);
  assert.ok(
    DEFAULT_SSE_HEARTBEAT_MS * 8 <= MEASURED_EDGE_IDLE_SURVIVAL_MS,
    `8 beats (${DEFAULT_SSE_HEARTBEAT_MS * 8}ms) must fit inside ${MEASURED_EDGE_IDLE_SURVIVAL_MS}ms`,
  );
});

test("heartbeat stops after a real client disconnects mid-stream", async () => {
  let heartbeat;
  const server = createServer((request, response) => {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    response.flushHeaders();
    // Nothing else is ever written: the run stays queued, exactly like a run
    // waiting on llama-server's single slot.
    heartbeat = startSseHeartbeat(response, { intervalMs: 5 });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/runs`, { signal: controller.signal });
    const reader = response.body.getReader();
    const first = await reader.read();
    const text = new TextDecoder().decode(first.value);
    // Every byte that reached the client is a comment frame and nothing else.
    assert.ok(text.length >= 8, `expected at least one beat, got ${JSON.stringify(text)}`);
    assert.equal(text.replaceAll(": ping\n\n", ""), "");

    controller.abort();
    await waitFor(() => heartbeat.isRunning() === false, "heartbeat to stop after client disconnect");
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
