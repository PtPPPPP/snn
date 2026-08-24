import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { WorkspaceManager } from "./workspace-manager.mjs";

const anchor = process.env.SNN_DSH_PLUGIN_RESOLVE_FROM;
if (!anchor) throw new Error("SNN_DSH_PLUGIN_RESOLVE_FROM is required for SNN workspace read bridge");
const requireFromDsh = createRequire(anchor);
const { defineTool } = await import(pathToFileURL(requireFromDsh.resolve("@deepseek-ai/dsh-tools")).href);

export const name = "snn-workspace-read";
export const inject = ["tools"];

/** DSH schedules this tool; canonical path authorization remains SNN-owned. */
export function apply(ctx, config = {}) {
  const root = config.workspaceRoot;
  if (typeof root !== "string" || root.length === 0) throw new Error("SNN workspace root is required");
  const manager = new WorkspaceManager();
  const workspace = manager.register(root);
  ctx.tools.register(defineTool({
    name: "workspace.read",
    description: "Read a UTF-8 text file inside the assigned SNN workspace.",
    parameters: { file_path: { type: "string", required: true, description: "Relative path inside the assigned workspace." } },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try { return await manager.readText((await workspace).id, args.file_path); }
      catch { throw new Error("SNN_WORKSPACE_READ_DENIED"); }
    },
  }));
}
