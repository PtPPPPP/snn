import { SNN_HARNESS_PRESETS, SNN_HARNESS_SKILLS, SNN_HARNESS_TOOLS } from "../../../../shared/snn-harness-catalog.mjs";

/** Resolve registered capabilities under server policy. Client input never supplies a final policy. */
export class CapabilityResolver {
  #presets = new Map();

  constructor({ toolRegistry, skillRegistry, presets = SNN_HARNESS_PRESETS }) {
    if (!toolRegistry || !skillRegistry) throw new TypeError("toolRegistry and skillRegistry are required");
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
    for (const preset of presets) {
      if (preset && typeof preset.id === "string") {
        this.#presets.set(preset.id, Object.freeze({ ...preset }));
      }
    }
  }

  resolvePreset(presetId) {
    const preset = this.#presets.get(presetId);
    if (!preset) throw Object.assign(new Error("Unknown SNN preset"), { code: "SNN_PRESET_NOT_FOUND" });
    return preset;
  }

  hasPreset(presetId) {
    return this.#presets.has(presetId);
  }

  resolve({ workspace, skillId, presetId } = {}) {
    if (!workspace) throw Object.assign(new Error("Workspace is required"), { code: "SNN_WORKSPACE_REQUIRED" });
    const preset = presetId !== undefined ? this.resolvePreset(presetId) : undefined;
    const effectiveSkillId = skillId ?? preset?.defaultSkillId ?? "workspace-reader";
    const skill = this.skillRegistry.resolve(effectiveSkillId);
    const requested = skill.requiredTools.map((id) => this.toolRegistry.get(id));
    const tools = requested.filter((tool) => tool && tool.available({ workspace }));
    if (tools.length !== requested.length) throw Object.assign(new Error("Skill capability is unavailable"), { code: "SNN_SKILL_CAPABILITY_UNAVAILABLE" });
    const ALLOWED_RISKS = new Set(["safe-read", "safe-write", "safe-execute", "safe-fetch"]);
    const denied = tools.find((tool) => !ALLOWED_RISKS.has(tool.risk));
    if (denied) throw Object.assign(new Error("Skill requests a denied capability"), { code: "SNN_CAPABILITY_DENIED" });
    return Object.freeze({
      ...(preset ? { preset, presetId: preset.id } : {}),
      skill,
      skillId: skill.id,
      workspace,
      allowedToolIds: Object.freeze(tools.map((tool) => tool.id)),
      dshToolPolicy: Object.freeze({ default: "deny", rules: Object.freeze(tools.map((tool) => Object.freeze({ toolName: tool.dshToolName, decision: "allow" }))) }),
    });
  }

  catalog() {
    const publicSkills = SNN_HARNESS_SKILLS.filter((s) => this.skillRegistry.has(s.id)).map((s) => ({
      id: s.id,
      name: s.name,
      badge: s.badge,
      description: s.description,
      instructions: s.instructions,
      requiredTools: [...s.requiredTools],
      tools: [...s.requiredTools],
    }));
    const publicPresets = [...this.#presets.values()].map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      badge: p.badge,
      summary: p.summary,
      defaultSkillId: p.defaultSkillId,
      starterPrompts: [...(p.starterPrompts ?? [])],
    }));
    const publicTools = SNN_HARNESS_TOOLS.filter((t) => this.toolRegistry.has(t.id)).map((t) => ({
      id: t.id,
      dshToolName: t.dshToolName,
      title: t.title,
      summary: t.summary,
      category: t.category,
      risk: t.risk,
    }));
    return Object.freeze({
      presets: Object.freeze(publicPresets),
      skills: Object.freeze(publicSkills),
      tools: Object.freeze(publicTools),
    });
  }
}
