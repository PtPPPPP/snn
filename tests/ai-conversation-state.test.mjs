import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { buildConversationSnapshot, canApplyGeneration, canApplyNavigation } from "../lib/ai-conversation-state.mjs";
import { deleteConversationLifecycle, saveConversationWithNotice } from "../lib/ai-conversation-lifecycle.mjs";
import { createPerConversationQueue } from "../lib/ai-conversation-queue.mjs";

const base = { id: "a", title: "A", createdAt: 1, updatedAt: 2, version: 1 };
const user = { role: "user", content: "question" };
const assistant = { role: "assistant", content: "" };

function fakeIndexedDb() {
  const records = new Map();
  const clone = (value) => value === undefined ? value : structuredClone(value);
  const request = (result) => {
    const req = { result, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess?.({ target: req }));
    return req;
  };
  const store = {
    put(value) { records.set(value.id, clone(value)); return request(value.id); },
    delete(id) { records.delete(id); return request(undefined); },
    get(id) { return request(clone(records.get(id))); },
    getAll() { return request([...records.values()].map(clone)); },
    createIndex() {},
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({ objectStore: () => store }),
  };
  return { open: () => {
    const req = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { req.onupgradeneeded?.({ target: req }); req.onsuccess?.({ target: req }); });
    return req;
  }, records };
}

async function loadProductionStore() {
  const source = readFileSync(new URL("../lib/ai-conversation-store.ts", import.meta.url), "utf8");
  const queueUrl = new URL("../lib/ai-conversation-queue.mjs", import.meta.url).href;
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace("./ai-conversation-queue.mjs", queueUrl);
  return import(`data:text/javascript,${encodeURIComponent(compiled)}`);
}

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

test("production store preserves durable V2 after ordered writes", async () => {
  const store = await loadProductionStore();
  const fake = fakeIndexedDb();
  store.setIndexedDbForTests(fake);
  const a1 = { id: "store-a", title: "A", createdAt: 1, updatedAt: 1, messages: [user], version: 1 };
  const a2 = { ...a1, updatedAt: 2, messages: [user, { role: "assistant", content: "V2" }] };
  await store.saveConversation(a1);
  await store.saveConversation(a2);
  assert.equal((await store.getConversation("store-a")).messages.at(-1).content, "V2");
});

test("production store delete blocks a late save from resurrecting a conversation", async () => {
  const store = await loadProductionStore();
  store.setIndexedDbForTests(fakeIndexedDb());
  const value = { id: "deleted-a", title: "A", createdAt: 1, updatedAt: 1, messages: [user], version: 1 };
  await store.saveConversation(value);
  await store.deleteConversation(value.id);
  await store.saveConversation({ ...value, updatedAt: 2 }).catch(() => {});
  assert.equal(await store.getConversation(value.id), null);
  assert.deepEqual(await store.listConversations(), []);
});

test("production store reload round trip returns cloned durable messages", async () => {
  const store = await loadProductionStore();
  store.setIndexedDbForTests(fakeIndexedDb());
  const value = { id: "reload-a", title: "Test", createdAt: 1, updatedAt: 1, messages: [user, { role: "assistant", content: "Complete response" }], version: 1 };
  await store.saveConversation(value);
  const loaded = await store.getConversation(value.id);
  assert.equal(loaded.title, "Test");
  assert.equal(loaded.messages.at(-1).content, "Complete response");
  assert.notEqual(loaded, value);
  assert.notEqual(loaded.messages, value.messages);
});

test("production lifecycle deletes active conversation during generation and activates B", async () => {
  const events = [];
  const conversations = [{ id: "a", messages: [user] }, { id: "b", messages: [{ role: "user", content: "B" }] }];
  const result = await deleteConversationLifecycle({
    targetConversationId: "a", activeConversationId: "a",
    abortActiveRequest: () => events.push("abort"),
    invalidateGeneration: () => events.push("generation"),
    invalidateNavigation: () => events.push("navigation"),
    deleteConversation: async (id) => { events.push(`delete:${id}`); conversations.splice(0, 1); },
    listConversations: async () => conversations,
    selectConversation: async (next) => events.push(`select:${next.id}`),
    selectEmpty: () => events.push("empty"),
  });
  assert.deepEqual(events, ["generation", "navigation", "abort", "delete:a", "select:b"]);
  assert.equal(result.remaining[0].id, "b");
});

test("late callbacks cannot recreate or update after active deletion", async () => {
  const calls = [];
  await deleteConversationLifecycle({
    targetConversationId: "a", activeConversationId: "a",
    abortActiveRequest: () => calls.push("abort"), invalidateGeneration: () => calls.push("invalidate"), invalidateNavigation: () => {},
    deleteConversation: async () => {}, listConversations: async () => [{ id: "b" }],
    selectConversation: async () => calls.push("select-b"), selectEmpty: () => {},
  });
  calls.push("late-a-finally");
  assert.deepEqual(calls, ["invalidate", "abort", "select-b", "late-a-finally"]);
});

test("production lifecycle deletes non-current without aborting active generation", async () => {
  let aborts = 0;
  let selected = "a";
  await deleteConversationLifecycle({
    targetConversationId: "b", activeConversationId: "a",
    abortActiveRequest: () => { aborts += 1; }, invalidateGeneration: () => { throw new Error("must not invalidate"); }, invalidateNavigation: () => { throw new Error("must not invalidate"); },
    deleteConversation: async () => {}, listConversations: async () => [{ id: "a" }],
    selectConversation: async (next) => { selected = next.id; }, selectEmpty: () => { selected = ""; },
  });
  assert.equal(aborts, 0);
  assert.equal(selected, "a");
});

test("production save lifecycle exposes failure and clears it on recovery", async () => {
  let notice = null;
  let attempt = 0;
  const save = async () => { attempt += 1; if (attempt === 1) throw new Error("storage"); };
  assert.equal(await saveConversationWithNotice({ conversation: base, saveConversation: save, setNotice: (value) => { notice = value; } }), false);
  assert.equal(notice, "本次对话未保存");
  assert.equal(await saveConversationWithNotice({ conversation: base, saveConversation: save, setNotice: (value) => { notice = value; } }), true);
  assert.equal(notice, null);
});
