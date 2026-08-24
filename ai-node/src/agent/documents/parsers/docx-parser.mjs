import { documentError } from "../limits.mjs";
import { decodeEntities } from "../xml-text.mjs";
import { BoundedZipArchive } from "../bounded-zip.mjs";

/**
 * Bounded DOCX (OpenXML) text extraction. The archive is inspected in memory
 * with hard limits; relationships, images, macros, and external targets are
 * never fetched or executed. Only literal document text is surfaced, and
 * document content is treated as untrusted data throughout.
 */
export const docxParser = {
  id: "docx",
  extensions: ["docx"],
  parse(buffer, limits) {
    if (buffer.length > limits.maxDocumentBytes) throw documentError("AGENT_DOCUMENT_TOO_LARGE");
    let archive;
    try { archive = BoundedZipArchive.open(buffer, limits); }
    catch (error) { throw normalize(error); }
    if (!archive.has("[Content_Types].xml")) throw documentError("AGENT_DOCUMENT_INVALID");
    if (!archive.has("word/document.xml")) throw documentError("AGENT_DOCUMENT_INVALID");
    if (archive.names().some((name) => name.includes("vbaProject"))) throw documentError("AGENT_DOCUMENT_UNSUPPORTED");

    let xml;
    try { xml = archive.readEntry("word/document.xml").toString("utf8"); }
    catch (error) { throw normalize(error); }
    if (xml.length > limits.maxExtractedChars * 64 + 1_048_576) throw documentError("AGENT_DOCUMENT_EXTRACTION_LIMIT");

    const extraction = extractBlocks(xml, limits);
    if (extraction.blocks.length === 0) {
      return { kind: "docx", truncated: false, blocks: [], render: () => "Document is empty." };
    }

    let truncated = extraction.truncated;
    const rendered = [];
    let remaining = limits.maxExtractedChars;
    for (const block of extraction.blocks) {
      if (remaining <= 0) { truncated = true; break; }
      const line = renderBlock(block);
      const clipped = line.length > remaining ? line.slice(0, remaining) : line;
      remaining -= clipped.length;
      rendered.push(clipped);
      if (clipped.length !== line.length) { truncated = true; break; }
    }

    return {
      kind: "docx",
      truncated,
      blocks: extraction.blocks,
      render() {
        return `Document\n\n${rendered.join("\n\n")}${truncated ? "\n\n[TRUNCATED] Extraction stopped at the server limit." : ""}`;
      },
    };
  },
};

function normalize(error) {
  if (typeof error?.code === "string" && error.code.startsWith("AGENT_DOCUMENT_")) return error;
  return documentError("AGENT_DOCUMENT_INVALID");
}

function renderBlock(block) {
  if (block.type === "table") {
    return ["[Table]", ...block.rows.map((row) => row.join(" | "))].join("\n");
  }
  return block.text;
}

const TAG_PATTERN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/?([\w:]+)(?:\s[^>]*?)?(\/?)>|([^<]+)/g;

/**
 * Ordered single-pass walk of `word/document.xml`. Paragraphs and top-level
 * tables keep document order; nested tables collapse into their parent cell
 * text. No DTD, no external entities, no network — only bytes already inside
 * the container. Extraction stops early once a server bound is reached.
 */
export function extractBlocks(xml, limits) {
  const blocks = [];
  let truncated = false;
  let tableDepth = 0;
  let currentTable = null;
  let currentRow = null;
  let inCell = false;
  let cellParagraphs = [];
  let paragraph = "";

  const pushParagraph = () => {
    const text = paragraph.replace(/[ \t]+\n/g, "\n").trim();
    paragraph = "";
    if (text.length === 0) return;
    if (inCell) { cellParagraphs.push(text); return; }
    if (blocks.length >= limits.maxDocxBlocks) { truncated = true; return; }
    blocks.push({ type: "paragraph", text });
  };

  TAG_PATTERN.lastIndex = 0;
  for (;;) {
    const match = TAG_PATTERN.exec(xml);
    if (!match) break;
    if (match[3] !== undefined) {
      if (match[3].length > 0) {
        paragraph += decodeEntities(match[3]);
        if (paragraph.length > limits.maxExtractedChars) { truncated = true; break; }
      }
      continue;
    }
    const closing = match[0][1] === "/";
    const selfClosing = match[2] === "/";
    if (match[1] === undefined) continue; // comments, processing instructions, doctype
    // Word tags carry the `w:` prefix (`w:p`, `w:tbl`); other namespaces in the
    // body (r:, wp:) wrap non-text content and are ignored by name anyway.
    const tag = match[1].replace(/^w:/, "");
    console.error("EV", JSON.stringify(match[0]), "tag:", tag);
    switch (`${closing ? "/" : ""}${tag}`) {
      case "tbl": {
        if (tableDepth === 0) {
          pushParagraph();
          currentTable = { type: "table", rows: [] };
        }
        tableDepth += 1;
        continue;
      }
      case "/tbl": {
        tableDepth -= 1;
        if (tableDepth === 0 && currentTable) {
          if (blocks.length >= limits.maxDocxBlocks) { truncated = true; }
          else blocks.push(currentTable);
          currentTable = null;
          currentRow = null;
          inCell = false;
          cellParagraphs = [];
        }
        continue;
      }
      case "tr":
      case "/tr": {
        console.error("TR", JSON.stringify({ closing, tableDepth }));
        if (!closing && tableDepth === 1 && currentTable) { currentRow = []; currentTable.rows.push(currentRow); }
        if (closing) currentRow = null;
        continue;
      }
      case "tc":
      case "/tc": {
        console.error("TC", JSON.stringify({ closing, tableDepth, inCell, cellParagraphs }));
        if (!closing && tableDepth === 1 && currentRow) { inCell = true; cellParagraphs = []; continue; }
        if (closing && tableDepth === 1 && currentRow) {
          currentRow.push(cellParagraphs.join(" ").trim());
          inCell = false;
          cellParagraphs = [];
        }
        continue;
      }
      case "p":
      case "/p": {
        // Both edges settle a paragraph: open flushes the previous block,
        // close flushes this one. `<w:p/>` carries no text at all.
        if (!closing && selfClosing) continue;
        pushParagraph();
        paragraph = "";
        continue;
      }
      case "tab": {
        if (!closing) paragraph += "\t";
        continue;
      }
      case "br":
      case "cr": {
        if (!closing) paragraph += "\n";
        continue;
      }
      default:
        continue;
    }
  }
  pushParagraph();
  return { blocks, truncated };
}
