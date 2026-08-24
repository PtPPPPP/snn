import assert from "node:assert/strict";
import test from "node:test";
import { buildTestDocx, docxDocumentXml, buildZip } from "./helpers/document-fixtures.mjs";
import { docxParser } from "../src/agent/documents/parsers/docx-parser.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../src/agent/documents/limits.mjs";

const limits = DEFAULT_DOCUMENT_LIMITS;

test("docx parser extracts paragraphs in document order", () => {
  const result = docxParser.parse(buildTestDocx(docxDocumentXml([
    { text: "SNN_DOCX_SENTINEL_first" },
    { text: "second paragraph" },
  ])), limits);
  assert.equal(result.kind, "docx");
  assert.equal(result.truncated, false);
  const rendered = result.render("report.docx");
  const firstAt = rendered.indexOf("SNN_DOCX_SENTINEL_first");
  const secondAt = rendered.indexOf("second paragraph");
  assert.ok(firstAt >= 0 && secondAt > firstAt);
});

test("docx parser renders tables with rows and cells after preceding paragraphs", () => {
  const result = docxParser.parse(buildTestDocx(docxDocumentXml([
    { text: "before table" },
    { table: { rows: [["A1", "B1"], ["A2", "B2"]] } },
    { text: "after table" },
  ])), limits);
  const rendered = result.render("table.docx");
  assert.match(rendered, /\[Table\]\nA1 \| B1\nA2 \| B2/);
  assert.ok(rendered.indexOf("before table") < rendered.indexOf("[Table]"));
  assert.ok(rendered.indexOf("[Table]") < rendered.indexOf("after table"));
});

test("docx parser keeps text outside of run boundaries and decodes entities", () => {
  const xml = `<?xml version="1.0"?><w:document><w:body>`
    + `<w:p><w:r><w:t>alpha &amp; beta</w:t></w:r><w:r><w:t> gamma&#8212;delta</w:t></w:r></w:p>`
    + `</w:body></w:document>`;
  const result = docxParser.parse(buildTestDocx(xml), limits);
  assert.match(result.render("entities.docx"), /alpha & beta gamma—delta/);
});

test("docx parser rejects archives that are not DOCX containers", () => {
  // evil.docx whose body is a ZIP without word/document.xml.
  assert.throws(
    () => docxParser.parse(buildZip([{ name: "harmless.txt", data: "not a document" }]), limits),
    (error) => error.code === "AGENT_DOCUMENT_INVALID",
  );
  // Arbitrary binary bytes.
  assert.throws(() => docxParser.parse(Buffer.from([0xde, 0xad, 0xbe, 0xef, 1, 2, 3]), limits), (error) => error.code === "AGENT_DOCUMENT_INVALID");
});

test("docx parser rejects a container that omits the required document part", () => {
  assert.throws(
    () => docxParser.parse(buildTestDocx("", { omitDocument: true }), limits),
    (error) => error.code === "AGENT_DOCUMENT_INVALID",
  );
});

test("docx parser refuses macro-enabled documents instead of loading them", () => {
  const macro = buildTestDocx(docxDocumentXml([{ text: "macro body" }]), { extraEntries: [{ name: "word/vbaProject.bin", data: Buffer.from([1]) }] });
  assert.throws(() => docxParser.parse(macro, limits), (error) => error.code === "AGENT_DOCUMENT_UNSUPPORTED");
});

test("docx parser enforces archive entry-count limits before expansion", () => {
  const tiny = { ...limits, maxArchiveEntries: 1 };
  const archive = buildTestDocx(docxDocumentXml([{ text: "body" }]));
  assert.throws(() => docxParser.parse(archive, tiny), (error) => error.code === "AGENT_DOCUMENT_EXTRACTION_LIMIT");
});

test("docx parser bounds block count and marks truncation explicitly", () => {
  const tiny = { ...limits, maxDocxBlocks: 2 };
  const blocks = [{ text: "one" }, { text: "two" }, { text: "three" }, { text: "four" }];
  const result = docxParser.parse(buildTestDocx(docxDocumentXml(blocks)), tiny);
  assert.equal(result.truncated, true);
  assert.equal(result.render("bounded.docx").includes("TRUNCATED"), true);
  assert.doesNotMatch(result.render("bounded.docx"), /four/);
});
