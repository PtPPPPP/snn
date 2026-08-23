/** SNN product-level tool risk categories. */
export const TOOL_RISKS = Object.freeze(["READ", "WRITE", "EXEC", "EXTERNAL"]);

const RISK_SET = new Set(TOOL_RISKS);
const APPROVAL_POLICIES = new Set(["none", "required"]);

/**
 * Validate and freeze product metadata. This does not register or execute tools.
 * @param {{ name: string, displayName: string, risk: string, approvalPolicy: string, category: string }} metadata
 */
export function defineToolMetadata(metadata) {
  for (const field of ["name", "displayName", "category"]) {
    if (typeof metadata[field] !== "string" || metadata[field].length === 0) {
      throw new TypeError(`Tool metadata ${field} must be a non-empty string`);
    }
  }
  if (!RISK_SET.has(metadata.risk)) throw new TypeError(`Unknown tool risk: ${String(metadata.risk)}`);
  if (!APPROVAL_POLICIES.has(metadata.approvalPolicy)) {
    throw new TypeError(`Unknown approval policy: ${String(metadata.approvalPolicy)}`);
  }
  return Object.freeze({ ...metadata });
}

/** Map DSH presentation intent to SNN risk; ambiguous `other` requires an explicit decision. */
export function riskFromDshCallKind(kind) {
  switch (kind) {
    case "read":
    case "search":
      return "READ";
    case "edit":
    case "delete":
    case "move":
      return "WRITE";
    case "execute":
      return "EXEC";
    case "fetch":
      return "EXTERNAL";
    default:
      throw new TypeError(`DSH tool call kind requires an explicit SNN risk mapping: ${String(kind)}`);
  }
}

