import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileIngestionService } from "../src/agent/workspace/file-ingestion-service.mjs";
import { WorkspaceManager } from "../src/agent/workspace/workspace-manager.mjs";
import { DocumentExtractionService, readWorkspaceFileEntry } from "../src/agent/documents/document-extraction-service.mjs";
import { DEFAULT_DOCUMENT_LIMITS, clampDocumentLimits } from "../src/agent/documents/limits.mjs";
import { buildTestPdf, buildTestDocx, docxDocumentXml, buildTestXlsx, buildZip } from "./helpers/document-fixtures.mjs";

const limits = DEFAULT_DOCUMENT_LIMITS;

async function makeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "snn-doc-service-"));
  const workspaceManager = new WorkspaceManager();
  const workspace = await workspaceManager.register(root);
  const ingestion = new FileIngestionService({ workspaceManager });
  const service = new DocumentExtractionService({ workspaceRoot: root, limits });
  return { root, workspace, ingestion, service };
}

const upload = async (ingestion, workspaceId, name, buffer) =>
  (await ingestion.ingest({ workspaceId, originalName: name, contentType: "application/octet-stream", body: [buffer] })).fileId;

test("document extraction service parses an ingested pdf by fileId", async () => {
  const { workspace, ingestion, service, root } = await makeWorkspace();
  try {
    const pdf = buildTestPdf({ pages: [["SNN_PDF_SENTINEL_service"], ["page two content"]] });
    const fileId = await upload(ingestion, workspace.id, "report.pdf", pdf);
    const entry = await readWorkspaceFileEntry(root, fileId);
    const before = await readFile(join(root, ".snn-workspace-files.json"));

    const output = await service.extract(fileId);
    assert.match(output, /Document: report\.pdf/);
    assert.match(output, /\[Page 1\]\n[\s\S]*SNN_PDF_SENTINEL_service/);
    assert.match(output, /\[Page 2\]/);
    assert.doesNotMatch(output, /page three/);

    // Read-only guarantee: original bytes and manifest unchanged by extraction.
    const after = await readFile(join(root, ".snn-workspace-files.json"));
    assert.equal(before.equals(after), true);
    assert.ok(await readFile(join(root, entry.storedName)).then((bytes) => bytes.equals(pdf)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("document extraction service rejects unknown and foreign fileIds fail-closed", async () => {
  const first = await makeWorkspace();
  const second = await makeWorkspace();
  try {
    const fileId = await upload(first.ingestion, first.workspace.id, "secret.pdf", buildTestPdf({ pages: [["SNN_DOCUMENT_A_SECRET_7311"]] }));
    await assert.rejects(() => second.service.extract(fileId), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");
    await assert.rejects(() => first.service.extract("snn-file-00000000-0000-4000-8000-000000000000"), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");
    for (const malformed of ["../../etc/passwd", "report.pdf", "", "snn-agent-not-a-file"]) {
      await assert.rejects(() => first.service.extract(malformed), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");
    }
  } finally {
    await rm(first.root, { recursive: true, force: true });
    await rm(second.root, { recursive: true, force: true });
  }
});

test("document extraction service fails closed when the file vanished or was mutated", async () => {
  const { workspace, ingestion, service, root } = await makeWorkspace();
  try {
    const fileId = await upload(ingestion, workspace.id, "gone.pdf", buildTestPdf({ pages: [["data"]] }));
    const gone = await readWorkspaceFileEntry(root, fileId);
    await rm(join(root, gone.storedName));
    await assert.rejects(() => service.extract(fileId), (error) => error.code === "AGENT_DOCUMENT_NOT_FOUND");

    const mutatedId = await upload(ingestion, workspace.id, "mutated.pdf", buildTestPdf({ pages: [["original"]] }));
    const mutated = await readWorkspaceFileEntry(root, mutatedId);
    await writeFile(join(root, mutated.storedName), Buffer.from("replaced by an attacker"));
    await assert.rejects(() => service.extract(mutatedId), (error) => error.code === "AGENT_DOCUMENT_INVALID");

    const swappedId = await upload(ingestion, workspace.id, "swapped.docx", buildTestDocx(docxDocumentXml([{ text: "real" }])));
    const swapped = await readWorkspaceFileEntry(root, swappedId);
    await rm(join(root, swapped.storedName));
    await writeFile(join(root, swapped.storedName), buildZip([{ name: "word/document.xml", data: "<w:document/>" }]));
    await assert.rejects(() => service.extract(swappedId), (error) => error.code === "AGENT_DOCUMENT_INVALID");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("document extraction service routes plain-text kinds to workspace.read and opaque files to unsupported", async () => {
  const { workspace, ingestion, service, root } = await makeWorkspace();
  try {
    const notesId = await upload(ingestion, workspace.id, "notes.md", Buffer.from("# markdown"));
    const csvId = await upload(ingestion, workspace.id, "table.csv", Buffer.from("a,b\n1,2\n"));
    const exeId = await upload(ingestion, workspace.id, "program.exe", Buffer.from([0x4d, 0x5a, 0, 1]));
    const zipId = await upload(ingestion, workspace.id, "bundle.zip", buildZip([{ name: "inner.txt", data: "x" }]));
    for (const id of [notesId, csvId]) {
      await assert.rejects(() => service.extract(id), (error) => error.code === "AGENT_DOCUMENT_UNSUPPORTED");
    }
    for (const id of [exeId, zipId]) {
      await assert.rejects(() => service.extract(id), (error) => error.code === "AGENT_DOCUMENT_UNSUPPORTED");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("document extraction service rejects extension and signature mismatches", async () => {
  const { workspace, ingestion, service, root } = await makeWorkspace();
  try {
    // evil.pdf whose body is actually a ZIP container.
    const evilPdf = await upload(ingestion, workspace.id, "evil.pdf", buildZip([{ name: "x.txt", data: "not a pdf" }]));
    await assert.rejects(() => service.extract(evilPdf), (error) => error.code === "AGENT_DOCUMENT_INVALID");
    // report.docx whose body is a valid PDF.
    const lyingDocx = await upload(ingestion, workspace.id, "report.docx", buildTestPdf({ pages: [["pdf inside docx name"]] }));
    await assert.rejects(() => service.extract(lyingDocx), (error) => error.code === "AGENT_DOCUMENT_INVALID");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("document extraction service surfaces encrypted and macro documents with stable codes", async () => {
  const { workspace, ingestion, service, root } = await makeWorkspace();
  try {
    const encryptedId = await upload(ingestion, workspace.id, "locked.pdf", buildTestPdf({ pages: [["hidden"]], encrypted: true }));
    await assert.rejects(() => service.extract(encryptedId), (error) => error.code === "AGENT_DOCUMENT_ENCRYPTED");
    const macroId = await upload(ingestion, workspace.id, "macros.xlsx", buildTestXlsx({
      macro: true,
      sheets: [{ name: "M", cells: [{ ref: "A1", kind: "n", value: "1" }] }],
    }));
    await assert.rejects(() => service.extract(macroId), (error) => error.code === "AGENT_DOCUMENT_UNSUPPORTED");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("document extraction service bounds output with explicit truncation", async () => {
  const { workspace, ingestion, root } = await makeWorkspace();
  try {
    const big = "SNN_PDF_SENTINEL_overflow " + "filler ".repeat(200);
    const fileId = await upload(ingestion, workspace.id, "big.pdf", buildTestPdf({ pages: [[big], [big]] }));
    const bounded = new DocumentExtractionService({
      workspaceRoot: root,
      limits: clampDocumentLimits({ maxExtractedChars: 60 }),
    });
    const output = await bounded.extract(fileId);
    assert.match(output, /TRUNCATED/);
    assert.ok(output.length < 500);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("document limits clamp configuration so no path can exceed server policy", () => {
  const clamped = clampDocumentLimits({
    maxExtractedChars: Number.MAX_SAFE_INTEGER,
    maxPdfPages: -5,
    maxXlsxCells: "not-a-number",
  });
  assert.equal(clamped.maxExtractedChars, DEFAULT_DOCUMENT_LIMITS.maxExtractedChars);
  assert.equal(clamped.maxPdfPages, DEFAULT_DOCUMENT_LIMITS.maxPdfPages);
  assert.equal(clamped.maxXlsxCells, DEFAULT_DOCUMENT_LIMITS.maxXlsxCells);
});

test("document extraction service reports scanned documents without inventing content", async () => {
  const { workspace, ingestion, service, root } = await makeWorkspace();
  try {
    const scannedId = await upload(ingestion, workspace.id, "scan.pdf", buildTestPdf({ pages: [[], []] }));
    await assert.rejects(() => service.extract(scannedId), (error) => error.code === "AGENT_DOCUMENT_NO_TEXT");
  } finally { await rm(root, { recursive: true, force: true }); }
});
