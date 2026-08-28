import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DshClient } from "./dsh-client.mjs";
import { DshRuntimeAdapter } from "./runtime-adapter.mjs";
import { builtInToolMetadataFor } from "./built-in-tools.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "./documents/limits.mjs";

/** Build the server-owned bridge from configured values to the official SDK. */
export async function createConfiguredAgentRuntime(agentConfig) {
  const sdk = await import(pathToFileURL(agentConfig.sdkPath).href);
  if (typeof sdk.DeepSeekHarness !== "function") {
    throw Object.assign(new Error("Configured DSH SDK does not export DeepSeekHarness"), { code: "AGENT_RUNTIME_INCOMPATIBLE" });
  }
  const bridge = await createWorkspaceBridgeConfig(agentConfig);
  const client = new DshClient({
    createHarness: (options) => new sdk.DeepSeekHarness(options),
    harnessOptions: {
      launch: {
        command: agentConfig.runtimeExecutable,
        args: [...agentConfig.runtimeArguments, bridge.configPath],
        cwd: agentConfig.runtimeCwd,
        env: { ...agentConfig.environment, SNN_DSH_PLUGIN_RESOLVE_FROM: agentConfig.toolHostPath, DSH_CORDIS_CONFIG: bridge.configPath },
        requestTimeoutMs: agentConfig.requestTimeoutMs,
        shutdownTimeoutMs: agentConfig.shutdownTimeoutMs,
      },
      cwd: agentConfig.runtimeCwd,
      provider: agentConfig.provider,
      model: agentConfig.model,
    },
    onInternalDiagnostic: agentConfig.onInternalDiagnostic,
    onDispose: bridge.dispose,
  });
  return new DshRuntimeAdapter({ client, metadataFor: builtInToolMetadataFor });
}

async function createWorkspaceBridgeConfig(agentConfig) {
  const directory = await mkdtemp(join(tmpdir(), "snn-agent-cordis-"));
  const pluginPath = fileURLToPath(new URL("./workspace/dsh-workspace-read-plugin.mjs", import.meta.url));
  const filesystemPluginPath = fileURLToPath(new URL("./workspace/dsh-workspace-fs-plugin.mjs", import.meta.url));
  const spreadsheetPluginPath = fileURLToPath(new URL("./workspace/dsh-workspace-spreadsheet-plugin.mjs", import.meta.url));
  const configPath = join(directory, "cordis.yml");
  const quoted = (value) => JSON.stringify(value);
  // Document limits are server-owned constants serialized into the overlay;
  // the plugin clamps them again, so even a tampered overlay cannot widen bounds.
  const documentLimits = JSON.stringify(agentConfig.documentLimits ?? DEFAULT_DOCUMENT_LIMITS);
  await writeFile(configPath, [
    "- id: base",
    "  name: cordis:include",
    "  config:",
    `    path: ${quoted(pathToFileURL(agentConfig.cordisConfig).href)}`,
    "    patches:",
    "      - id: fs-local",
    "        disabled: true",
    "      - id: fs-sandbox",
    "        disabled: true",
    "      - id: tool-fs",
    "        disabled: false",
    "      - id: sandbox-policy",
    "        config:",
    "          mode: read-only",
    "      - insert:",
    "          - id: fs-observation-policy",
    "            name: '@deepseek-ai/dsh-fs-observation-policy'",
    "          - id: snn-workspace-fs",
    `            name: ${quoted(pathToFileURL(filesystemPluginPath).href)}`,
    "            config:",
    `              workspaceRoot: ${quoted(agentConfig.runtimeCwd)}`,
    "              maxEditableBytes: 1048576",
    "          - id: snn-workspace-read",
    `            name: ${quoted(pathToFileURL(pluginPath).href)}`,
    "            config:",
    `              workspaceRoot: ${quoted(agentConfig.runtimeCwd)}`,
    `              documentLimits: ${documentLimits}`,
    `              fetchAllowPrivate: ${agentConfig.fetchAllowPrivateNetworks === true}`,
    "          - id: snn-workspace-spreadsheet",
    `            name: ${quoted(pathToFileURL(spreadsheetPluginPath).href)}`,
    "            config:",
    `              workspaceRoot: ${quoted(agentConfig.runtimeCwd)}`,
    "",
  ].join("\n"), "utf8");
  return { configPath, dispose: () => rm(directory, { recursive: true, force: true }).catch(() => {}) };
}
