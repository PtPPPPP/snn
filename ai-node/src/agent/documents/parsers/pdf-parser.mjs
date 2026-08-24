import { inflateRawSync } from "node:zlib";
import { documentError } from "../limits.mjs";

/**
 * Bounded text extraction for text-based PDFs. The parser is read-only and
 * network-free by construction: it never resolves links, fonts, images, or
 * embedded files, and it executes no document content. Encrypted documents
 * fail closed. Scanned documents surface `AGENT_DOCUMENT_NO_TEXT` instead of
 * pretending comprehension (no OCR in this phase).
 */
export const pdfParser = {
  id: "pdf",
  extensions: ["pdf"],
  parse(buffer, limits) {
    if (buffer.length > limits.maxDocumentBytes) throw documentError("AGENT_DOCUMENT_TOO_LARGE");
    if (!buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) throw documentError("AGENT_DOCUMENT_INVALID");
    assertNotEncrypted(buffer);

    const latin = buffer.toString("latin1");
    const objects = new Map();
    collectObjects(latin, buffer, objects);

    const pageRefs = resolvePageRefs(latin, objects);
    if (pageRefs.length === 0) throw documentError("AGENT_DOCUMENT_INVALID");

    let truncated = false;
    let visited = 0;
    const pages = [];
    let remainingChars = limits.maxExtractedChars;
    for (const ref of pageRefs) {
      if (visited >= limits.maxPdfPages) { truncated = true; break; }
      visited += 1;
      const text = extractPageText(objects, ref);
      const clipped = clip(text, remainingChars);
      remainingChars -= clipped.text.length;
      pages.push(clipped.text);
      if (clipped.truncated) { truncated = true; break; }
    }
    if (visited < pageRefs.length) truncated = true;
    const body = pages.join("\n\n");
    if (body.trim().length === 0) throw documentError("AGENT_DOCUMENT_NO_TEXT");

    return {
      kind: "pdf",
      pageCount: visited,
      declaredPageCount: pageRefs.length,
      truncated,
      pages,
      render(originalName) {
        return `Document: ${originalName}\nPages: ${pages.length}\n\n${pages.map((text, index) => `[Page ${index + 1}]\n${text}`).join("\n\n")}${truncated ? "\n\n[TRUNCATED] Extraction stopped at the server limit." : ""}`;
      },
    };
  },
};

function clip(text, remainingChars) {
  if (text.length <= remainingChars) return { text, truncated: false };
  return { text: text.slice(0, Math.max(0, remainingChars)), truncated: true };
}

function assertNotEncrypted(buffer) {
  const text = buffer.toString("latin1");
  const trailerMatch = /trailer\s*<<(.*?)>>/.exec(text);
  if (trailerMatch && /\/Encrypt\s+\d+\s+\d+\s+R/.test(trailerMatch[1])) throw documentError("AGENT_DOCUMENT_ENCRYPTED");
  // Fail closed when standard-security handler material exists anywhere.
  if (/\/Filter\s*\/Standard\b/.test(text)) throw documentError("AGENT_DOCUMENT_ENCRYPTED");
}

/** Linear object scan: bounded inputs make this O(bytes) without trusting xref tables at all. */
function collectObjects(latin, buffer, objects) {
  const headerRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let match;
  while ((match = headerRe.exec(latin)) !== null) {
    const key = `${match[1]} ${match[2]}`;
    let cursor = match.index + match[0].length;
    const endObj = latin.indexOf("endobj", cursor);
    if (endObj === -1) break;
    const streamMatch = />>(\s*)stream(\r\n|\n|\r)/.exec(latin.slice(cursor, endObj));
    if (streamMatch === null) {
      if (!objects.has(key)) objects.set(key, { dict: latin.slice(cursor, endObj), stream: null });
      headerRe.lastIndex = endObj + 6;
      continue;
    }
    const dictEnd = cursor + streamMatch.index + 2;
    const dataStart = dictEnd + streamMatch[1].length + "stream".length + streamMatch[2].length;
    const endStream = latin.indexOf("endstream", dataStart);
    if (endStream === -1) break;
    const raw = buffer.subarray(dataStart, endStream);
    if (!objects.has(key)) objects.set(key, { dict: latin.slice(cursor, dictEnd), stream: raw });
    headerRe.lastIndex = endObj + 6;
  }
  expandObjectStreams(latin, objects);
}

