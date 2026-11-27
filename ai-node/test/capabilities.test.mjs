import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolRegistry } from "../src/agent/capabilities/tool-registry.mjs";
import { SkillRegistry } from "../src/agent/skills/skill-registry.mjs";
import { createDefaultCapabilityResolver } from "../src/agent/capabilities/built-ins.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import {
  computeWorkspaceTextDiff,
  runNetworkLabSimulation,
  runRocketSimulation,
} from "../src/agent/workspace/snn-lab-tools.mjs";

test("tool and skill registries reject duplicates and unknown dependencies", () => {
  const tools = new ToolRegistry([{ id: "workspace.read", name: "Read", description: "Read", category: "read", risk: "safe-read", dshToolName: "read", handlerId: "read", available: () => true }]);
  assert.throws(() => tools.register({ id: "workspace.read", name: "Read", description: "Read", category: "read", risk: "safe-read", dshToolName: "read", handlerId: "read", available: () => true }), /Duplicate/);
  const skills = new SkillRegistry({ toolRegistry: tools });
  assert.throws(() => skills.register({ id: "bad", name: "Bad", description: "Bad", instructions: "Bad", requiredTools: ["missing"] }), /unknown tool/);
});

test("capability resolver grants only registered available safe reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "snn-capability-ws-"));
  try {
    const manager = new WorkspaceManager();
    const workspace = await manager.register(root);
    const resolver = createDefaultCapabilityResolver();
    const capability = resolver.resolve({ workspace });
    assert.deepEqual(capability.allowedToolIds, ["workspace.list", "workspace.read", "workspace.extract", "workspace.open"]);
    assert.deepEqual(capability.dshToolPolicy, {
      default: "deny",
      rules: [
        { toolName: "workspace.list", decision: "allow" },
        { toolName: "workspace.read", decision: "allow" },
        { toolName: "workspace.extract", decision: "allow" },
        { toolName: "workspace.open", decision: "allow" },
      ],
    });
    for (const id of ["workspace.write", "workspace.execute", "workspace.fetch", "workspace.spreadsheet.inspect", "workspace.spreadsheet.patch", "workspace.word.inspect", "workspace.word.patch"]) {
      assert.equal(capability.allowedToolIds.includes(id), false);
    }
    // The editor skill adds guarded public web fetching but never shell execution.
    const editor = resolver.resolve({ workspace, skillId: "workspace-editor" });
    assert.deepEqual(editor.allowedToolIds, ["workspace.list", "fs.read", "fs.write", "fs.edit", "workspace.open", "workspace.extract", "workspace.fetch", "workspace.spreadsheet.inspect", "workspace.spreadsheet.patch", "workspace.word.inspect", "workspace.word.patch"]);
    assert.ok(editor.dshToolPolicy.rules.some((rule) => rule.toolName === "workspace.list" && rule.decision === "allow"));
    assert.ok(editor.dshToolPolicy.rules.some((rule) => rule.toolName === "workspace.fetch" && rule.decision === "allow"));
    assert.ok(editor.dshToolPolicy.rules.some((rule) => rule.toolName === "workspace.spreadsheet.inspect" && rule.decision === "allow"));
    assert.ok(editor.dshToolPolicy.rules.some((rule) => rule.toolName === "workspace.spreadsheet.patch" && rule.decision === "allow"));
    assert.ok(editor.dshToolPolicy.rules.some((rule) => rule.toolName === "workspace.word.inspect" && rule.decision === "allow"));
    assert.ok(editor.dshToolPolicy.rules.some((rule) => rule.toolName === "workspace.word.patch" && rule.decision === "allow"));
    assert.equal(editor.allowedToolIds.includes("workspace.execute"), false);
    assert.throws(() => resolver.resolve({ workspace, skillId: "missing" }), (error) => error.code === "SNN_SKILL_NOT_FOUND");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public agent capability surface exposes no shell-style execution tool", async () => {
  // Regression for the NO SHELL contract: workspace.execute stays registered
  // as a capability definition but no public skill may ever grant it, and the
  // DSH tool policy default denies everything not explicitly allowed.
  const root = await mkdtemp(join(tmpdir(), "snn-noshell-ws-"));
  try {
    const manager = new WorkspaceManager();
    const workspace = await manager.register(root);
    const resolver = createDefaultCapabilityResolver();
    for (const skillId of ["workspace-reader", "workspace-editor"]) {
      const capability = resolver.resolve({ workspace, skillId });
      assert.equal(capability.dshToolPolicy.default, "deny");
      for (const shellish of ["workspace.execute", "shell", "terminal", "exec", "bash", "spawn"]) {
        assert.equal(capability.allowedToolIds.includes(shellish), false, `${skillId} must not grant ${shellish}`);
        assert.ok(!capability.dshToolPolicy.rules.some((rule) => rule.toolName === shellish), `${skillId} policy must not allow ${shellish}`);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("workspace manager enforces canonical read boundary and resource limits", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-workspace-root-"));
  const outside = await mkdtemp(join(tmpdir(), "snn-workspace-outside-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await writeFile(join(root, "note.txt"), "inside");
  await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
  await writeFile(join(outside, "secret.txt"), "outside-secret");
  const manager = new WorkspaceManager();
  const workspace = await manager.register(root);
  assert.equal(await manager.readText(workspace.id, "note.txt"), "inside");
  await assert.rejects(() => manager.readText(workspace.id, "../snn-workspace-outside-x/secret.txt"), (error) => error.code === "SNN_WORKSPACE_PATH_DENIED");
  await assert.rejects(() => manager.readText(workspace.id, "C:\\Windows\\win.ini"), (error) => error.code === "SNN_WORKSPACE_PATH_DENIED");
  await assert.rejects(() => manager.readText(workspace.id, "/etc/passwd"), (error) => error.code === "SNN_WORKSPACE_PATH_DENIED");
  await assert.rejects(() => manager.readText(workspace.id, "binary.bin"), (error) => error.code === "SNN_WORKSPACE_BINARY_FILE");
  try {
    await symlink(join(outside, "secret.txt"), join(root, "escape-link"));
    await assert.rejects(() => manager.readText(workspace.id, "escape-link"), (error) => error.code === "SNN_WORKSPACE_PATH_DENIED");
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
  }
});

test("snn harness presets and skills resolve specialized tools while preserving NO-SHELL", async () => {
  const root = await mkdtemp(join(tmpdir(), "snn-harness-preset-ws-"));
  try {
    const manager = new WorkspaceManager();
    const workspace = await manager.register(root);
    const resolver = createDefaultCapabilityResolver();
    const catalog = resolver.catalog();
    assert.equal(catalog.presets.length, 5);
    assert.ok(catalog.skills.length >= 5);
    assert.ok(catalog.tools.some((t) => t.id === "snn.sim.rocket"));
    assert.ok(catalog.tools.some((t) => t.id === "snn.lab.network"));
    assert.ok(catalog.tools.some((t) => t.id === "workspace.diff"));

    const labCap = resolver.resolve({ workspace, presetId: "lab-simulator" });
    assert.equal(labCap.presetId, "lab-simulator");
    assert.equal(labCap.skillId, "snn-lab-simulator");
    assert.ok(labCap.allowedToolIds.includes("snn.sim.rocket"));
    assert.ok(labCap.allowedToolIds.includes("snn.lab.network"));
    assert.equal(labCap.allowedToolIds.includes("workspace.execute"), false);

    const codingCap = resolver.resolve({ workspace, presetId: "coding-auditor" });
    assert.equal(codingCap.skillId, "snn-coding-auditor");
    assert.ok(codingCap.allowedToolIds.includes("workspace.diff"));
    assert.equal(codingCap.allowedToolIds.includes("workspace.execute"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("snn lab tools run deterministic rocket physics, neural network training, and unified diff", async () => {
  const rocketRes = await runRocketSimulation({ initial_height: 50, initial_fuel: 5, strategy: "energy_ppo" });
  assert.equal(rocketRes.outcome, "success");
  assert.equal(rocketRes.softLandingSuccess, true);
  assert.ok(typeof rocketRes.terminalVelocityMps === "number" && Math.abs(rocketRes.terminalVelocityMps) <= 2);
  assert.ok(Array.isArray(rocketRes.keyframes) && rocketRes.keyframes.length > 2);

  const netRes = runNetworkLabSimulation({ dataset: "xor", activation: "tanh", steps: 80, learning_rate: 0.45 });
  assert.equal(netRes.dataset, "xor");
  assert.ok(netRes.finalLoss < netRes.initialLoss);
  assert.equal(netRes.samplePredictions.length, 4);

  const diffRes = computeWorkspaceTextDiff("line1\nline2\nline3", "line1\nline2-mod\nline3\nline4");
  assert.equal(diffRes.identical, false);
  assert.equal(diffRes.addedLines, 2);
  assert.equal(diffRes.removedLines, 1);
});
