import { defineToolMetadata } from "./tool-metadata.mjs";

/** Product-owned metadata for the built-ins available in the DSH composition. */
export const BUILT_IN_TOOL_METADATA = Object.freeze([
  defineToolMetadata({ name: "workspace.read", displayName: "Read workspace file", risk: "READ", approvalPolicy: "none", category: "workspace" }),
  defineToolMetadata({ name: "workspace.extract", displayName: "Extract document text", risk: "READ", approvalPolicy: "none", category: "document" }),
  defineToolMetadata({ name: "workspace.open", displayName: "Open attached file", risk: "READ", approvalPolicy: "none", category: "document" }),
  defineToolMetadata({ name: "read", displayName: "Read workspace file", risk: "READ", approvalPolicy: "none", category: "workspace" }),
  defineToolMetadata({ name: "write", displayName: "Write workspace file", risk: "WRITE", approvalPolicy: "none", category: "workspace" }),
  defineToolMetadata({ name: "edit", displayName: "Edit workspace file", risk: "WRITE", approvalPolicy: "none", category: "workspace" }),
  defineToolMetadata({ name: "workspace.execute", displayName: "Execute command", risk: "EXEC", approvalPolicy: "none", category: "process" }),
  defineToolMetadata({ name: "workspace.fetch", displayName: "Fetch URL", risk: "EXTERNAL", approvalPolicy: "none", category: "network" }),
]);

export function builtInToolMetadataFor(name) {
  return BUILT_IN_TOOL_METADATA.find((metadata) => metadata.name === name);
}
