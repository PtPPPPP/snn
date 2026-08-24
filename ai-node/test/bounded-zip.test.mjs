import assert from "node:assert/strict";
import test from "node:test";
import { buildZip } from "../test/helpers/document-fixtures.mjs";
import { BoundedZipArchive, readZipText } from "../src/agent/documents/bounded-zip.mjs";
import { DEFAULT_DOCUMENT_LIMITS } from "../src/agent/documents/limits.mjs";

const limits = DEFAULT_DOCUMENT_LIMITS;

test("bounded zip reads stored and deflated entries by exact name", () => {
  const archive = BoundedZipArchive.open(buildZip([
    { name: "a/text.txt", data: "hello world" },
    { name: "b/data.bin", data: Buffer.from([1, 2, 3, 4]), method: 8 },
    { name: "c/repeat.txt", data: "repeat\n" },
  ]), limits);

  assert.equal(archive.has("a/text.txt"), true);
  assert.equal(archive.has("missing"), false);
  assert.deepEqual(archive.names(), ["a/text.txt", "b/data.bin", "c/repeat.txt"]);
  assert.equal(readZipText(archive, "a/text.txt", 1000), "hello world");
  assert.deepEqual([...archive.readEntry("b/data.bin")], [1, 2, 3, 4]);
  assert.equal(readZipText(archive, "c/repeat.txt", 1000), "repeat\n");
});

test("bounded zip rejects archives without a valid end-of-central-directory", () => {
  assert.throws(() => BoundedZipArchive.open(Buffer.from("not a zip at all"), limits), (error) => error.code === "AGENT_DOCUMENT_INVALID");
});

test("bounded zip rejects encrypted entries before any expansion", () => {
  const base = buildZip([{ name: "plain.txt", data: "plain" }]);
  // Flip the encryption flag bit in the central directory entry.
  const centralStart = base.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  base[centralStart + 8] |= 0x01;
  const localStart = base.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  base[localStart + 6] |= 0x01;
  assert.throws(() => BoundedZipArchive.open(base, limits), (error) => error.code === "AGENT_DOCUMENT_ENCRYPTED");
});

test("bounded zip enforces the archive entry count limit", () => {
  const tiny = { ...limits, maxArchiveEntries: 2 };
  const archive = buildZip([
    { name: "one.txt", data: "1" },
    { name: "two.txt", data: "2" },
    { name: "three.txt", data: "3" },
  ]);
  assert.throws(() => BoundedZipArchive.open(archive, tiny), (error) => error.code === "AGENT_DOCUMENT_EXTRACTION_LIMIT");
});

test("bounded zip enforces per-entry and total expanded-size limits from declarations", () => {
  const smallEntry = { ...limits, maxArchiveEntryBytes: 4 };
  assert.throws(
    () => BoundedZipArchive.open(buildZip([{ name: "big.bin", data: "123456789" }]), smallEntry),
    (error) => error.code === "AGENT_DOCUMENT_EXTRACTION_LIMIT",
  );

  const tinyTotal = { ...limits, maxArchiveTotalUncompressedBytes: 5 };
  const twoEntries = buildZip([
    { name: "a.txt", data: "123456789" },
    { name: "b.txt", data: "123456789" },
  ]);
  assert.throws(() => BoundedZipArchive.open(twoEntries, tinyTotal), (error) => error.code === "AGENT_DOCUMENT_EXTRACTION_LIMIT");
});

test("bounded zip stops a decompression bomb that lied about its expanded size", () => {
  // A real deflate stream far larger than what the directory claims.
  const bomb = buildZip([{ name: "bomb.bin", data: Buffer.alloc(64 * 1024, 65), method: 8 }]);
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const centralStart = bomb.indexOf(centralSignature);
  // Zero the declared uncompressed size so the directory lies; the inflater's
  // own hard output cap must stop the expansion before memory grows.
  bomb.writeUInt32LE(0, centralStart + 24);
  const localStart = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  bomb.writeUInt32LE(0, localStart + 22);
  assert.throws(() => {
    const archive = BoundedZipArchive.open(bomb, {
      ...limits,
      maxArchiveCompressionRatio: 10_000_000,
      maxArchiveEntryBytes: 1_000,
    });
    archive.readEntry("bomb.bin");
  }, (error) => error.code === "AGENT_DOCUMENT_EXTRACTION_LIMIT");
});

test("bounded zip rejects a successful inflation whose size contradicts the directory", () => {
  const bomb = buildZip([{ name: "bomb.bin", data: Buffer.alloc(64 * 1024, 65), method: 8 }]);
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const centralStart = bomb.indexOf(centralSignature);
  bomb.writeUInt32LE(0, centralStart + 24);
  const localStart = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  bomb.writeUInt32LE(0, localStart + 22);
  assert.throws(() => {
    const archive = BoundedZipArchive.open(bomb, { ...limits, maxArchiveCompressionRatio: 10_000_000 });
    archive.readEntry("bomb.bin");
  }, (error) => error.code === "AGENT_DOCUMENT_INVALID");
});

test("bounded zip rejects extreme compression ratios declared by the directory", () => {
  const tight = { ...limits, maxArchiveCompressionRatio: 10 };
  const archive = buildZip([{ name: "zeros.bin", data: Buffer.alloc(64 * 1024, 48), method: 8 }]);
  assert.throws(() => BoundedZipArchive.open(archive, tight), (error) => error.code === "AGENT_DOCUMENT_EXTRACTION_LIMIT");
});

test("bounded zip rejects unknown compression methods and duplicate names", () => {
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const unknown = buildZip([{ name: "mystery.txt", data: "x" }]);
  const unknownCentral = unknown.indexOf(centralSignature);
  unknown.writeUInt16LE(99, unknownCentral + 10);
  assert.throws(() => BoundedZipArchive.open(unknown, limits), (error) => error.code === "AGENT_DOCUMENT_UNSUPPORTED");

  const duplicated = buildZip([
    { name: "same.txt", data: "a" },
    { name: "other.txt", data: "b" },
  ]);
  // Rewrite the second central-directory name to collide with the first.
  const secondCentral = duplicated.indexOf(centralSignature, duplicated.indexOf(centralSignature) + 4);
  const nameOffset = secondCentral + 46;
  duplicated.write("same.txt", nameOffset);
  duplicated.writeUInt16LE(8, secondCentral + 28);
  assert.throws(() => BoundedZipArchive.open(duplicated, limits), (error) => error.code === "AGENT_DOCUMENT_INVALID");
});
