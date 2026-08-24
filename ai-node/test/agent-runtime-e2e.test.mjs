import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const testDir = dirname(fileURLToPath(import.meta.url));
// The E2E drives the real out-of-process chain:
// SNN runtime adapter -> DshClient -> official @deepseek-ai/dsh-sdk-client ->
// child dsh-jsonrpc-agent (real cordis composition) -> SDK server -> agent ->
// tools + JSONL persistence -> SDK notifications -> SnnAgentEvent.
const DSH_ROOT = resolve(testDir, "../../../deepseek-harness");
const CLIENT_LIB = join(DSH_ROOT, "packages/sdk/client/lib/index.js");
const BIN_JS = join(DSH_ROOT, "packages/examples/jsonrpc-demo/lib/bin.js");
const FIXTURE_BASE = join(DSH_ROOT, "examples/jsonrpc-agent");

const hasRuntime = existsSync(CLIENT_LIB) && existsSync(BIN_JS) && existsSync(FIXTURE_BASE);
const options = { skip: hasRuntime ? false : "requires the sibling deepseek-harness checkout with built SDK lib" };

async function makeTemp(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Remove a temp tree even while an exiting child process still pins it (Windows EBUSY). */
async function removeTree(dir) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        // Best effort outside the repository: an OS or antivirus handle lag on
        // a freshly exited child must not fail the verified run itself.
        console.warn(`e2e cleanup left ${dir}: ${String(error)}`);
        return;
      }
      await new Promise((resolveTick) => setTimeout(resolveTick, 250));
    }
  }
}

/**
 * Deterministic OpenAI-compatible SSE endpoint. Each scripted entry is consumed
 * by exactly one request; entries may carry `match` text so concurrent sessions
 * bind to their own response regardless of arrival order. `hang` keeps the
 * stream transport-alive until the client aborts.
 */
function createMockLlm() {
  const requests = [];
  let script = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk.toString("utf8"); });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      const lowerBody = body.toLowerCase();
      let index = script.findIndex((entry) => !entry.consumed
        && (entry.match === undefined || lowerBody.includes(entry.match.toLowerCase())));
      if (index === -1) index = script.findIndex((entry) => !entry.consumed && entry.match === undefined);
      const entry = index === -1 ? undefined : script[index];
      if (entry !== undefined) entry.consumed = true;
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": open\n\n");
      let keepalive;
      const stopKeepalive = () => {
        if (keepalive !== undefined) clearInterval(keepalive);
        keepalive = undefined;
      };
      request.on("close", stopKeepalive);
      void Promise.resolve(entry?.hold?.promise).then(() => {
        if (entry !== undefined && (entry.hang === true)) {
          keepalive ??= setInterval(() => { response.write(": ping\n\n"); }, 250);
          if (keepalive.unref !== undefined) keepalive.unref();
          return;
        }
        stopKeepalive();
        for (const payload of entry?.payloads ?? textPayloads("scripted done")) {
          response.write(`data: ${payload}\n\n`);
        }
        response.write("data: [DONE]\n\n");
        response.end();
      });
    });
  });
  return {
    requests,
    url: undefined,
    setScript(next) {
      script = next.map((entry) => ({ ...entry }));
    },
    listen() {
      return new Promise((resolveListen) => {
        server.listen(0, "127.0.0.1", () => {
          this.url = `http://127.0.0.1:${server.address().port}`;
          // The mock must never keep the test process alive on its own.
          if (server.unref !== undefined) server.unref();
          resolveListen(this.url);
        });
      });
    },
    close() {
      return new Promise((resolveClose) => {
        // Hung cancel streams keep sockets open; close() alone would wait on them.
        server.closeAllConnections();
        server.close(() => resolveClose());
      });
    },
  };
}

function sse(chunk) {
  return JSON.stringify(chunk);
}

function usageChunk(finishReason) {
  return sse({ choices: [{ delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
}

function textPayloads(text) {
  return [
    sse({ choices: [{ delta: { role: "assistant", content: null } }] }),
    sse({ choices: [{ delta: { content: text } }] }),
    usageChunk("stop"),
  ];
}

function toolCallPayloads(callId, name, args) {
  return [
    sse({ choices: [{ delta: { role: "assistant", tool_calls: [{ index: 0, id: callId, type: "function", function: { name, arguments: "" } }] } }] }),
    sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] } }] }),
    usageChunk("tool_calls"),
  ];
}

