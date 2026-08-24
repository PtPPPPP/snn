import { loadConfig } from "./config.mjs";
import { createAiNodeServer } from "./server.mjs";
import { AgentRuntimeManager } from "./agent/runtime-manager.mjs";
import { AgentSessionController } from "./agent/session-controller.mjs";
import { BUILT_IN_TOOL_METADATA } from "./agent/built-in-tools.mjs";
import { createConfiguredAgentRuntime } from "./agent/runtime-factory.mjs";
import { createAgentInternalServer } from "./agent/internal-server.mjs";
import { WorkspaceManager } from "./agent/workspace/workspace-manager.mjs";
import { createDefaultCapabilityResolver } from "./agent/capabilities/built-ins.mjs";
import { SessionMetadataStore } from "./agent/session-metadata-store.mjs";
import { FileIngestionService } from "./agent/workspace/file-ingestion-service.mjs";
import { AttachmentContextResolver } from "./agent/attachments/attachment-context-resolver.mjs";
import { WorkspaceRuntimeRegistry } from "./agent/workspace-runtime-registry.mjs";

const config = loadConfig();
const server = createAiNodeServer(config);
let internalServer;
let runtimeRegistry;

server.listen(config.port, config.host, () => {
  console.info(`SNN AI Node listening on http://${config.host}:${config.port}`);
});

if (config.agent.enabled) {
  const workspaceManager = new WorkspaceManager();
  const workspace = await workspaceManager.register(config.agent.runtimeCwd, { id: config.agent.workspaceId });
  runtimeRegistry = new WorkspaceRuntimeRegistry({
    createManager: async (resolvedWorkspace) => new AgentRuntimeManager({
      createRuntime: () => createConfiguredAgentRuntime({
        ...config.agent,
        runtimeCwd: resolvedWorkspace.root,
        environment: { ...config.agent.environment, DSH_CWD: resolvedWorkspace.root },
      }),
    }),
  });
  const defaultWorkspaceManager = {
    ensureReady: async () => (await runtimeRegistry.getOrCreate(workspace)).ensureReady(),
  };
  const ingestionService = new FileIngestionService({ workspaceManager });
  const controller = new AgentSessionController({
    manager: defaultWorkspaceManager,
    toolMetadata: BUILT_IN_TOOL_METADATA,
    maxMessageLength: config.agent.messageMaxLength,
    capabilityResolver: createDefaultCapabilityResolver(),
    workspace,
    workspaceManager,
    metadataStore: new SessionMetadataStore(config.agent.sessionMetadataRoot),
    runtimeRegistry,
    attachmentContextResolver: new AttachmentContextResolver({ fileInventory: ingestionService }),
  });
  internalServer = createAgentInternalServer({ config: config.agent, controller, manager: { get state() { return runtimeRegistry?.get(config.agent.workspaceId)?.state ?? "STOPPED"; } }, ingestionService });
  await internalServer.listen();
  console.info(`SNN Agent Internal API listening on http://${config.agent.host}:${config.agent.port}`);
}

let shutdownTask;
async function shutdown() {
  shutdownTask ??= (async () => {
    await internalServer?.close();
    await runtimeRegistry?.disposeAll();
    await new Promise((resolve) => server.close(() => resolve()));
  })();
  return shutdownTask;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void shutdown().finally(() => process.exit(0)); });
}
