import { loadConfig } from "./config.mjs";
import { createAiNodeServer } from "./server.mjs";
import { AgentRuntimeManager } from "./agent/runtime-manager.mjs";
import { AgentSessionController } from "./agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "./agent/built-in-tools.mjs";
import { createConfiguredAgentRuntime } from "./agent/runtime-factory.mjs";
import { createAgentInternalServer } from "./agent/internal-server.mjs";
import { WorkspaceManager } from "./agent/workspace/workspace-manager.mjs";
import { createDefaultCapabilityResolver } from "./agent/capabilities/built-ins.mjs";

const config = loadConfig();
const server = createAiNodeServer(config);
let internalServer;
let runtimeManager;

server.listen(config.port, config.host, () => {
  console.info(`SNN AI Node listening on http://${config.host}:${config.port}`);
});

if (config.agent.enabled) {
  runtimeManager = new AgentRuntimeManager({ createRuntime: () => createConfiguredAgentRuntime(config.agent) });
  const workspaceManager = new WorkspaceManager();
  const workspace = await workspaceManager.register(config.agent.runtimeCwd);
  const controller = new AgentSessionController({
    manager: runtimeManager,
    toolMetadata: BUILT_IN_TOOL_METADATA,
    maxMessageLength: config.agent.messageMaxLength,
    capabilityResolver: createDefaultCapabilityResolver(),
    workspace,
  });
  internalServer = createAgentInternalServer({ config: config.agent, controller, manager: runtimeManager });
  await internalServer.listen();
  console.info(`SNN Agent Internal API listening on http://${config.agent.host}:${config.agent.port}`);
}

let shutdownTask;
async function shutdown() {
  shutdownTask ??= (async () => {
    await internalServer?.close();
    await runtimeManager?.dispose();
    await new Promise((resolve) => server.close(() => resolve()));
  })();
  return shutdownTask;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void shutdown().finally(() => process.exit(0)); });
}
