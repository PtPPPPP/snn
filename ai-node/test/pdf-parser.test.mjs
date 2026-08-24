import assert from "node:assert/strict";
import test from "node:test";
import { buildTestPdf } from "./helpers/document-fixtures.mjs";
import { pdfParser } from "../src/agent/documents/parsers/pdf-parser.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../src/agent/documents/limits.mjs";

const limits = DEFAULT_DOCUMENT_LIMITS;

test("pdf parser extracts literal text from a valid single-page document", () => {
  const result = pdfParser.parse(buildTestPdf({ pages: [["SNN_PDF_SENTINEL_alpha", "second line"]] }), limits);
  assert.equal(result.kind, "pdf");
  assert.equal(result.truncated, false);
  assert.equal(result.pageCount, 1);
  assert.match(result.pages[0], /SNN_PDF_SENTINEL_alpha/);
  assert.match(result.pages[0], /second line/);
});

test("pdf parser keeps multi-page order and page counts", () => {
  const result = pdfParser.parse(buildTestPdf({
    pages: [
      ["first-page-marker"],
      ["second-page-marker"],
      ["third-page-marker"],
    ],
  }), limits);
  assert.equal(result.pageCount, 3);
  assert.ok(result.pages[0].includes("first-page-marker"));
  assert.ok(result.pages[1].includes("second-page-marker"));
  assert.ok(result.pages[2].includes("third-page-marker"));
  assert.ok(result.pages[0].indexOf("first") < result.pages[2].indexOf("third") + result.pages[0].length + result.pages[1].length);
});

test("pdf parser handles flate-compressed content streams", () => {
  const result = pdfParser.parse(buildTestPdf({ pages: [["compressed SNN_PDF_SENTINEL_beta"]], flate: true }), limits);
  assert.match(result.pages[0], /SNN_PDF_SENTINEL_beta/);
});

test("pdf parser enforces the server page limit early with an explicit truncation flag", () => {
  const tiny = { ...limits, maxPdfPages: 2 };
  const result = pdfParser.parse(buildTestPdf({
    pages: [["page-one"], ["page-two"], ["page-three"], ["page-four"]],
  }), tiny);
  assert.equal(result.pageCount, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.pages.some((text) => text.includes("page-three")), false);
});

test("pdf parser enforces the extracted-character budget", () => {
  const tiny = { ...limits, maxExtractedChars: 10 };
  const result = pdfParser.parse(buildTestPdf({ pages: [[`SNN_LONG_LINE_${"x".repeat(200)}`]] }), tiny);
  assert.equal(result.truncated, true);
  assert.ok(result.pages[0].length <= 12);
});

test("pdf parser rejects non-PDF bytes as invalid", () => {
  for (const garbage of [Buffer.from("<html>not a pdf</html>"), Buffer.alloc(0), Buffer.from("PK\x03\x04 zip masquerading")]) {
    assert.throws(() => pdfParser.parse(garbage, limits), (error) => error.code === "AGENT_DOCUMENT_INVALID");
  }
});

test("pdf parser fails closed on encrypted documents", () => {
  assert.throws(
    () => pdfParser.parse(buildTestPdf({ pages: [["secret"]], encrypted: true }), limits),
    (error) => error.code === "AGENT_DOCUMENT_ENCRYPTED",
  );
});

test("pdf parser reports scanned documents without inventing text", () => {
  // A structurally valid PDF whose pages carry no text-showing operators.
  const scanned = buildTestPdf({ pages: [[], []] });
  assert.throws(() => pdfParser.parse(scanned, limits), (error) => error.code === "AGENT_DOCUMENT_NO_TEXT");
});
