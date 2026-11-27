import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { WorkspaceManager } from "./workspace-manager.mjs";
import { computeWorkspaceTextDiff, runNetworkLabSimulation, runRocketSimulation } from "./snn-lab-tools.mjs";

const anchor = process.env.SNN_DSH_PLUGIN_RESOLVE_FROM;
if (!anchor) throw new Error("SNN_DSH_PLUGIN_RESOLVE_FROM is required for SNN lab bridge");
const requireFromDsh = createRequire(anchor);
const { defineTool } = await import(pathToFileURL(requireFromDsh.resolve("@deepseek-ai/dsh-tools")).href);

export const name = "snn-workspace-lab";
export const inject = ["tools"];

export function apply(ctx, config = {}) {
  const root = config.workspaceRoot;
  if (typeof root !== "string" || root.length === 0) throw new Error("SNN workspace root is required");
  const manager = new WorkspaceManager();
  const workspacePromise = manager.register(root);

  ctx.tools.register(defineTool({
    name: "snn.sim.rocket",
    description: "Run the real SNN Rocket landing physics simulation (DT=0.01s, gravity 9.81 m/s^2, dry mass 10kg, max thrust 300N). Supports strategies: 'energy_ppo' (real trained PPO weights), 'energy_brake', or 'constant_throttle'. Returns terminal velocity, fuel consumption, first burn altitude, outcome, and trajectory keyframes.",
    parameters: {
      initial_height: { type: "number", required: false, description: "Initial altitude in meters (10 to 120, default 50)." },
      initial_fuel: { type: "number", required: false, description: "Initial fuel mass in kg (0.5 to 10, default 5)." },
      strategy: { type: "string", required: false, description: "Control strategy: 'energy_ppo', 'energy_brake', or 'constant_throttle'." },
      constant_throttle: { type: "number", required: false, description: "Throttle in [0, 1] when strategy is 'constant_throttle'." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      const result = await runRocketSimulation(args);
      return JSON.stringify(result, null, 2);
    },
  }));

  ctx.tools.register(defineTool({
    name: "snn.lab.network",
    description: "Run a deterministic 2->3->1 neural network classification and gradient descent simulation on 'linear' or 'xor' datasets with 'relu', 'tanh', or 'linear' activation. Returns initial and final cross-entropy loss, accuracy, and sample predictions.",
    parameters: {
      dataset: { type: "string", required: false, description: "Dataset id: 'xor' or 'linear' (default 'xor')." },
      activation: { type: "string", required: false, description: "Hidden activation: 'relu', 'tanh', or 'linear' (default 'relu')." },
      steps: { type: "number", required: false, description: "Gradient descent steps to run (0 to 400, default 120)." },
      learning_rate: { type: "number", required: false, description: "Learning rate (0.01 to 1.0, default 0.25)." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      const result = runNetworkLabSimulation(args);
      return JSON.stringify(result, null, 2);
    },
  }));

  ctx.tools.register(defineTool({
    name: "workspace.diff",
    description: "Compare two UTF-8 text files in the assigned SNN workspace (file_path and compare_file_path) or compare a workspace text file against proposed_content, returning a structured line-by-line diff summary.",
    parameters: {
      file_path: { type: "string", required: true, description: "Relative path of the base text file inside the assigned workspace." },
      compare_file_path: { type: "string", required: false, description: "Optional relative path of a second workspace text file to compare against." },
      proposed_content: { type: "string", required: false, description: "Optional proposed new text content to diff against file_path." },
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args) {
      try {
        const ws = await workspacePromise;
        const beforeText = await manager.readText(ws.id, args.file_path);
        const afterText =
          typeof args.proposed_content === "string"
            ? args.proposed_content
            : typeof args.compare_file_path === "string" && args.compare_file_path.trim()
              ? await manager.readText(ws.id, args.compare_file_path)
              : beforeText;
        const diff = computeWorkspaceTextDiff(beforeText, afterText, {
          labelA: args.file_path,
          labelB: typeof args.compare_file_path === "string" && args.compare_file_path.trim() ? args.compare_file_path : `${args.file_path} (proposed)`,
        });
        return JSON.stringify(diff, null, 2);
      } catch {
        throw new Error("SNN_WORKSPACE_DIFF_DENIED");
      }
    },
  }));
}
