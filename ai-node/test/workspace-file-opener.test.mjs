import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";
import { DocumentExtractionService, readWorkspaceFileEntry } from "../src/agent/documents/document-extraction-service.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../src/agent/documents/limits.mjs";
import { WorkspaceFileOpener } from "../src/agent/workspace/workspace-file-opener.mjs";
import { buildTestPdf, buildTestDocx, docxDocumentXml, buildTestXlsx } from "./helpers/document-fixtures.mjs";

function body(bytes) { return (async function* () { yield Buffer.from(bytes); })(); }

async function makeWorkspace(label) {
  const root = await mkdtemp(join(tmpdir(), `snn-open-${label}-`));
  const workspaceManager = new WorkspaceManager();
  const workspace = await workspaceManager.register(root);
  const ingestion = new FileIngestionService({ workspaceManager });
  const documents = new DocumentExtractionService({ workspaceRoot: root, limits: DEFAULT_DOCUMENT_LIMITS });
  const opener = new WorkspaceFileOpener({ root, documents });
  const upload = (originalName, bytes, contentType = "application/octet-stream") =>
    ingestion.ingest({ workspaceId: workspace.id, originalName, contentType, body: body(bytes) });
  return { root, workspace, ingestion, opener, upload };
}

test("workspace file opener returns bounded text for text-readable attachments", async () => {
  const env = await makeWorkspace("text");
  try {
    const file = await env.upload("notes.md", Buffer.from("SNN_OPEN_TEXT_SENTINEL_4411\n"), "text/markdown");
    assert.equal(await env.opener.open(file.fileId), "SNN_OPEN_TEXT_SENTINEL_4411\n");
  } finally { await rm(env.root, { recursive: true, force: true }); }
});

test("workspace file opener extracts PDF, DOCX, and XLSX by fileId", async () => {
  const env = await makeWorkspace("documents");
  try {
    const pdf = await env.upload("report.pdf", buildTestPdf({ pages: [["SNN_OPEN_PDF_SENTINEL_5522"]] }));
    const docx = await env.upload("minutes.docx", buildTestDocx(docxDocumentXml([{ text: "SNN_OPEN_DOCX_SENTINEL_6633" }])));
    const xlsx = await env.upload("book.xlsx", buildTestXlsx({ sheets: [{ name: "Data", cells: [{ ref: "A1", kind: "s", value: "SNN_OPEN_XLSX_SENTINEL_7744" }] }] }));
    assert.match(await env.opener.open(pdf.fileId), /SNN_OPEN_PDF_SENTINEL_5522/);
    assert.match(await env.opener.open(docx.fileId), /SNN_OPEN_DOCX_SENTINEL_6633/);
    assert.match(await env.opener.open(xlsx.fileId), /SNN_OPEN_XLSX_SENTINEL_7744/);
  } finally { await rm(env.root, { recursive: true, force: true }); }
});

test("workspace file opener fails closed for unknown, foreign, deleted, and unsupported files", async () => {
  const envA = await makeWorkspace("fail-a");
  const envB = await makeWorkspace("fail-b");
  try {
    const foreign = await envB.upload("b.txt", Buffer.from("SNN_FOREIGN_ROOT_SECRET"), "text/plain");
    await assert.rejects(() => envA.opener.open(foreign.fileId), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");

    await assert.rejects(() => envA.opener.open("snn-file-eeeeeeee-0000-4000-8000-00000000000e"), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");
    await assert.rejects(() => envA.opener.open("../escape.pdf"), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");
    await assert.rejects(() => envA.opener.open(undefined), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");

    const doomed = await envA.upload("doomed.txt", Buffer.from("delete me"), "text/plain");
    await envA.ingestion.remove({ workspaceId: envA.workspace.id, fileId: doomed.fileId });
    await assert.rejects(() => envA.opener.open(doomed.fileId), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");

    const png = await envA.upload("image.png", Buffer.from([0, 1, 2, 3]), "image/png");
    await assert.rejects(() => envA.opener.open(png.fileId), (error) => error.code === "AGENT_DOCUMENT_UNSUPPORTED");
  } finally {
    await rm(envA.root, { recursive: true, force: true });
    await rm(envB.root, { recursive: true, force: true });
  }
});

test("workspace file opener rejects mutated content and corrupt manifests without fallback", async () => {
  const env = await makeWorkspace("integrity");
  try {
    const text = await env.upload("integrity.txt", Buffer.from("original identity"), "text/plain");
    await writeFile(join(env.root, (await readWorkspaceFileEntry(env.root, text.fileId)).storedName), "tampered content!!");
    await assert.rejects(() => env.opener.open(text.fileId), (error) => error.code === "AGENT_DOCUMENT_INVALID");

    const doc = await env.upload("swap.pdf", buildTestPdf({ pages: [["real pdf"]] }));
    await writeFile(join(env.root, (await readWorkspaceFileEntry(env.root, doc.fileId)).storedName), Buffer.from("%PDF-1.4 not really"));
    await assert.rejects(() => env.opener.open(doc.fileId), (error) => error.code === "AGENT_DOCUMENT_INVALID");

    const valid = await env.upload("valid.txt", Buffer.from("kept"), "text/plain");
    await writeFile(join(env.root, ".snn-workspace-files.json"), "not json at all");
    await assert.rejects(() => env.opener.open(valid.fileId), (error) => error.code === "AGENT_DOCUMENT_INVALID");
  } finally { await rm(env.root, { recursive: true, force: true }); }
});
