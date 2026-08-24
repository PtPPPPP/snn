const SKILL_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

/** Declarative server-owned skills; skills never execute code or grant tools. */
export class SkillRegistry {
  #skills = new Map();

  constructor({ toolRegistry, skills = [] }) {
    if (!toolRegistry || typeof toolRegistry.has !== "function") throw new TypeError("toolRegistry is required");
    this.toolRegistry = toolRegistry;
    for (const skill of skills) this.register(skill);
  }

  register(skill) {
    const normalized = normalizeSkill(skill);
    if (this.#skills.has(normalized.id)) throw new Error(`Duplicate SNN skill id: ${normalized.id}`);
    for (const toolId of normalized.requiredTools) {
      if (!this.toolRegistry.has(toolId)) throw new Error(`Skill ${normalized.id} requires unknown tool: ${toolId}`);
    }
    this.#skills.set(normalized.id, normalized);
    return normalized;
  }

  get(id) { return this.#skills.get(id); }
  has(id) { return this.#skills.has(id); }
  list() { return Object.freeze([...this.#skills.values()]); }
  resolve(id) {
    const skill = this.get(id);
    if (!skill) throw Object.assign(new Error("Unknown SNN skill"), { code: "SNN_SKILL_NOT_FOUND" });
    return skill;
  }
}

function normalizeSkill(skill) {
  if (!skill || typeof skill !== "object") throw new TypeError("skill must be an object");
  for (const key of ["id", "name", "description", "instructions"]) {
    if (typeof skill[key] !== "string" || skill[key].length === 0) throw new TypeError(`Skill ${key} must be a non-empty string`);
  }
  if (!SKILL_ID_PATTERN.test(skill.id)) throw new TypeError("Skill id is invalid");
  if (!Array.isArray(skill.requiredTools) || !skill.requiredTools.every((id) => typeof id === "string")) throw new TypeError("Skill requiredTools must be a string array");
  if (new Set(skill.requiredTools).size !== skill.requiredTools.length) throw new TypeError("Skill requiredTools must be unique");
  return Object.freeze({ ...skill, requiredTools: Object.freeze([...skill.requiredTools]) });
}