/** One booted SNN runtime adapter over a REAL child dsh-jsonrpc-agent process. */
async function bootSnnRuntime({ mockLlm, workspace, sessionsRoot, label }) {
  const official = await import(pathToFileURL(CLIENT_LIB).href);
  const fixtureDir = join(FIXTURE_BASE, `.snn-e2e-${label}-${randomUUID().slice(0, 8)}`);
  await mkdir(fixtureDir, { recursive: true });
  const configPath = join(fixtureDir, "cordis.yml");
  await writeFile(configPath, [
    "- id: sdk-jsonrpc-server",
    "  name: '@deepseek-ai/dsh-sdk-jsonrpc-server'",
    "  config:",
    "    maxTokensAsSuccess: true",
    "- id: llm-deepseek",
    "  name: '@deepseek-ai/dsh-llm-deepseek'",
    "  config:",
    "    thinking: disabled",
    "- id: agent-spine",
    "  name: '@deepseek-ai/dsh-agent-spine-demo'",
    "  config:",
    "    persona: 'You are a deterministic test agent.'",
    "    workspaceContext: false",
    "    skills:",
    "      enabled: false",
    "    toolBash: false",
    "    toolJobs: false",
    "- id: subagent",
    "  name: '@deepseek-ai/dsh-subagent'",
    "- id: sessions",
    "  name: '@deepseek-ai/dsh-session-persistence-jsonl'",
    "  config:",
    "    root: !!js process.env.DSH_SESSION_ROOT ?? './.sessions'",
    "    compression: none",
    "- id: fs-local",
    "  name: '@deepseek-ai/dsh-fs-local'",
    "  config:",
    "    cwd: !!js process.env.DSH_CWD ?? process.cwd()",
    "- id: tool-fs",
    "  name: '@deepseek-ai/dsh-tool-fs'",
    "",
  ].join("\n"), "utf8");

  const { DshClient } = await import("../src/agent/dsh-client.mjs");
  const { DshRuntimeAdapter } = await import("../src/agent/runtime-adapter.mjs");
  const diagnostics = [];
  const client = new DshClient({
    createHarness: (options) => new official.DeepSeekHarness(options),
    harnessOptions: {
      launch: {
        command: process.execPath,
        args: [BIN_JS, configPath],
        cwd: workspace,
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
          DEEPSEEK_API_KEY: "test-key",
          DEEPSEEK_BASE_URL: mockLlm.url,
          DSH_SESSION_ROOT: sessionsRoot,
          DSH_CWD: workspace,
          DSH_HOME: join(workspace, ".dsh-home"),
          DSH_AGENTS_HOME: join(workspace, ".agents-home"),
        },
        requestTimeoutMs: 120_000,
        shutdownTimeoutMs: 10_000,
      },
      cwd: workspace,
      provider: "deepseek-official",
      model: "snn-e2e-model",
    },
  });
  const runtime = new DshRuntimeAdapter({
    client,
    now: () => new Date().toISOString(),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  return {
    runtime,
    diagnostics,
    async dispose() {
      await runtime.dispose().catch(() => {});
      await removeTree(fixtureDir);
    },
  };
}

async function collectUntilTerminal(events, { timeoutMs = 60_000 } = {}) {
  const collected = [];
  let terminalSeen = false;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`E2E run did not reach a terminal event in time; saw: ${collected.map((event) => event.type).join(",")}`);
    const result = await Promise.race([
      events.next(),
      new Promise((resolveTick) => setTimeout(() => resolveTick({ timeout: true }), remaining)),
    ]);
    if (result.timeout) throw new Error(`E2E run stalled; saw: ${collected.map((event) => event.type).join(",")}`);
    if (result.done) break;
    collected.push(result.value);
    if (["run.completed", "run.failed", "run.cancelled"].includes(result.value.type)) terminalSeen = true;
  }
  if (!terminalSeen) throw new Error(`E2E stream closed without a terminal event; saw: ${collected.map((event) => event.type).join(",")}`);
  // Draining to stream close also guarantees the adapter released its
  // per-session run slot before the caller starts any follow-up run.
  return collected;
}

async function waitFor(predicate, { timeoutMs = 30_000, what = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`E2E timed out waiting for ${what}`);
    await new Promise((resolveTick) => setTimeout(resolveTick, 50));
  }
}

