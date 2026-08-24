/**
 * Server-owned parser catalog. Parser ids are stable internal identities
 * (`pdf`, `docx`, `xlsx`); client MIME strings never select an implementation.
 */
export class DocumentParserRegistry {
  #parsers = new Map();

  register(parser) {
    if (!parser || typeof parser !== "object") throw new TypeError("parser must be an object");
    if (typeof parser.id !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(parser.id)) {
      throw new TypeError("Parser id must be a stable lowercase identity");
    }
    if (typeof parser.parse !== "function") throw new TypeError(`Parser ${parser.id} must provide parse(buffer, limits)`);
    if (this.#parsers.has(parser.id)) throw new Error(`Duplicate document parser id: ${parser.id}`);
    const normalized = Object.freeze({ id: parser.id, extensions: Object.freeze([...parser.extensions ?? []]), parse: parser.parse });
    this.#parsers.set(normalized.id, normalized);
    return normalized;
  }

  get(id) { return this.#parsers.get(id); }
  has(id) { return this.#parsers.has(id); }
  list() { return Object.freeze([...this.#parsers.values()]); }
}
