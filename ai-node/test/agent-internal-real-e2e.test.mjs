import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRuntimeManager } from "../src/agent/runtime-manager.mjs";
import { AgentSessionController } from "../src/agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "../src/agent/built-in-tools.mjs";
import { createAgentInternalServer } from "../src/agent/internal-server.mjs";
import { createConfiguredAgentRuntime } from "../src/agent/runtime-factory.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { createDefaultCapabilityResolver } from "../src/agent/capabilities/built-ins.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const dshRoot = resolve(testDir, "../../../deepseek-harness");
const sdkPath = join(dshRoot, "packages/sdk/client/lib/index.js");
const runnerPath = join(dshRoot, "packages/examples/jsonrpc-demo/lib/bin.js");
const toolHostPath = join(dshRoot, "packages/fs/tool-fs/lib/index.js");
const fixtureBase = join(dshRoot, "examples/jsonrpc-agent");
const hasRuntime = existsSync(sdkPath) && existsSync(runnerPath) && existsSync(fixtureBase);
const options = { skip: hasRuntime ? false : "requires sibling DSH built SDK and jsonrpc fixture", timeout: 180_000 };

function textPayloads(text) {
  return [
    JSON.stringify({ choices: [{ delta: { role: "assistant", content: null } }] }),
    JSON.stringify({ choices: [{ delta: { content: text } }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
  ];
}

function toolPayloads(callId, name, args) {
  return [
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: callId, type: "function", function: { name, arguments: "" } }] } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] } }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
  ];
}

function mockLlm() {
  let scripts = [];
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      const lower = body.toLowerCase();
      const entry = scripts.find((candidate) => !candidate.used && (!candidate.match || lower.includes(candidate.match.toLowerCase())));
      if (entry) entry.used = true;
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": open\n\n");
      if (entry?.hang) {
        const keepalive = setInterval(() => response.write(": ping\n\n"), 100);
        request.once("close", () => clearInterval(keepalive));
        return;
      }
      for (const payload of entry?.payloads ?? textPayloads("done")) response.write(`data: ${payload}\n\n`);
      response.end("data: [DONE]\n\n");
    });
  });
  return {
    requests,
    url: undefined,
    set(next) { scripts = next.map((entry) => ({ ...entry })); },
    async listen() { await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen)); this.url = `http://127.0.0.1:${server.address().port}`; },
    async close() { await new Promise((resolveClose) => { server.closeAllConnections(); server.close(resolveClose); }); },
  };
}

async function removeTree(path) { await rm(path, { recursive: true, force: true }).catch(() => {}); }

async function bootRealInternal(label, shared = {}) {
  const ownsWorkspace = shared.workspace === undefined;
  const ownsPersistence = shared.persistence === undefined;
  const workspace = shared.workspace ?? await mkdtemp(join(tmpdir(), "snn-http-e2e-ws-"));
  const persistence = shared.persistence ?? await mkdtemp(join(tmpdir(), "snn-http-e2e-sessions-"));
  const fixture = join(fixtureBase, `.snn-http-e2e-${label}`);
  await mkdir(fixture, { recursive: true });
  const cordis = join(fixture, "cordis.yml");
  await writeFile(cordis, [
    "- id: sdk-jsonrpc-server", "  name: '@deepseek-ai/dsh-sdk-jsonrpc-server'", "  config:", "    maxTokensAsSuccess: true",
    "- id: llm-deepseek", "  name: '@deepseek-ai/dsh-llm-deepseek'", "  config:", "    thinking: disabled",
    "- id: sandbox", "  name: '@deepseek-ai/dsh-sandbox-local'",
    "- id: sandbox-policy", "  name: '@deepseek-ai/dsh-sandbox-policy'", "  config:", "    mode: read-only", "    workspaceRoot: !!js process.env.DSH_CWD",
    "- id: agent-spine", "  name: '@deepseek-ai/dsh-agent-spine-demo'", "  config:", "    persona: 'deterministic HTTP E2E agent'", "    workspaceContext: false", "    skills:", "      enabled: false", "    toolBash: false", "    toolJobs: false",
    "- id: subagent", "  name: '@deepseek-ai/dsh-subagent'",
    "- id: sessions", "  name: '@deepseek-ai/dsh-session-persistence-jsonl'", "  config:", "    root: !!js process.env.DSH_SESSION_ROOT", "    compression: none",
    "- id: fs-sandbox", "  name: '@deepseek-ai/dsh-fs-sandbox'", "  config:", "    cwd: !!js process.env.DSH_CWD",
    "- id: tool-fs", "  name: '@deepseek-ai/dsh-tool-fs'", "",
  ].join("\n"));
  const llm = mockLlm();
  await llm.listen();
  const diagnostics = [];
  const config = {
    sdkPath, toolHostPath, runtimeExecutable: process.execPath, runtimeArguments: [runnerPath], cordisConfig: cordis,
    runtimeCwd: workspace, provider: "deepseek-official", model: "snn-http-e2e-model", requestTimeoutMs: 120_000, shutdownTimeoutMs: 10_000,
    environment: { PATH: process.env.PATH, DEEPSEEK_API_KEY: "test-key", SNN_TEST_SECRET: "SNN_AGENT_SECRET_SENTINEL_8f93c1", DEEPSEEK_BASE_URL: llm.url, DSH_SESSION_ROOT: persistence, DSH_CWD: workspace, DSH_HOME: join(workspace, ".home"), DSH_AGENTS_HOME: join(workspace, ".agents") },
    onInternalDiagnostic: (event) => diagnostics.push(event),
  };
  const manager = new AgentRuntimeManager({ createRuntime: () => createConfiguredAgentRuntime(config) });
  const workspaceManager = new WorkspaceManager();
  const workspaceRecord = await workspaceManager.register(workspace);
  const controller = new AgentSessionController({
    manager,
    toolMetadata: BUILT_IN_TOOL_METADATA,
    capabilityResolver: createDefaultCapabilityResolver(),
    workspace: workspaceRecord,
  });
  const listener = createAgentInternalServer({ config: { enabled: true, host: "127.0.0.1", port: 0, maxBodyBytes: 16_384 }, controller, manager, logger: { error() {} } });
  await listener.listen();
  const baseUrl = `http://127.0.0.1:${listener.address().port}`;
  return { workspace, workspaceRecord, persistence, fixture, llm, manager, listener, baseUrl, diagnostics, async close() { await listener.close().catch(() => {}); await manager.dispose().catch(() => {}); await llm.close(); if (ownsWorkspace) await removeTree(workspace); if (ownsPersistence) await removeTree(persistence); await removeTree(fixture); } };
}

