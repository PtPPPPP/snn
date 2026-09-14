import assert from "node:assert/strict";
import test from "node:test";
import { FILE_LIMITS } from "../src/agent/documents/file-limits.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../src/agent/documents/limits.mjs";
import { PUBLIC_UPLOAD_MAX_BYTES } from "../src/agent/public/bff.mjs";

const MiB = 1024 * 1024;
const KiB = 1024;

test("FILE_LIMITS names the four capability layers with their documented values", () => {
  assert.equal(FILE_LIMITS.uploadMaxBytes, 50 * MiB);
  assert.equal(FILE_LIMITS.workspaceQuotaBytes, 500 * MiB);
  assert.equal(FILE_LIMITS.previewMaxBytes, 256 * KiB);
  assert.equal(FILE_LIMITS.directTextEditMaxBytes, 256 * KiB);
  assert.equal(FILE_LIMITS.agentTextEditableBytes, 1 * MiB);
  assert.equal(FILE_LIMITS.documentExtraction, DEFAULT_DOCUMENT_LIMITS, "extraction limits must be the shared frozen object");
  assert.ok(Object.isFrozen(FILE_LIMITS), "registry must be immutable");
});

test("agent read/edit limit is never stricter than browser preview or direct edit (Section 10 invariant)", () => {
  // A previewable or browser-editable file must always be agent-readable/editable,
  // so a tool can never tell the model a stored, previewable file is unreadable.
  assert.ok(FILE_LIMITS.previewMaxBytes <= FILE_LIMITS.agentTextEditableBytes, "preview <= agent-readable");
  assert.ok(FILE_LIMITS.directTextEditMaxBytes <= FILE_LIMITS.agentTextEditableBytes, "browser-edit <= agent-edit");
  // Any file that can be uploaded can also be parsed: the extraction ceiling is
  // never below the upload ceiling, so upload PASS can't imply extract IMPOSSIBLE.
  assert.ok(FILE_LIMITS.documentExtraction.maxDocumentBytes >= FILE_LIMITS.uploadMaxBytes, "extraction ceiling >= upload ceiling");
});

test("public upload cap and workspace quota are sourced from the registry without drift", () => {
  assert.equal(PUBLIC_UPLOAD_MAX_BYTES, FILE_LIMITS.uploadMaxBytes, "public body cap must equal the registry upload limit");
  assert.ok(FILE_LIMITS.workspaceQuotaBytes >= FILE_LIMITS.uploadMaxBytes, "quota must hold at least one max-size upload");
});