/** Modern PDFs park dictionaries inside compressed object streams; unfold them so page trees resolve. */
function expandObjectStreams(latin, objects) {
  for (const [, object] of [...objects]) {
    if (object.stream === null || !/\/Type\s*\/ObjStm/.test(object.dict)) continue;
    let contents;
    try { contents = inflateRawSync(object.stream).toString("latin1"); }
    catch { continue; }
    const header = /^(\d+)\s+(\d+)\s*/.exec(contents);
    if (!header) continue;
    const count = Number(header[1]);
    const pairSource = contents.slice(header[0].length);
    const numbers = pairSource.match(/-?\d+/g) ?? [];
    if (numbers.length < count * 2) continue;
    const firstData = pairSource.indexOf("<<", Number(numbers[count]));
    for (let index = 0; index < count; index += 1) {
      const objectNumber = numbers[index];
      const start = Number(numbers[count + index]);
      const end = index + 1 < count ? Number(numbers[count + index + 1]) : undefined;
      const body = contents.slice(firstData + start, end === undefined ? undefined : firstData + end).trim();
      const key = `${objectNumber} 0`;
      if (!objects.has(key) && body.length > 0) objects.set(key, { dict: body, stream: null });
    }
  }
}

function resolveRef(dict, name) {
  const match = new RegExp(`/${name}\\s+(\\d+)\\s+(\\d+)\\s+R`).exec(dict);
  return match ? `${match[1]} ${match[2]}` : undefined;
}

function resolvePageRefs(latin, objects) {
  // The trailer (outside any object) names the document catalog; fall back to scanning for it.
  let catalogKey;
  const trailerMatches = [...latin.matchAll(/trailer\s*<<(.*?)>>/g)];
  for (const trailer of trailerMatches.reverse()) {
    const root = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(trailer[1]);
    if (root) { catalogKey = `${root[1]} ${root[2]}`; break; }
  }
  if (!catalogKey || !objects.has(catalogKey)) catalogKey = findCatalogKey(objects);
  if (!catalogKey) return [];
  const catalog = objects.get(catalogKey);
  if (!catalog || !/\/Type\s*\/Catalog\b/.test(catalog.dict)) return [];
  const pagesRef = resolveRef(catalog.dict, "Pages");
  if (!pagesRef) return [];
  const refs = [];
  walkPages(objects, pagesRef, refs, 0);
  return refs;
}

function findCatalogKey(objects) {
  for (const [key, object] of objects) {
    if (/\/Type\s*\/Catalog\b/.test(object.dict)) return key;
  }
  return undefined;
}

function walkPages(objects, key, refs, depth) {
  if (depth > 8 || refs.length > 4_096) return;
  const node = objects.get(key);
  if (!node) return;
  if (/\/Type\s*\/Pages\b/.test(node.dict)) {
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(node.dict);
    if (!kids) return;
    for (const match of kids[1].matchAll(/(\d+)\s+(\d+)\s+R/g)) {
      walkPages(objects, `${match[1]} ${match[2]}`, refs, depth + 1);
    }
    return;
  }
  if (/\/Type\s*\/Page\b/.test(node.dict) || /\/Contents\b|\/Resources\b/.test(node.dict)) refs.push(key);
}

function extractPageText(objects, pageKey) {
  const page = objects.get(pageKey);
  if (!page) return "";
  const inlineContents = /\/Contents\s*\[([^\]]*)\]/.exec(page.dict);
  const chunks = [];
  if (inlineContents) {
    for (const match of inlineContents[1].matchAll(/(\d+)\s+(\d+)\s+R/g)) {
      pushContent(chunks, objects, `${match[1]} ${match[2]}`);
    }
  } else {
    const single = resolveRef(page.dict, "Contents");
    if (single) pushContent(chunks, objects, single);
  }
  return extractContentStreamText(chunks.map((chunk) => chunk.toString("latin1")).join("\n"));
}