async function post(url, body) { return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
async function sse(response) {
  const body = await response.text();
  const events = [...body.matchAll(/event: ([^\n]+)\ndata: ([^\n]+)\n\n/g)].map((match) => ({ type: match[1], data: JSON.parse(match[2]) }));
  return { body, events };
}
async function openSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  async function next() {
    for (;;) {
      const separator = pending.indexOf("\n\n");
      if (separator >= 0) {
        const block = pending.slice(0, separator);
        pending = pending.slice(separator + 2);
        const match = /^event: ([^\n]+)\ndata: ([^\n]+)$/m.exec(block);
        if (match) return { type: match[1], data: JSON.parse(match[2]) };
        continue;
      }
      const chunk = await reader.read();
      if (chunk.done) return undefined;
      pending += decoder.decode(chunk.value, { stream: true });
    }
  }
  async function collect() {
    const events = [];
    for (;;) {
      const event = await next();
      if (!event) return events;
      events.push(event);
    }
  }
  return { next, collect, close: () => reader.cancel() };
}
async function waitFor(predicate, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
}
async function waitForAsync(predicate, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
}
function assertTerminal(events, expected = "run.completed") {
  const terminals = events.filter((event) => ["run.completed", "run.failed", "run.cancelled"].includes(event.type));
  assert.equal(terminals.length, 1, `terminal events: ${terminals.map((event) => event.type).join(",")}`);
  assert.equal(terminals[0].type, expected);
}

test("real HTTP Internal API drives official SDK and child with sanitized READ/WRITE policy", options, async (t) => {
  const env = await bootRealInternal("policy");
  t.after(() => env.close());
  await writeFile(join(env.workspace, "allowed.txt"), "RAW_TOOL_OUTPUT_SHOULD_NOT_ESCAPE_1294\n");
  const create = await post(`${env.baseUrl}/internal/agent/sessions`, {});
  assert.equal(create.status, 201);
  const { sessionId } = await create.json();
  assert.match(sessionId, /^snn-agent-[a-f0-9-]{36}$/);
  assert.equal(env.manager.state, "READY", "real RuntimeManager must have started the official SDK child");

  env.llm.set([{ match: "read allowed.txt", payloads: toolPayloads("read-1", "workspace.read", { file_path: "allowed.txt", raw: "RAW_TOOL_ARGUMENT_SHOULD_NOT_ESCAPE_7712" }) }, { payloads: textPayloads("read complete") }]);
  const read = await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "read allowed.txt" });
  assert.equal(read.status, 200);
  const readStream = await sse(read);
  assert.ok(readStream.events.some((event) => event.type === "run.started"));
  assert.ok(readStream.events.some((event) => event.type === "tool.started"), `requests=${env.llm.requests.length}\n${readStream.body}`);
  assert.ok(readStream.events.some((event) => event.type === "tool.completed"));
  assertTerminal(readStream.events);
  assert.match(JSON.stringify(env.llm.requests[0].messages), /SNN Skill: workspace-reader/);
  for (const secret of ["RAW_TOOL_OUTPUT_SHOULD_NOT_ESCAPE_1294", "RAW_TOOL_ARGUMENT_SHOULD_NOT_ESCAPE_7712", "SNN_AGENT_SECRET_SENTINEL_8f93c1", env.workspace, sdkPath, env.fixture]) assert.doesNotMatch(readStream.body, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  env.llm.set([{ match: "write forbidden.txt", payloads: toolPayloads("write-1", "write", { file_path: "forbidden.txt", content: "forbidden" }) }, { payloads: textPayloads("write denied") }]);
  const write = await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "write forbidden.txt" });
  const writeStream = await sse(write);
  assertTerminal(writeStream.events);
  assert.equal(writeStream.events.some((event) => event.type === "tool.started"), false);
  assert.equal(existsSync(join(env.workspace, "forbidden.txt")), false);
  assert.equal(env.llm.requests.length >= 4, true, "real child must have requested both tool paths");
});

