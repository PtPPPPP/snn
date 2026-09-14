/**
 * Decode the five predefined XML entities plus numeric character references.
 * Unknown or custom entities stay literal: there is no DTD, no external
 * entity resolution, and no network in any SNN document parser.
 */
export function decodeEntities(text) {
  return text.replace(/&(#[0-9]+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return "\"";
    if (entity === "apos") return "'";
    const codePoint = entity.startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    if (!Number.isSafeInteger(codePoint) || Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
    return String.fromCodePoint(codePoint);
  });
}

/**
 * Escape the minimal text-node entity set so decoded text can be written back
 * into OOXML character data (e.g. a DOCX `<w:t>` element). `&` is replaced
 * first by the single-pass scanner, so the output never double-escapes. This
 * is the exact inverse of {@link decodeEntities} for `&`, `<`, and `>`; quotes
 * and apostrophes stay literal because they are valid inside element text.
 */
export function encodeEntities(text) {
  return text.replace(/[&<>]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    return "&gt;";
  });
}
