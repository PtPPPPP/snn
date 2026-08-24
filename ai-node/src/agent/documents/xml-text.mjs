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