test("real Runtime rejects client authority fields without starting a run", options, async (t) => {
  const env = await bootRealInternal("escalation");
  t.after(() => env.close());
  const rejected = await post(`${env.baseUrl}/internal/agent/sessions`, {
    toolPolicy: { default: "allow" }, allowAll: true, cwd: "attacker", workspace: "attacker",
    permissions: ["write", "execute"], env: { ATTACKER: "1" }, provider: "attacker", model: "attacker",
  });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error.code, "INVALID_REQUEST");
  assert.equal(env.llm.requests.length, 0);
  assert.equal(env.manager.state, "STOPPED");
});

test("real workspace bridge rejects traversal and absolute paths before outside content reaches DSH", options, async (t) => {
  const env = await bootRealInternal("workspace-boundary");
  const outside = await mkdtemp(join(tmpdir(), "snn-workspace-outside-"));
  t.after(async () => { await env.close(); await removeTree(outside); });
  await writeFile(join(outside, "secret.txt"), "SNN_OUTSIDE_SECRET_SENTINEL\n");
  const { sessionId } = await (await post(`${env.baseUrl}/internal/agent/sessions`, {})).json();
  env.llm.set([
    { match: "traversal", payloads: toolPayloads("escape-relative", "workspace.read", { file_path: "../snn-workspace-outside/secret.txt" }) },
    { payloads: textPayloads("denied") },
  ]);
  const traversal = await sse(await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "traversal" }));
  assert.ok(traversal.events.some((event) => event.type === "tool.started"));
  assert.ok(traversal.events.some((event) => event.type === "tool.failed"));
  assertTerminal(traversal.events);
  env.llm.set([
    { match: "absolute", payloads: toolPayloads("escape-absolute", "workspace.read", { file_path: join(outside, "secret.txt") }) },
    { payloads: textPayloads("denied") },
  ]);
  const absolute = await sse(await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "absolute" }));
  assert.ok(absolute.events.some((event) => event.type === "tool.failed"));
  assertTerminal(absolute.events);
  const observed = `${traversal.body}\n${absolute.body}\n${JSON.stringify(env.llm.requests)}`;
  assert.doesNotMatch(observed, /SNN_OUTSIDE_SECRET_SENTINEL/);
});

