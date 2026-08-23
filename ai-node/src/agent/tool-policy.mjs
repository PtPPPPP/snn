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

