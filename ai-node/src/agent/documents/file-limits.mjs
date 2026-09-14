import { DEFAULT_DOCUMENT_LIMITS } from "./limits.mjs";

/**
 * The single authoritative registry of SNN file-size limits. Every layer reads
 * its bound from here — the public HTTP BFF (preview / direct edit / upload),
 * production ingestion (upload / workspace quota), the DSH workspace bridge
 * (agent native read/edit), and document extraction — so the distinct
 * capability concepts can never drift apart or be conflated with one raw file
 * size deciding everything. Each field's rationale:
 *
 * - uploadMaxBytes: STORAGE/UPLOAD ceiling for a single file. A file up to this
 *   size can be stored in a workspace. It says nothing about preview, editing,
 *   or how much ever reaches the model. The public BFF body cap and the
 *   production FileIngestionService cap both read this, so they cannot diverge.
 * - workspaceQuotaBytes: total stored bytes across one workspace (sum of all
 *   uploaded files), a storage-fairness bound independent of any single file.
 * - previewMaxBytes: BROWSER read-only text preview envelope. Kept small to
 *   protect UX and server memory; a larger file is still downloadable and
 *   agent-readable, so preview size never gates those other capabilities.
 * - directTextEditMaxBytes: BROWSER direct text edit envelope. Equal to preview
 *   by design: a file is browser-editable exactly when it loads as preview
 *   (UTF-8 text within the bound). This is a browser-only path, distinct from
 *   the agent's own edit ceiling below.
 * - agentTextEditableBytes: AGENT native read/edit ceiling for the DSH tool-fs
 *   bridge. Intentionally LARGER than preview so the agent can read and edit a
 *   file the browser only downloads. The required invariant is
 *   previewMaxBytes <= agentTextEditableBytes: a previewable file is always
 *   agent-readable, so a tool can never tell the model a stored, previewable
 *   file is unreadable. (The reverse — a browser-editable file the agent cannot
 *   open — is the contradiction this ordering forbids.)
 * - documentExtraction: AGENT_DOCUMENT_EXTRACTION_LIMITS for DOCX/XLSX/PDF
 *   parsing (see limits.mjs). Unrelated to text preview/edit; it bounds parsed
 *   structure (chars, pages, rows, archive entries), not raw upload size.
 *
 * Attachment aggregation (attachment-context-resolver.mjs) is metadata-only and
 * derives its own declared-size guard from maxAttachmentsPerRun x
 * uploadMaxBytes so it is never stricter than this storage layer.
 */
export const FILE_LIMITS = Object.freeze({
  uploadMaxBytes: 50 * 1024 * 1024,
  workspaceQuotaBytes: 500 * 1024 * 1024,
  previewMaxBytes: 256 * 1024,
  directTextEditMaxBytes: 256 * 1024,
  agentTextEditableBytes: 1 * 1024 * 1024,
  documentExtraction: DEFAULT_DOCUMENT_LIMITS,
});
