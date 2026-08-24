const TOOL_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

/** Server-owned immutable catalog. Registration never grants access. */
export class ToolRegistry {
  #tools = new Map();

  constructor(tools = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool) {
    const normalized = normalizeTool(tool);
    if (this.#tools.has(normalized.id)) throw new Error(`Duplicate SNN tool id: ${normalized.id}`);
    this.#tools.set(normalized.id, normalized);
    return normalized;
  }

  get(id) { return this.#tools.get(id); }
  has(id) { return this.#tools.has(id); }
  list() { return Object.freeze([...this.#tools.values()]); }
  listAvailable(context = {}) { return Object.freeze(this.list().filter((tool) => tool.available(context))); }
}

function normalizeTool(tool) {
  if (!tool || typeof tool !== "object") throw new TypeError("tool must be an object");
  for (const key of ["id", "name", "description", "category", "risk", "dshToolName", "handlerId"]) {
    if (typeof tool[key] !== "string" || tool[key].length === 0) throw new TypeError(`Tool ${key} must be a non-empty string`);
  }
  if (!TOOL_ID_PATTERN.test(tool.id)) throw new TypeError("Tool id is invalid");
  if (typeof tool.available !== "function") throw new TypeError("Tool available must be a function");
  return Object.freeze({ ...tool });
}