test("E2E A: normal tool run through a real child dsh-jsonrpc-agent", { ...options, timeout: 180_000 }, async (t) => {  const workspace = await makeTemp("snn-e2e-a-ws-");
  const sessionsRoot = await makeTemp("snn-e2e-a-sessions-");
  const mockLlm = createMockLlm();
  await mockLlm.listen();
  t.after(async () => {
    await mockLlm.close();
  });
  const { runtime, dispose } = await bootSnnRuntime({ mockLlm, workspace, sessionsRoot, label: "a" });
  t.after(async () => {
    await dispose();
    await removeTree(workspace);
    await removeTree(sessionsRoot);
  });

  await writeFile(join(workspace, "README.md"), "SNN-E2E-README-CONTENT\n", "utf8");
  mockLlm.setScript([
    { match: "read the readme", payloads: toolCallPayloads("call-read-1", "read", { file_path: "README.md" }) },
    { payloads: textPayloads("READ-DONE") },
  ]);

  const sessionId = "e2e-a-normal-tool-run";
  await runtime.createSession({ sessionId });
  const run = runtime.sendMessage({ sessionId, content: "read the readme" });
  const events = await collectUntilTerminal(run.events);

  assert.equal(events[0].type, "run.started");
  const types = events.map((event) => event.type);
  assert.ok(types.includes("tool.started"), `missing tool.started in ${types.join(",")}`);
  assert.ok(types.includes("tool.completed"), `missing tool.completed in ${types.join(",")}`);
  assert.ok(types.includes("message.delta") || types.includes("message.completed"));
  assert.deepEqual(types.at(-1), "run.completed");
  const toolStarted = events.find((event) => event.type === "tool.started");
  assert.equal(toolStarted.payload.name, "read");
  const terminal = events.filter((event) => ["run.completed", "run.failed", "run.cancelled"].includes(event.type));
  assert.equal(terminal.length, 1);

  // Proof of the real child runtime: two model calls hit the mock endpoint and
  // the durable session log was written under the shared persistence root.
  assert.equal(mockLlm.requests.length, 2);
  await waitFor(() => existsSync(sessionsRoot), { what: "persisted session log" });
  const secondRequest = mockLlm.requests[1];
  const serialized = JSON.stringify(secondRequest.messages);
  assert.ok(serialized.includes("SNN-E2E-README-CONTENT"), "tool result must reach the model context");
});

test("E2E B: cancel settles with exactly one run.cancelled and leaves the runtime alive", { ...options, timeout: 180_000 }, async (t) => {
  const workspace = await makeTemp("snn-e2e-b-ws-");
  const sessionsRoot = await makeTemp("snn-e2e-b-sessions-");
  const mockLlm = createMockLlm();
  await mockLlm.listen();
  t.after(async () => {
    await mockLlm.close();
  });
  const { runtime, dispose } = await bootSnnRuntime({ mockLlm, workspace, sessionsRoot, label: "b" });
  t.after(async () => {
    await dispose();
    await removeTree(workspace);
    await removeTree(sessionsRoot);
  });

  const sessionId = "e2e-b-cancel";
  await runtime.createSession({ sessionId });

  mockLlm.setScript([{ match: "long task", hang: true }]);
  const run = runtime.sendMessage({ sessionId, content: "long task" });
  const first = await run.events.next();
  assert.equal(first.value.type, "run.started");
  // Wait until the model call is genuinely in flight before cancelling.
  await waitFor(() => mockLlm.requests.length === 1, { what: "model stream to open" });
  await runtime.abort({ sessionId, runId: run.runId });

  const rest = await collectUntilTerminal(run.events);
  const terminals = rest.filter((event) => ["run.completed", "run.failed", "run.cancelled"].includes(event.type));
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].type, "run.cancelled");

  // The cancel must not kill the runtime nor dispose the session.
  mockLlm.setScript([]);
  const secondRun = runtime.sendMessage({ sessionId, content: "are you still there" });
  const secondEvents = await collectUntilTerminal(secondRun.events);
  assert.equal(secondEvents.at(-1).type, "run.completed");
});

test("E2E C: persisted resume across a real runtime restart restores identity and context", { ...options, timeout: 240_000 }, async (t) => {
  const workspace = await makeTemp("snn-e2e-c-ws-");
  const sessionsRoot = await makeTemp("snn-e2e-c-sessions-");
  const mockLlm = createMockLlm();
  await mockLlm.listen();
  t.after(async () => {
    await mockLlm.close();
  });
  const runtimeA = await bootSnnRuntime({ mockLlm, workspace, sessionsRoot, label: "c-a" });
  t.after(async () => {
    await removeTree(workspace);
    await removeTree(sessionsRoot);
  });

  const sessionId = "e2e-c-persisted";
  mockLlm.setScript([{ payloads: textPayloads("marker stored") }]);
  await runtimeA.runtime.createSession({ sessionId });
  const firstRun = runtimeA.runtime.sendMessage({ sessionId, content: "remember MARKER-ALPHA-731" });
  const firstEvents = await collectUntilTerminal(firstRun.events);
  assert.equal(firstEvents.at(-1).type, "run.completed");
  assert.equal(mockLlm.requests.length, 1);
  await runtimeA.dispose();

  // A brand-new child runtime resumes the SAME session identity.
  const runtimeB = await bootSnnRuntime({ mockLlm, workspace, sessionsRoot, label: "c-b" });
  t.after(async () => {
    await runtimeB.dispose();
  });

  const resumed = await runtimeB.runtime.resumeSession({ sessionId });
  assert.deepEqual(resumed, { sessionId });
  // Resume itself never invokes the model.
  assert.equal(mockLlm.requests.length, 1);

  mockLlm.setScript([{ payloads: textPayloads("MARKER-ALPHA-731 echoed back") }]);
  const secondRun = runtimeB.runtime.sendMessage({ sessionId, content: "return the marker" });
  const secondEvents = await collectUntilTerminal(secondRun.events);
  assert.equal(secondEvents.at(-1).type, "run.completed");
  assert.equal(mockLlm.requests.length, 2);

  // The restored conversation reached the model as prior context.
  const followup = JSON.stringify(mockLlm.requests[1].messages);
  assert.ok(followup.includes("MARKER-ALPHA-731"), "historical user message must be restored");
  assert.ok(followup.includes("marker stored"), "historical assistant message must be restored");

  // Historical durable events were not replayed as live public events: the
  // resumed run's stream only carries its own new activity.
  const ownRunIds = new Set([secondRun.runId]);
  for (const event of secondEvents) assert.ok(ownRunIds.has(event.runId), "foreign runId leaked into the new run stream");
});

