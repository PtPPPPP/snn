/**
 * Keep-alive for the long-lived SSE response that carries one Agent run.
 *
 * A run can sit queued for minutes. llama-server serves `--parallel 1`, so only
 * one admitted run generates at a time while every other admitted run emits
 * nothing at all on its own connection. Edge proxies close idle connections:
 * measured against the production tunnel, 122.3s of silence survived and roughly
 * 125.0s was cut, and the cut reached the client as a truncated stream carrying
 * no terminal event.
 *
 * The beat is an SSE comment frame. A comment line starts with ":" and holds no
 * `data:` field, so every existing consumer already discards it: `src/sse.mjs`
 * and `lib/agent-client.ts` both skip ":" lines and return null when a block
 * contained no data line, and the internal `openSse` test reader skips any block
 * that does not match its `event:`/`data:` shape. No client change is required
 * and a beat can never be mistaken for a delta or a tool event.
 */

/** Sits far below the measured ~122s edge idle cutoff, with roughly 8x margin. */
export const DEFAULT_SSE_HEARTBEAT_MS = 15_000;

const HEARTBEAT_FRAME = ": ping\n\n";

/**
 * Write comment frames until stopped, or until the response closes on its own.
 *
 * Callers must invoke `stop()` on every exit path. The timer is additionally
 * unref'd so that a missed stop can never be what keeps the Node event loop
 * alive and blocks a natural process exit.
 *
 * A non-positive or non-integer `intervalMs` disables the heartbeat and returns
 * an inert handle, which keeps the call sites free of conditional wiring.
 *
 * @param {import("node:http").ServerResponse} response
 * @param {{ intervalMs?: number }} [options]
 * @returns {{ stop: () => void, isRunning: () => boolean }}
 */
export function startSseHeartbeat(response, { intervalMs = DEFAULT_SSE_HEARTBEAT_MS } = {}) {
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    return { stop() {}, isRunning: () => false };
  }

  let timer = setInterval(writeBeat, intervalMs);
  timer.unref?.();
  response.once("close", stop);

  function writeBeat() {
    // A response that ended or was destroyed mid-interval must not be written
    // to; stopping here also covers a close event that was already consumed.
    if (response.writableEnded || response.destroyed) {
      stop();
      return;
    }
    response.write(HEARTBEAT_FRAME);
  }

  function stop() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    response.removeListener("close", stop);
  }

  return { stop, isRunning: () => timer !== null };
}
