import assert from "node:assert/strict";
import test from "node:test";
import { DocumentParserRegistry } from "../src/agent/documents/document-parser-registry.mjs";

const parser = (id) => ({ id, extensions: [id], parse: () => ({ kind: id }) });

test("document parser registry registers, resolves, and lists parsers", () => {
  const registry = new DocumentParserRegistry();
  registry.register(parser("pdf"));
  registry.register(parser("docx"));
  registry.register(parser("xlsx"));

  assert.equal(registry.has("pdf"), true);
  assert.equal(registry.has("exe"), false);
  assert.equal(registry.get("docx").id, "docx");
  assert.deepEqual(registry.list().map((entry) => entry.id), ["pdf", "docx", "xlsx"]);
});

test("document parser registry rejects duplicates and unknown kinds fail closed", () => {
  const registry = new DocumentParserRegistry();
  registry.register(parser("pdf"));
  assert.throws(() => registry.register(parser("pdf")), /Duplicate document parser id/);
  assert.equal(registry.get("missing"), undefined);
});

test("document parser registry validates parser shape", () => {
  const registry = new DocumentParserRegistry();
  assert.throws(() => registry.register(null), /parser must be an object/);
  assert.throws(() => registry.register({ id: "BAD ID", parse() {} }), /stable lowercase identity/);
  assert.throws(() => registry.register({ id: "pdf" }), /parse\(buffer, limits\)/);
});
