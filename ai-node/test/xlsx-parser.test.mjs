import assert from "node:assert/strict";
import test from "node:test";
import { buildTestXlsx, buildZip } from "./helpers/document-fixtures.mjs";
import { xlsxParser } from "../src/agent/documents/parsers/xlsx-parser.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../src/agent/documents/limits.mjs";

const limits = DEFAULT_DOCUMENT_LIMITS;

test("xlsx parser reads multiple sheets with names, strings, numbers, and booleans", () => {
  const result = xlsxParser.parse(buildTestXlsx({
    sheets: [
      { name: "Revenue", cells: [
        { ref: "A1", kind: "s", value: "Month" },
        { ref: "B1", kind: "s", value: "Amount" },
        { ref: "A2", kind: "s", value: "Jan" },
        { ref: "B2", kind: "n", value: "100" },
        { ref: "C2", kind: "b", value: true },
      ] },
      { name: "Notes", cells: [{ ref: "A1", kind: "s", value: "SNN_XLSX_SENTINEL_sheet2" }] },
    ],
  }), limits);

  const rendered = result.render("book.xlsx");
  assert.equal(result.truncated, false);
  assert.match(rendered, /\[Sheet: Revenue\]/);
  assert.match(rendered, /A1: Month/);
  assert.match(rendered, /B2: 100/);
  assert.match(rendered, /C2: TRUE/);
  assert.match(rendered, /\[Sheet: Notes\]/);
  assert.match(rendered, /SNN_XLSX_SENTINEL_sheet2/);
});

test("xlsx parser prefers cached formula values and renders bare formulas as inert text", () => {
  const result = xlsxParser.parse(buildTestXlsx({
    sheets: [
      { name: "Calc", cells: [
        { ref: "A1", kind: "f", formula: "1+1", cached: "2" },
        { ref: "A2", kind: "f", formula: "SUM(A1:A9)" },
      ] },
    ],
  }), limits);
  const rendered = result.render("calc.xlsx");
  assert.match(rendered, /A1: 2/);
  assert.match(rendered, /=SUM\(A1:A9\)/);
  // The formula text is data, never executed — nothing here evaluates it.
  assert.doesNotMatch(rendered, /3/);
});

test("xlsx parser supports inline strings and error cells without crashing", () => {
  const result = xlsxParser.parse(buildTestXlsx({
    sheets: [{ name: "Mixed", cells: [
      { ref: "A1", kind: "inline", value: "inline SNN_XLSX_SENTINEL_inline" },
      { ref: "B1", kind: "e", value: "#VALUE!" },
    ] }],
  }), limits);
  const rendered = result.render("mixed.xlsx");
  assert.match(rendered, /SNN_XLSX_SENTINEL_inline/);
  assert.match(rendered, /#VALUE!/);
});

test("xlsx parser enforces sheet and cell-count limits", () => {
  const tinySheets = { ...limits, maxXlsxSheets: 1 };
  const multi = buildTestXlsx({ sheets: [
    { name: "One", cells: [{ ref: "A1", kind: "n", value: "1" }] },
    { name: "Two", cells: [{ ref: "A1", kind: "n", value: "2" }] },
  ] });
  const sheetResult = xlsxParser.parse(multi, tinySheets);
  assert.equal(sheetResult.truncated, true);
  assert.equal(sheetResult.sheets.length, 1);
  assert.doesNotMatch(sheetResult.render(), /\[Sheet: Two\]/);

  const tinyCells = { ...limits, maxXlsxCells: 2 };
  const wide = buildTestXlsx({ sheets: [{ name: "Wide", cells: [
    { ref: "A1", kind: "n", value: "1" }, { ref: "B1", kind: "n", value: "2" }, { ref: "C1", kind: "n", value: "3" },
  ] }] });
  const cellResult = xlsxParser.parse(wide, tinyCells);
  assert.equal(cellResult.truncated, true);
  assert.doesNotMatch(cellResult.render(), /C1:/);
});

test("xlsx parser bounds total extracted characters and single-cell size", () => {
  const tinyChars = { ...limits, maxExtractedChars: 30 };
  const result = xlsxParser.parse(buildTestXlsx({
    sheets: [{ name: "Big", cells: [{ ref: "A1", kind: "s", value: `SNN_LONG_${"y".repeat(500)}` }, { ref: "A2", kind: "s", value: "tail" }] }],
  }), tinyChars);
  assert.equal(result.truncated, true);
  assert.ok(result.render().length < 200);

  const tinyCell = { ...limits, maxXlsxCellChars: 8 };
  const cellResult = xlsxParser.parse(buildTestXlsx({
    sheets: [{ name: "Cell", cells: [{ ref: "A1", kind: "s", value: `SNN_LONG_${"z".repeat(100)}` }] }],
  }), tinyCell);
  assert.equal(cellResult.truncated, true);
  const renderedCell = cellResult.render();
  assert.ok(!renderedCell.includes(`${"z".repeat(50)}`));
});

test("xlsx parser rejects containers that are not workbooks", () => {
  assert.throws(
    () => xlsxParser.parse(buildZip([{ name: "random.txt", data: "hello" }]), limits),
    (error) => error.code === "AGENT_DOCUMENT_INVALID",
  );
  assert.throws(
    () => xlsxParser.parse(buildTestXlsx({ sheets: [{ name: "Orphan", cells: [] }], omitWorkbook: true }), limits),
    (error) => error.code === "AGENT_DOCUMENT_INVALID",
  );
});

test("xlsx parser refuses macro-enabled workbooks instead of executing them", () => {
  const macroBook = buildTestXlsx({
    macro: true,
    sheets: [{ name: "Macros", cells: [{ ref: "A1", kind: "s", value: "vba" }] }],
  });
  assert.throws(() => xlsxParser.parse(macroBook, limits), (error) => error.code === "AGENT_DOCUMENT_UNSUPPORTED");
});
