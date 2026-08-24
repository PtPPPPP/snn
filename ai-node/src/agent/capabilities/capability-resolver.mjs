/** Resolve registered capabilities under server policy. Client input never supplies a final policy. */
export class CapabilityResolver {
  constructor({ toolRegistry, skillRegistry }) {
    if (!toolRegistry || !skillRegistry) throw new TypeError("toolRegistry and skillRegistry are required");
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
  }

  resolve({ workspace, skillId = "workspace-reader" } = {}) {
    if (!workspace) throw Object.assign(new Error("Workspace is required"), { code: "SNN_WORKSPACE_REQUIRED" });
    const skill = this.skillRegistry.resolve(skillId);
    const requested = skill.requiredTools.map((id) => this.toolRegistry.get(id));
    const tools = requested.filter((tool) => tool && tool.available({ workspace }));
    if (tools.length !== requested.length) throw Object.assign(new Error("Skill capability is unavailable"), { code: "SNN_SKILL_CAPABILITY_UNAVAILABLE" });
    const ALLOWED_RISKS = new Set(["safe-read", "safe-write", "safe-execute", "safe-fetch"]);
    const denied = tools.find((tool) => !ALLOWED_RISKS.has(tool.risk));
    if (denied) throw Object.assign(new Error("Skill requests a denied capability"), { code: "SNN_CAPABILITY_DENIED" });
    return Object.freeze({
      skill,
      workspace,
      allowedToolIds: Object.freeze(tools.map((tool) => tool.id)),
      dshToolPolicy: Object.freeze({ default: "deny", rules: Object.freeze(tools.map((tool) => Object.freeze({ toolName: tool.dshToolName, decision: "allow" }))) }),
    });
  }
}
