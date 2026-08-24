import { defineToolMetadata } from "./tool-metadata.mjs";

/** Product-owned metadata for the built-ins available in the DSH composition. */
export const BUILT_IN_TOOL_METADATA = Object.freeze([
  defineToolMetadata({ name: "workspace.read", displayName: "Read workspace file", risk: "READ", approvalPolicy: "none", category: "workspace" }),
  defineToolMetadata({ name: "workspace.extract", displayName: "Extract document text", risk: "READ", approvalPolicy: "none", category: "document" }),
  defineToolMetadata({ name: "read", displayName: "Read file", risk: "READ", approvalPolicy: "none", category: "filesystem" }),
  defineToolMetadata({ name: "write", displayName: "Write file", risk: "WRITE", approvalPolicy: "required", category: "filesystem" }),
  defineToolMetadata({ name: "execute", displayName: "Execute command", risk: "EXEC", approvalPolicy: "required", category: "process" }),
  defineToolMetadata({ name: "fetch", displayName: "Fetch URL", risk: "EXTERNAL", approvalPolicy: "required", category: "network" }),
]);

export function builtInToolMetadataFor(name) {
  return BUILT_IN_TOOL_METADATA.find((metadata) => metadata.name === name);
}
