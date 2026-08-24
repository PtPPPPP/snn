import { ToolRegistry } from "./tool-registry.mjs";
import { SkillRegistry } from "../skills/skill-registry.mjs";
import { CapabilityResolver } from "./capability-resolver.mjs";

export function createDefaultCapabilityResolver() {
  const tools = new ToolRegistry([
    { id: "workspace.read", name: "Read workspace file", description: "Read a text file inside the assigned workspace.", category: "read", risk: "safe-read", dshToolName: "workspace.read", handlerId: "snn-workspace-read", available: ({ workspace }) => Boolean(workspace) },
    { id: "workspace.write", name: "Write workspace file", description: "Mutate a workspace file.", category: "write", risk: "mutating", dshToolName: "write", handlerId: "dsh-tool-fs.write", available: () => false },
  ]);
  const skills = new SkillRegistry({ toolRegistry: tools, skills: [
    { id: "workspace-reader", name: "Workspace Reader", description: "Read and explain assigned workspace files.", instructions: "Use only the assigned workspace read capability. Do not infer access outside it.", requiredTools: ["workspace.read"] },
    { id: "workspace-writer", name: "Workspace Writer", description: "Mutate workspace files.", instructions: "Requires write access.", requiredTools: ["workspace.write"] },
  ] });
  return new CapabilityResolver({ toolRegistry: tools, skillRegistry: skills });
}