test("real Runtime maps a missing persisted HTTP session without leaking DSH details", options, async (t) => {
  const env = await bootRealInternal("missing");
  t.after(() => env.close());
  const warmup = await post(`${env.baseUrl}/internal/agent/sessions`, {});
  assert.equal(warmup.status, 201);
  const missingId = "snn-agent-00000000-0000-4000-8000-000000000000";
  const response = await post(`${env.baseUrl}/internal/agent/sessions/${missingId}/resume`, {});
  const body = await response.text();
  assert.equal(response.status, 404, body);
  assert.deepEqual(env.diagnostics.map((event) => ({ name: event.name, code: event.code })), [{ name: "JsonRpcResponseError", code: -32603 }]);
  assert.match(body, /AGENT_SESSION_NOT_FOUND/);
  for (const forbidden of ["JsonRpcResponseError", "-32603", env.workspace, env.persistence, sdkPath, env.fixture, "SNN_AGENT_SECRET_SENTINEL_8f93c1"]) assert.doesNotMatch(body, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("real HTTP cancel settles one cancelled terminal and leaves the runtime usable", options, async (t) => {
  const env = await bootRealInternal("cancel");
  t.after(() => env.close());
  const { sessionId } = await (await post(`${env.baseUrl}/internal/agent/sessions`, {})).json();
  env.llm.set([{ match: "long task", hang: true }]);
  const stream = await openSse(await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "long task" }));
  const started = await stream.next();
  assert.equal(started.type, "run.started");
  await waitFor(() => env.llm.requests.length === 1, "the real model request");
  const cancelled = await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs/${started.data.runId}/cancel`, {});
  assert.equal(cancelled.status, 202);
  const events = [started, ...await stream.collect()];
  assertTerminal(events, "run.cancelled");
  assert.equal(env.manager.state, "READY");
  env.llm.set([{ payloads: textPayloads("still healthy") }]);
  const followup = await sse(await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "health check" }));
  assertTerminal(followup.events);
});

test("real HTTP stale cancel and run conflict leave the active child run unaffected", options, async (t) => {
  const env = await bootRealInternal("ownership");
  t.after(() => env.close());
  const { sessionId } = await (await post(`${env.baseUrl}/internal/agent/sessions`, {})).json();
  env.llm.set([{ payloads: textPayloads("run A") }]);
  const first = await sse(await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "run A" }));
  assertTerminal(first.events);
  const firstRunId = first.events.find((event) => event.type === "run.started").data.runId;
  env.llm.set([{ match: "run B", hang: true }]);
  const active = await openSse(await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "run B" }));
  const started = await active.next();
  await waitFor(() => env.llm.requests.length === 2, "run B model request");
  const conflict = await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "must not start" });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "AGENT_RUN_CONFLICT");
  assert.equal(env.llm.requests.length, 2, "conflict must not create a second child run");
  const stale = await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs/${firstRunId}/cancel`, {});
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "STALE_AGENT_RUN");
  const cancel = await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs/${started.data.runId}/cancel`, {});
  assert.equal(cancel.status, 202);
  assertTerminal([started, ...await active.collect()], "run.cancelled");
});

test("HTTP cross-runtime resume restores one session and reapplies READ-only policy", options, async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "snn-http-resume-ws-"));
  const persistence = await mkdtemp(join(tmpdir(), "snn-http-resume-sessions-"));
  t.after(async () => { await removeTree(workspace); await removeTree(persistence); });
  const runtimeA = await bootRealInternal("resume-a", { workspace, persistence });
  const { sessionId } = await (await post(`${runtimeA.baseUrl}/internal/agent/sessions`, {})).json();
  runtimeA.llm.set([{ payloads: textPayloads("stored marker") }]);
  assertTerminal((await sse(await post(`${runtimeA.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "remember MARKER-ALPHA" }))).events);
  await runtimeA.close();
  const runtimeB = await bootRealInternal("resume-b", { workspace, persistence });
  t.after(() => runtimeB.close());
  assert.notEqual(runtimeA.manager, runtimeB.manager);
  const resumed = await post(`${runtimeB.baseUrl}/internal/agent/sessions/${sessionId}/resume`, {});
  assert.equal(resumed.status, 200);
  assert.deepEqual(await resumed.json(), { sessionId, status: "resumed" });
  await writeFile(join(workspace, "allowed-resumed.txt"), "RESUMED_READ_CONTENT\n");
  runtimeB.llm.set([{ match: "read allowed-resumed.txt", payloads: toolPayloads("resume-read", "workspace.read", { file_path: "allowed-resumed.txt" }) }, { payloads: textPayloads("read after resume") }]);
  const read = await sse(await post(`${runtimeB.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "read allowed-resumed.txt" }));
  assert.ok(read.events.some((event) => event.type === "tool.started"));
  assertTerminal(read.events);
  runtimeB.llm.set([{ match: "write forbidden-resumed.txt", payloads: toolPayloads("resume-write", "write", { file_path: "forbidden-resumed.txt", content: "no" }) }, { payloads: textPayloads("write denied after resume") }]);
  const write = await sse(await post(`${runtimeB.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "write forbidden-resumed.txt" }));
  assert.equal(write.events.some((event) => event.type === "tool.started"), false);
  assertTerminal(write.events);
  assert.equal(existsSync(join(workspace, "forbidden-resumed.txt")), false);
});

test("real HTTP SSE disconnect cancels the child run without leaving zombie ownership", options, async (t) => {
  const env = await bootRealInternal("disconnect");
  t.after(() => env.close());
  const { sessionId } = await (await post(`${env.baseUrl}/internal/agent/sessions`, {})).json();
  env.llm.set([{ match: "disconnect task", hang: true }]);
  const stream = await openSse(await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "disconnect task" }));
  assert.equal((await stream.next()).type, "run.started");
  await waitFor(() => env.llm.requests.length === 1, "disconnect task model request");
  await stream.close();
  env.llm.set([{ payloads: textPayloads("session reusable") }]);
  const reusable = await waitForAsync(async () => {
    const response = await post(`${env.baseUrl}/internal/agent/sessions/${sessionId}/runs`, { message: "reuse after disconnect" });
    if (response.status === 409) { await response.text(); return undefined; }
    assert.equal(response.status, 200);
    return sse(response);
  }, "disconnect cancellation cleanup");
  assertTerminal(reusable.events);
});