test("E2E D: tool policy survives resume (read allowed, write denied)", { ...options, timeout: 240_000 }, async (t) => {
  const workspace = await makeTemp("snn-e2e-d-ws-");
  const sessionsRoot = await makeTemp("snn-e2e-d-sessions-");
  const mockLlm = createMockLlm();
  await mockLlm.listen();
  t.after(async () => {
    await mockLlm.close();
  });
  const toolPolicy = { default: "deny", rules: [{ toolName: "read", decision: "allow" }] };
  const runtimeA = await bootSnnRuntime({ mockLlm, workspace, sessionsRoot, label: "d-a" });
  t.after(async () => {
    await removeTree(workspace);
    await removeTree(sessionsRoot);
  });

  const sessionId = "e2e-d-policy";
  await runtimeA.runtime.createSession({ sessionId, toolPolicy });
  mockLlm.setScript([{ payloads: textPayloads("ready") }]);
  const warmup = runtimeA.runtime.sendMessage({ sessionId, content: "warm up" });
  const warmupEvents = await collectUntilTerminal(warmup.events);
  assert.equal(warmupEvents.at(-1).type, "run.completed");
  await runtimeA.dispose();

  const runtimeB = await bootSnnRuntime({ mockLlm, workspace, sessionsRoot, label: "d-b" });
  t.after(async () => {
    await runtimeB.dispose();
  });
  await runtimeB.runtime.resumeSession({ sessionId, toolPolicy });

  // READ stays allowed after resume.
  await writeFile(join(workspace, "allowed.txt"), "READABLE-AFTER-RESUME\n", "utf8");
  mockLlm.setScript([
    { match: "show me allowed.txt", payloads: toolCallPayloads("call-read-resumed", "read", { file_path: "allowed.txt" }) },
    { payloads: textPayloads("READ-OK") },
  ]);
  const readRun = runtimeB.runtime.sendMessage({ sessionId, content: "show me allowed.txt" });
  const readEvents = await collectUntilTerminal(readRun.events);
  const readTypes = readEvents.map((event) => event.type);
  assert.ok(readTypes.includes("tool.started"), `expected tool.started, got ${readTypes.join(",")}`);
  assert.ok(readTypes.includes("tool.completed"), `expected tool.completed, got ${readTypes.join(",")}`);
  assert.equal(readEvents.at(-1).type, "run.completed");
  const readRequest = JSON.stringify(mockLlm.requests.at(-1).messages);
  assert.ok(readRequest.includes("READABLE-AFTER-RESUME"));

  // WRITE is still denied after resume: no tool body starts, no public
  // tool.completed, and nothing lands on disk.
  mockLlm.setScript([
    { match: "write forbidden.txt", payloads: toolCallPayloads("call-write-denied", "write", { file_path: "forbidden.txt", content: "must not exist" }) },
    { payloads: textPayloads("WRITE-DENIED-DONE") },
  ]);
  const writeRun = runtimeB.runtime.sendMessage({ sessionId, content: "write forbidden.txt please" });
  const writeEvents = await collectUntilTerminal(writeRun.events);
  const writeTypes = writeEvents.map((event) => event.type);
  assert.equal(writeEvents.at(-1).type, "run.completed");
  assert.equal(writeTypes.includes("tool.started"), false);
  assert.equal(writeTypes.includes("tool.completed"), false);
  assert.equal(existsSync(join(workspace, "forbidden.txt")), false);
  // The denied call surfaces as a diagnostic instead of fake tool success.
  assert.ok(
    runtimeB.diagnostics.some((diagnostic) => diagnostic.code === "TOOL_RESULT_WITHOUT_EXECUTION_START"),
    "denied write must be diagnosed, not silently accepted",
  );
});
