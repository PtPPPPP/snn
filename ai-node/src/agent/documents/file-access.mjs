import { DocumentParserRegistry } from "./document-parser-registry.mjs";
import { pdfParser } from "./parsers/pdf-parser.mjs";
import { docxParser } from "./parsers/docx-parser.mjs";
import { xlsxParser } from "./parsers/xlsx-parser.mjs";

/**
 * Server-owned file access classification shared by the attachment resolver
 * (server side) and the workspace.open tool (runtime child side), so both
 * layers always agree on what a stored file may be opened as.
 */

/** Plain-text extensions stay with bounded text reads; the document layer refuses them. */
export const TEXT_EXTENSIONS = Object.freeze(new Set(["txt", "md", "markdown", "csv", "json", "log", "xml", "yml", "yaml", "html", "htm", "ts", "tsx", "js", "mjs", "cjs", "py", "java", "c", "h", "cpp", "go", "rs", "rb", "sh", "sql", "ini", "toml"]));

export function createDefaultDocumentParserRegistry() {
  const registry = new DocumentParserRegistry();
  registry.register(pdfParser);
  registry.register(docxParser);
  registry.register(xlsxParser);
  return registry;
}

const DEFAULT_REGISTRY = createDefaultDocumentParserRegistry();

export const ACCESS_MODES = Object.freeze({
  textRead: "text-read",
  documentExtract: "document-extract",
  unsupported: "unsupported",
});

/** @param {string | undefined} name */
function extensionOf(name) {
  return /\.([a-z0-9]+)$/i.exec(typeof name === "string" ? name : "")?.[1]?.toLowerCase() ?? "";
}

/**
 * Deterministically classify one server manifest entry into an access mode.
 * Registered document extensions route to parsers first (a literal-text PDF
 * may sniff as "text"), then server-sniffed plain text routes to bounded text
 * reads. Unknown combinations fail closed.
 */
export function classifyFileAccess(entry, registry = DEFAULT_REGISTRY) {
  const extension = extensionOf(entry?.originalName);
  if (extension !== "" && registry.get(extension)) return ACCESS_MODES.documentExtract;
  if (entry?.kind === "text") return extension === "" || TEXT_EXTENSIONS.has(extension) ? ACCESS_MODES.textRead : ACCESS_MODES.unsupported;
  return ACCESS_MODES.unsupported;
}

/** Stable display kind derived only from server-owned manifest data. */
export function manifestFileKind(entry) {
  if (entry?.kind === "text") return "text";
  const extension = extensionOf(entry?.originalName);
  return extension === "" ? "binary" : extension;
}
