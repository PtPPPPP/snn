import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/**
 * Minimal deterministic ZIP writer for test fixtures. Supports stored and
 * raw-deflate entries so archive-limit scenarios can be exercised without
 * shipping binary fixtures.
 */
export function buildZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const method = entry.method ?? 0;
    if (method !== 0 && method !== 8) throw new TypeError("unsupported fixture zip method");
    const payload = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, payload);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc32(raw), 16);
    directory.writeUInt32LE(payload.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(nameBuffer.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBuffer);
    offset += local.length + nameBuffer.length + payload.length;
  }

  const localBody = Buffer.concat(locals);
  const centralBody = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBody.length, 12);
  eocd.writeUInt32LE(localBody.length, 16);
  return Buffer.concat([localBody, centralBody, eocd]);
}

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a small valid classic-structure PDF whose pages carry literal text
 * lines through `Tj` operators. `encrypted` adds a standard-security handler
 * and trailer reference so parsers must fail closed.
 */
export function buildTestPdf({ pages, encrypted = false, flate = false }) {
  const objects = [];
  const pageIds = [];
  const contentIds = [];
  // Stable layout: catalog=1, pages=2, then [page, content] pairs from id 3.
  for (let index = 0; index < pages.length; index += 1) {
    pageIds.push(3 + index * 2);
    contentIds.push(4 + index * 2);
  }
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  for (let index = 0; index < pages.length; index += 1) {
    const operators = ["BT"];
    for (const line of pages[index]) operators.push(`(${escapePdfText(line)}) Tj T*`);
    operators.push("ET");
    const body = operators.join("\n");
    const stream = flate ? deflateRawSync(Buffer.from(body, "latin1")) : Buffer.from(body, "latin1");
    objects.push(`<< /Type /Page /Parent 2 0 R /Contents ${contentIds[index]} 0 R >>`);
    objects.push(`<< /Length ${stream.length}${flate ? " /Filter /FlateDecode" : ""} >>\nstream\n${stream.toString("latin1")}\nendstream`);
  }
  const encryptId = objects.length + 1;
  if (encrypted) objects.push("<< /Filter /Standard /V 1 /R 2 /O <0102030405060708090a> /U <0102030405060708090a> /P -1 >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encrypted ? ` /Encrypt ${encryptId} 0 R` : ""} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** Wrap plain document.xml content into a minimal valid DOCX container. */
export function buildTestDocx(documentXml, { extraEntries = [], omitDocument = false } = {}) {
  const entries = [{ name: "[Content_Types].xml", data: "<Types/>" }];
  if (!omitDocument) entries.push({ name: "word/document.xml", data: documentXml });
  entries.push(...extraEntries);
  return buildZip(entries);
}

export function docxDocumentXml(blocks) {
  const body = blocks.map((block) => {
    const table = block.table ?? block;
    if (block.table || block.rows) {
      const rows = table.rows.map((cells) => `<w:tr>${cells.map((cell) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${cell}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("");
      return `<w:tbl>${rows}</w:tbl>`;
    }
    return `<w:p><w:r><w:t xml:space="preserve">${block.text}</w:t></w:r></w:p>`;
  }).join("");
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

/**
 * Build an XLSX container. Sheet cells are explicit:
 * `{ ref: "A1", kind: "s"|"n"|"b"|"e"|"f"|"inline", value }`.
 * Shared strings are emitted when any cell uses kind "s".
 */
export function buildTestXlsx({ sheets, macro = false, omitWorkbook = false }) {
  const sharedStrings = [];
  const sheetXmls = sheets.map((sheet) => {
    const rows = new Map();
    for (const cell of sheet.cells) {
      const rowNumber = Number(/([0-9]+)/.exec(cell.ref)?.[1] ?? "1");
      if (!rows.has(rowNumber)) rows.set(rowNumber, []);
      rows.get(rowNumber).push(cell);
    }
    const orderedRows = [...rows.entries()].sort(([a], [b]) => a - b);
    const rowTags = orderedRows.map(([, cells]) => `<row>${cells.map(renderCell).join("")}</row>`).join("");
    return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowTags}</sheetData></worksheet>`;
  });

  function renderCell(cell) {
    switch (cell.kind) {
      case "s": {
        sharedStrings.push(cell.value);
        return `<c r="${cell.ref}" t="s"><v>${sharedStrings.length - 1}</v></c>`;
      }
      case "n":
        return `<c r="${cell.ref}" t="n"><v>${cell.value}</v></c>`;
      case "b":
        return `<c r="${cell.ref}" t="b"><v>${cell.value === true || cell.value === "TRUE" ? 1 : 0}</v></c>`;
      case "e":
        return `<c r="${cell.ref}" t="e"><v>${cell.value}</v></c>`;
      case "inline":
        return `<c r="${cell.ref}" t="inlineStr"><is><t xml:space="preserve">${cell.value}</t></is></c>`;
      case "f":
        return `<c r="${cell.ref}"><f>${cell.formula}</f>${cell.cached !== undefined ? `<v>${cell.cached}</v>` : ""}</c>`;
      default:
        throw new TypeError(`unknown fixture cell kind: ${cell.kind}`);
    }
  }

  const entries = [{ name: "[Content_Types].xml", data: "<Types/>" }];
  sheetXmls.forEach((data, index) => entries.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data }));
  if (!omitWorkbook) {
    const sheetTags = sheets.map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
    entries.push({ name: "xl/workbook.xml", data: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>` });
    const rels = sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
    entries.push({ name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0"?><Relationships>${rels}</Relationships>` });
  }
  if (macro) entries.push({ name: "xl/vbaProject.bin", data: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]) });
  if (sharedStrings.length > 0) {
    entries.push({
      name: "xl/sharedStrings.xml",
      data: `<?xml version="1.0"?><sst count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map((text) => `<si><t xml:space="preserve">${text}</t></si>`).join("")}</sst>`,
    });
  }

  return buildZip(entries);
}
