/**
 * Project SNN's default product policy from already-declared tool metadata.
 * This function does not execute or intercept a tool; DSH remains the sole
 * execution authority and must enforce the result through `tools/pre-execute`.
 *
 * @param {{ risk: string } | undefined} metadata
 * @returns {{ decision: "allow" | "deny", reason?: string }}
 */
export function projectDefaultToolPolicy(metadata) {
  if (metadata?.risk === "READ") return { decision: "allow" };
  if (metadata?.risk === "WRITE") return { decision: "deny", reason: "SNN default policy denies write tools" };
  if (metadata?.risk === "EXEC") return { decision: "deny", reason: "SNN default policy denies execution tools" };
  if (metadata?.risk === "EXTERNAL") return { decision: "deny", reason: "SNN default policy denies external tools" };
  return { decision: "deny", reason: "SNN default policy denies tools without declared metadata" };
}

/** Convert SNN metadata into the generic per-session DSH SDK policy payload. */
export function createDshToolPolicy(metadataEntries) {
  if (!Array.isArray(metadataEntries)) throw new TypeError("metadataEntries must be an array");
  const rules = metadataEntries.map((metadata) => {
    if (!metadata || typeof metadata.name !== "string" || metadata.name.length === 0) {
      throw new TypeError("Tool metadata name must be a non-empty string");
    }
    return { toolName: metadata.name, decision: projectDefaultToolPolicy(metadata).decision };
  });
  const names = new Set(rules.map((rule) => rule.toolName));
  if (names.size !== rules.length) throw new TypeError("Tool metadata names must be unique");
  return Object.freeze({ default: "deny", rules: Object.freeze(rules) });
}
