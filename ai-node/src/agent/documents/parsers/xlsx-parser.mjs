import { documentError } from "../limits.mjs";
import { decodeEntities } from "../xml-text.mjs";
import { BoundedZipArchive, readZipText } from "../bounded-zip.mjs";

/**
 * Bounded XLSX workbook extraction. Sheets are read in workbook order; cell
 * values come only from the file itself (cached formula results preferred,
 * formulas rendered as inert text). No calculation engine, no macro
 * execution, no external links — the parser never opens anything but this
 * container.
 */
export const xlsxParser = {
  id: "xlsx",
  extensions: ["xlsx"],
  parse(buffer, limits) {
    if (buffer.length > limits.maxDocumentBytes) throw documentError("AGENT_DOCUMENT_TOO_LARGE");
    let archive;
    try { archive = BoundedZipArchive.open(buffer, limits); }
    catch (error) { throw normalize(error); }
    if (!archive.has("[Content_Types].xml") || !archive.has("xl/workbook.xml")) throw documentError("AGENT_DOCUMENT_INVALID");
    if (archive.names().some((name) => name.includes("vbaProject"))) throw documentError("AGENT_DOCUMENT_UNSUPPORTED");

    const sharedStrings = readSharedStrings(archive, limits);
    const sheetNames = readSheetNames(archive, limits);
    if (sheetNames.length === 0) throw documentError("AGENT_DOCUMENT_INVALID");

    let truncated = false;
    const sheets = [];
    for (const sheet of sheetNames) {
      if (sheets.length >= limits.maxXlsxSheets) { truncated = true; break; }
      if (!archive.has(sheet.target)) continue;
      sheets.push(parseSheet(archive, sheet, sharedStrings, limits, () => { truncated = true; }));
    }
    if (sheetNames.length > sheets.length) truncated = true;

    return {
      kind: "xlsx",
      truncated,
      sheets: sheets.map((sheet) => ({ name: sheet.name })),
      render() {
        return `Workbook\n\n${sheets.map((sheet) => `[Sheet: ${sheet.name}]\n${sheet.lines.join("\n")}`).join("\n\n")}${truncated ? "\n\n[TRUNCATED] Extraction stopped at the server limit." : ""}`;
      },
    };
  },
};

function normalize(error) {
  if (typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_")) return error;
  return documentError("AGENT_DOCUMENT_INVALID");
}

function readSharedStrings(archive, limits) {
  if (!archive.has("xl/sharedStrings.xml")) return [];
  const xml = safeText(archive, "xl/sharedStrings.xml", limits);
  const strings = [];
  const itemPattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\/>/g;
  for (const match of xml.matchAll(itemPattern)) {
    if (strings.length >= limits.maxXlsxCells) break;
    let value = "";
    for (const text of match[1]?.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? []) value += text[1];
    strings.push(decodeEntities(value));
  }
  return strings;
}

function readSheetNames(archive, limits) {
  const workbook = safeText(archive, "xl/workbook.xml", limits);
  const relationships = archive.has("xl/_rels/workbook.xml.rels")
    ? safeText(archive, "xl/_rels/workbook.xml.rels", limits)
    : "";
  const targets = new Map();
  for (const match of relationships.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g)) {
    targets.set(match[1], match[2]);
  }
  const names = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = match[0];
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const relationshipId = /r:id="([^"]+)"/.exec(tag)?.[1];
    if (typeof name !== "string" || typeof relationshipId !== "string") continue;
    const target = targets.get(relationshipId);
    if (typeof target !== "string" || target.includes("://")) continue; // External workbooks are never resolved.
    const normalized = target.replace(/^\//, "").replace(/^(?!xl\/)/, "xl/");
    // No cap here on purpose: the parse loop owns the sheet limit and must
    // observe overflow to report truncation truthfully.
    names.push({ name: decodeEntities(name), target: normalized });
  }
  return names;
}

function parseSheet(archive, sheet, sharedStrings, limits, onTruncated) {
  let xml;
  try { xml = archive.readEntry(sheet.target).toString("utf8"); }
  catch (error) { throw normalize(error); }

  const lines = [];
  let rowCount = 0;
  let cellCount = 0;
  let remaining = limits.maxExtractedChars;

  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  for (const rowMatch of xml.matchAll(rowPattern)) {
    if (rowCount >= limits.maxXlsxRows || remaining <= 0) { onTruncated(); break; }
    rowCount += 1;
    const cells = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      if (cellCount >= limits.maxXlsxCells || remaining <= 0) { onTruncated(); break; }
      cellCount += 1;
      const attributes = cellMatch[1] ?? cellMatch[3] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = /r="([A-Z]+\d+)"/.exec(attributes)?.[1];
      const type = /t="(\w+)"/.exec(attributes)?.[1];
      const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const inlineText = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body);
      const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];

      let value;
      if (type === "s" && rawValue !== undefined) value = sharedStrings[Number(rawValue)] ?? "";
      else if (type === "inlineStr" && inlineText) value = [...inlineText[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join("");
      else if (type === "b") value = rawValue === "1" ? "TRUE" : rawValue === "0" ? "FALSE" : rawValue ?? "";
      else if (type === "e") value = rawValue ?? "#ERROR";
      else if (rawValue !== undefined && rawValue !== "") value = rawValue;
      else if (formula !== undefined) value = `=${decodeEntities(formula)}`;
      else value = "";

      value = decodeEntities(value ?? "");
      if (value.length > limits.maxXlsxCellChars) { value = value.slice(0, limits.maxXlsxCellChars); onTruncated(); }
      if (value.length === 0) continue;
      if (value.length > remaining) { value = value.slice(0, Math.max(0, remaining)); onTruncated(); }
      remaining -= value.length;
      cells.push(`${reference ?? `C${cells.length + 1}`}: ${value}`);
    }
    if (cells.length > 0) lines.push(cells.join("\n"));
  }
  return { name: sheet.name, lines };
}

function safeText(archive, name, limits) {
  try { return readZipText(archive, name, limits.maxExtractedChars * 4 + 1_048_576); }
  catch (error) { throw normalize(error); }
}
