import { posix } from "node:path";
import { createZipWriter } from "@office-kit/xlsx/zip";
import { toBuffer } from "@office-kit/xlsx/node";
import { decodeEntities, encodeEntities } from "../documents/xml-text.mjs";

const CELL = /^([A-Z]{1,3})([1-9]\d{0,6})$/;
const fail = (code = "INVALID_REQUEST") => { throw Object.assign(new Error(code), { code: `AGENT_SPREADSHEET_${code}` }); };

export function cellPosition(address) {
  const match = typeof address === "string" ? CELL.exec(address) : null;
  if (!match) return fail();
  const column = [...match[1]].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
  const row = Number(match[2]);
  if (column > 16384 || row > 1048576) return fail();
  return { column, row };
}

function attribute(tag, name) {
  return decodeEntities(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`).exec(tag)?.[1] ?? "");
}

function sheetEntry(archive, sheet) {
  const workbook = archive.readEntry("xl/workbook.xml").toString("utf8");
  const relationships = archive.readEntry("xl/_rels/workbook.xml.rels").toString("utf8");
  const tag = [...workbook.matchAll(/<sheet\b[^>]*>/g)].find(([value]) => attribute(value, "name") === sheet)?.[0];
  const id = tag ? attribute(tag, "r:id") : "";
  const relation = [...relationships.matchAll(/<Relationship\b[^>]*>/g)].find(([value]) => attribute(value, "Id") === id)?.[0];
  if (!relation || attribute(relation, "TargetMode") === "External") return fail("UNSUPPORTED_LAYOUT");
  const target = attribute(relation, "Target");
  const entry = posix.normalize(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  if (!entry.startsWith("xl/") || !archive.has(entry)) return fail("INVALID_WORKBOOK");
  return entry;
}

export function normalizeCellEdits(edits) {
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 100) return fail();
  const seen = new Set();
  return edits.map((edit) => {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) return fail();
    const { cell, value } = edit;
    cellPosition(cell);
    if (seen.has(cell)) return fail();
    seen.add(cell);
    if (typeof value === "string") {
      if (value.length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return fail();
    } else if (!(value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))) return fail();
    return { cell, value };
  });
}

/** Change only existing value cells. Every unrelated ZIP part and XML node survives. */
export async function patchWorkbookCells(archive, sheet, edits) {
  const entry = sheetEntry(archive, sheet);
  const xml = archive.readEntry(entry).toString("utf8");
  if (/<sheetProtection\b/.test(xml)) return fail("UNSUPPORTED_LAYOUT");
  const requests = new Map(edits.map((edit) => [edit.cell, edit]));
  // Shared/array formulas may cover cells without an explicit <f> node.
  for (const [tag] of xml.matchAll(/<f\b[^>]*>/g)) {
    const ref = attribute(tag, "ref").replaceAll("$", "");
    if (!ref) continue;
    const [start, end = start] = ref.split(":").map(cellPosition);
    if (edits.some(({ cell }) => {
      const p = cellPosition(cell);
      return p.row >= start.row && p.row <= end.row && p.column >= start.column && p.column <= end.column;
    })) return fail("FORMULA_PROTECTED");
  }
  const next = xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (original, attrs, body = "") => {
    const address = attribute(attrs, "r");
    const edit = requests.get(address);
    if (!edit) return original;
    if (/<f\b/.test(body)) return fail("FORMULA_PROTECTED");
    requests.delete(address);
    const cleaned = attrs.replace(/\s+t=["'][^"']*["']/g, "");
    // Preserve styles, metadata and extensions; replace only the value payload.
    const extra = body.replace(/<v\b[^>]*\/>|<v\b[^>]*>[\s\S]*?<\/v>|<is\b[^>]*\/>|<is\b[^>]*>[\s\S]*?<\/is>/g, "");
    const { value } = edit;
    if (value === null) return `<c${cleaned}>${extra}</c>`;
    if (typeof value === "string") return `<c${cleaned} t="inlineStr"><is><t xml:space="preserve">${encodeEntities(value)}</t></is>${extra}</c>`;
    return `<c${cleaned} t="${typeof value === "boolean" ? "b" : "n"}"><v>${typeof value === "boolean" ? Number(value) : value}</v>${extra}</c>`;
  });
  if (requests.size > 0) return fail("CELL_NOT_FOUND");
  // Excel recalculates retained formulas when opening the result. No fake cached results.
  const workbookXml = archive.readEntry("xl/workbook.xml").toString("utf8");
  const calc = '<calcPr fullCalcOnLoad="1" forceFullCalc="1"/>';
  const nextWorkbook = /<calcPr\b/.test(workbookXml)
    ? workbookXml.replace(/<calcPr\b[^>]*\/>|<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/, (original) => original.replace(/\s+(?:fullCalcOnLoad|forceFullCalc)=["'][^"']*["']/g, "").replace("<calcPr", '<calcPr fullCalcOnLoad="1" forceFullCalc="1"'))
    : workbookXml.replace(/<(?:oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/, (following) => calc + following);
  const sink = toBuffer();
  const writer = createZipWriter(sink);
  try {
    for (const name of archive.names()) {
      const bytes = name === entry ? Buffer.from(next) : name === "xl/workbook.xml" ? Buffer.from(nextWorkbook) : archive.readEntry(name);
      await writer.addEntry(name, bytes, { compress: true });
    }
    await writer.finalize();
    return sink.result();
  } catch (error) {
    try { writer.abort(error); } catch { /* Surface a stable error below. */ }
    return fail("INVALID_WORKBOOK");
  }
}
