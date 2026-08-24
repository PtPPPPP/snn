import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublicAgentOwnershipStore, hashOwnerToken, equalHashes } from "../src/agent/public/ownership-store.mjs";
import { generateOwnerToken, parseCookies, buildOwnerCookie, getOwnerTokenFromRequest } from "../src/agent/public/cookie.mjs";

test("ownership store hashes and verifies with timing-safe compare", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-ownership-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new PublicAgentOwnershipStore(root);
  const token = generateOwnerToken();
  const hash = hashOwnerToken(token);
  const sessionId = "snn-agent-11111111-1111-4111-8111-111111111111";
  await store.create(sessionId, hash);
  const rec = await store.get(sessionId);
  assert.equal(rec.sessionId, sessionId);
  assert.equal(rec.ownerTokenHash, hash);
  assert.equal(equalHashes(hash, hashOwnerToken(token)), true);
  // verify succeeds
  await store.verify(sessionId, token);
  // wrong token fails closed as 404
  await assert.rejects(() => store.verify(sessionId, generateOwnerToken()), (e) => e.code === "AGENT_SESSION_NOT_FOUND");
  // tampered token
  await assert.rejects(() => store.verify(sessionId, token.slice(0, -1) + "0"), (e) => e.code === "AGENT_SESSION_NOT_FOUND");
  // no token
  await assert.rejects(() => store.verify(sessionId, ""), (e) => e.code === "AGENT_SESSION_NOT_FOUND");
  // unknown session
  await assert.rejects(() => store.verify("snn-agent-99999999-9999-4999-8999-999999999999", token), (e) => e.code === "AGENT_SESSION_NOT_FOUND");
});

test("ownership store corruption fails closed and does not allow claim", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-ownership-corrupt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new PublicAgentOwnershipStore(root);
  const token = generateOwnerToken();
  const hash = hashOwnerToken(token);
  const sid = "snn-agent-22222222-2222-4222-8222-222222222222";
  await store.create(sid, hash);
  // corrupt file
  await writeFile(join(root, `${sid}.json`), "{invalid-json");
  await assert.rejects(() => store.get(sid), (e) => e.code === "AGENT_OWNERSHIP_CORRUPT");
  await assert.rejects(() => store.verify(sid, token), (e) => e.code === "AGENT_SESSION_NOT_FOUND");
  // unknown session cannot be claimed by creating with same token? It should succeed to create new session but not claim existing corrupted one
  const sid2 = "snn-agent-33333333-3333-4333-8333-333333333333";
  await store.create(sid2, hash);
  await store.verify(sid2, token);
});

test("ownership store counts and sweeps with TTL without leaking raw tokens", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snn-ownership-ttl-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new PublicAgentOwnershipStore(root);
  const tokenA = generateOwnerToken();
  const hashA = hashOwnerToken(tokenA);
  const tokenB = generateOwnerToken();
  const hashB = hashOwnerToken(tokenB);
  const s1 = "snn-agent-aaaa0000-0000-4000-8000-000000000001";
  const s2 = "snn-agent-aaaa0000-0000-4000-8000-000000000002";
  const s3 = "snn-agent-aaaa0000-0000-4000-8000-000000000003";
  await store.create(s1, hashA);
  await store.create(s2, hashA);
  await store.create(s3, hashB);
  assert.equal(await store.countAll(), 3);
  assert.equal(await store.countByOwner(hashA), 2);
  assert.equal(await store.countByOwner(hashB), 1);
  // touch updates lastAccessAt
  const before = (await store.get(s1)).lastAccessAt;
  await new Promise((r) => setTimeout(r, 10));
  await store.touch(s1);
  const after = (await store.get(s1)).lastAccessAt;
  assert.notEqual(before, after);
  // sweep expired: make s2 expired by manipulating file directly to old date
  const oldDate = new Date(Date.now() - 100_000).toISOString();
  const rec2 = await store.get(s2);
  await writeFile(join(root, `${s2}.json`), JSON.stringify({ ...rec2, lastAccessAt: oldDate }));
  const expired = await store.sweepExpired(Date.now(), 50_000);
  assert.ok(expired.includes(s2));
  assert.ok(!expired.includes(s1));
  // never store raw token
  const raw = await store.get(s1).then((r) => JSON.stringify(r));
  assert.doesNotMatch(raw, new RegExp(tokenA.slice(0, 10)));
});

test("cookie utilities generate and parse with expected flags", () => {
  const token = generateOwnerToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  const cookie = buildOwnerCookie(token, { secure: false, path: "/api/agent", maxAgeSeconds: 86400 });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/agent/);
  assert.doesNotMatch(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Domain=/);
  const secureCookie = buildOwnerCookie(token, { secure: true });
  assert.match(secureCookie, /Secure/);
  assert.match(secureCookie, /Path=\//);
  assert.match(secureCookie, /__Host-/);
  // parse
  const req = { headers: { cookie: `${cookie.split(";")[0]}; other=foo` } };
  const parsed = getOwnerTokenFromRequest(req);
  assert.equal(parsed, token);
  // missing
  assert.equal(getOwnerTokenFromRequest({ headers: {} }), undefined);
  // tampered
  const badReq = { headers: { cookie: `snn_agent_owner=bad` } };
  assert.equal(getOwnerTokenFromRequest(badReq), undefined);
  // parseCookies
  const map = parseCookies("a=1; b=2; c=\"hello\"");
  assert.equal(map.get("a"), "1");
  assert.equal(map.get("c"), "hello");
});
