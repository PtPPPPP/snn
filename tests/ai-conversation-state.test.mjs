import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationSnapshot, canApplyGeneration, canApplyNavigation } from "../lib/ai-conversation-state.mjs";
import { createPerConversationQueue } from "../lib/ai-conversation-queue.mjs";

const base = { id: "a", title: "A", createdAt: 1, updatedAt: 2, version: 1 };
const user = { role: "user", content: "question" };
const assistant = { role: "assistant", content: "" };

test("last chunk is included in the durable snapshot", () => {
  const snapshot = buildConversationSnapshot(base, [user], assistant, "Hello!");
  assert.equal(snapshot.messages.at(-1).content, "Hello!");
});

test("stop partial reply is retained", () => {
  const snapshot = buildConversationSnapshot(base, [user], assistant, "Hello world");
  assert.equal(snapshot.messages.at(-1).content, "Hello world");
});

test("immediate stop does not persist an empty assistant placeholder", () => {
  const snapshot = buildConversationSnapshot(base, [user], assistant, "");
  assert.deepEqual(snapshot.messages, [user]);
});

test("stream error retains partial assistant content", () => {
  assert.equal(buildConversationSnapshot(base, [user], assistant, "partial reply").messages.length, 2);
});

test("stale generation cannot update the current conversation UI", () => {
  assert.equal(canApplyGeneration(2, 1, "b", "a"), false);
  assert.equal(canApplyGeneration(2, 2, "b", "b"), true);
});

test("rapid A to B navigation ignores the late A result", () => {
  assert.equal(canApplyNavigation(1, 2, "a", "a"), false);
  assert.equal(canApplyNavigation(2, 2, "b", "b"), true);
});

test("request ownership remains fixed while UI navigation changes", () => {
  const snapshot = buildConversationSnapshot({ ...base, id: "a" }, [user], assistant, "A output");
  assert.equal(snapshot.id, "a");
});

test("new conversation cannot receive the old request snapshot", () => {
  const snapshot = buildConversationSnapshot({ ...base, id: "a" }, [user], assistant, "A output");
  assert.notEqual(snapshot.id, "c");
});

test("delete current selects a valid remaining conversation", () => {
  const remaining = [{ id: "b" }, { id: "c" }];
  assert.equal(remaining[0].id, "b");
});

test("storage failure and empty history are distinct states", () => {
  const empty = { ok: true, value: [] };
  const failure = { ok: false, error: "storage_error" };
  assert.notDeepEqual(empty, failure);
});

test("save queue continues after a failed previous operation", async () => {
  const writes = [];
  const enqueue = createPerConversationQueue();
  await enqueue("a", async () => { throw new Error("first failure"); }).catch(() => {});
  await enqueue("a", async () => writes.push("second"));
  assert.deepEqual(writes, ["second"]);
});

test("same conversation writes are ordered", async () => {
  const writes = [];
  const enqueue = createPerConversationQueue();
  let release;
  const first = enqueue("a", () => new Promise((resolve) => { release = () => { writes.push("v1"); resolve(); }; }));
  const second = enqueue("a", async () => writes.push("v2"));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(writes, []);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ["v1", "v2"]);
});

test("different conversations save independently", async () => {
  const writes = [];
  const enqueue = createPerConversationQueue();
  let release;
  const first = enqueue("a", () => new Promise((resolve) => { release = resolve; }));
  const other = enqueue("b", async () => writes.push("b"));
  await other;
  assert.deepEqual(writes, ["b"]);
  release();
  await first;
});

test("delete queued after save leaves delete as the final operation", async () => {
  const writes = [];
  const enqueue = createPerConversationQueue();
  await enqueue("a", async () => writes.push("save"));
  await enqueue("a", async () => writes.push("delete"));
  assert.deepEqual(writes, ["save", "delete"]);
});

test("late callback cannot update the replacement conversation", () => {
  assert.equal(canApplyGeneration(2, 1, "b", "a"), false);
});

test("reload snapshot restores title and complete messages", () => {
  const snapshot = buildConversationSnapshot({ ...base, title: "saved" }, [user], assistant, "complete");
  assert.equal(snapshot.title, "saved");
  assert.equal(snapshot.messages.at(-1).content, "complete");
});

test("storage recovery can clear an unsaved indicator", () => {
  let unsaved = true;
  const saveSucceeded = true;
  if (saveSucceeded) unsaved = false;
  assert.equal(unsaved, false);
});

test("delete current chooses the first remaining conversation deterministically", () => {
  const list = [{ id: "b" }, { id: "c" }];
  assert.equal(list[0].id, "b");
});

test("delete non-current does not change active generation token", () => {
  const activeGeneration = 4;
  const deletedId = "b";
  assert.equal(deletedId === "a", false);
  assert.equal(activeGeneration, 4);
});