function pushContent(chunks, objects, key) {
  const object = objects.get(key);
  if (!object || object.stream === null) return;
  if (/\/FlateDecode/.test(object.dict)) {
    try { chunks.push(inflateRawSync(object.stream)); }
    catch { /* A corrupt page contributes no text instead of failing the whole document. */ }
    return;
  }
  if (/\/Filter/.test(object.dict)) return; // Image/other encodings carry no extractable text here.
  chunks.push(object.stream);
}

const ESCAPES = new Map([["n", "\n"], ["r", "\r"], ["t", "\t"], ["b", "\b"], ["f", "\f"], ["(", "("], [")", ")"], ["\\", "\\"]]);

/** Interpret the text-showing operators of one decoded content stream. Layout is best-effort. */
export function extractContentStreamText(content) {
  let output = "";
  let pending = "";
  let lineBreakPending = false;
  const flushPending = () => {
    if (pending.length === 0) return;
    if (lineBreakPending && output.length > 0 && !output.endsWith("\n")) output += "\n";
    lineBreakPending = false;
    output += pending;
    pending = "";
  };
  const breakLine = () => { flushPending(); lineBreakPending = true; };

  let index = 0;
  while (index < content.length) {
    const character = content[index];
    if (character === "(") {
      const [value, next] = readLiteralString(content, index);
      pending += value; index = next; continue;
    }
    if (character === "<" && content[index + 1] !== "<") {
      const [value, next] = readHexString(content, index);
      pending += value; index = next; continue;
    }
    if (character === "[") { index += 1; continue; }
    if (/[A-Za-z'"*]/.test(character)) {
      let operator = "";
      while (index < content.length && /[A-Za-z'"*0-9]/.test(content[index])) { operator += content[index]; index += 1; }
      if (operator === "Tj" || operator === "TJ") flushPending();
      else if (operator === "'" || operator === '"') { breakLine(); flushPending(); }
      else if (operator === "Td" || operator === "TD" || operator === "T*" || operator === "ET") breakLine();
      continue;
    }
    if (/\d/.test(character) || character === "-" || character === "+" || character === ".") {
      while (index < content.length && /[\d.\-+eE]/.test(content[index])) index += 1;
      continue;
    }
    index += 1;
  }
  flushPending();
  return output.split("\n").map((line) => line.replace(/[ \t]+$/g, "")).filter((line, position, lines) => !(line === "" && (position === 0 || position === lines.length - 1))).join("\n");
}

function readLiteralString(source, start) {
  let depth = 1;
  let value = "";
  let index = start + 1;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (character === "\\") {
      const escape = source[index + 1];
      if (ESCAPES.has(escape)) { value += ESCAPES.get(escape); index += 2; continue; }
      const octal = /^[0-7]{1,3}/.exec(source.slice(index + 1, index + 5));
      if (octal) { value += String.fromCharCode(Number.parseInt(octal[0], 8) & 0xff); index += 1 + octal[0].length; continue; }
      if (escape === "\r" && source[index + 2] === "\n") { index += 3; continue; }
      if (escape === "\n" || escape === "\r") { index += 2; continue; }
      value += escape ?? ""; index += escape === undefined ? 2 : 2; continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") { depth -= 1; if (depth === 0) { index += 1; break; } }
    value += character;
    index += 1;
  }
  return [value, index];
}

function readHexString(source, start) {
  const end = source.indexOf(">", start + 1);
  const hex = source.slice(start + 1, end === -1 ? source.length : end).replace(/[^0-9a-fA-F]/g, "");
  let value = "";
  for (let index = 0; index + 1 < hex.length; index += 2) {
    value += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  if (hex.length % 2 === 1) value += String.fromCharCode(Number.parseInt(hex.slice(-1), 16) << 4);
  return [value, end === -1 ? source.length : end + 1];
}
