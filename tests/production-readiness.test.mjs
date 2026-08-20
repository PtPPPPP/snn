import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanClientArtifact, validateProductionConfig } from "../scripts/check-production-readiness.mjs";

const valid = {
  publicOrigin: "https://snn.example.org",
  gatewayUrl: "https://api.snn.example.org",
  originUrl: "https://private-tunnel.snn.internal",
  allowedOrigins: ["https://snn.example.org"],
  chatNamespace: "123456789",
  statusNamespace: "987654321",
};

test("production preflight rejects placeholder public and origin config", () => {
  const errors = validateProductionConfig({ ...valid, publicOrigin: "http://localhost:3000", gatewayUrl: "https://ai-gateway.example.com", originUrl: "https://ai-origin.example.com" });
  assert.ok(errors.length >= 3);
});

test("production preflight rejects insecure public HTTP", () => {
  const errors = validateProductionConfig({ ...valid, gatewayUrl: "http://api.snn.example.org" });
  assert.ok(errors.some((error) => error.includes("HTTPS")));
});

test("production preflight accepts real HTTPS public endpoints and private origin", () => {
  assert.deepEqual(validateProductionConfig(valid), []);
});

test("strict production preflight requires secrets without printing them", () => {
  const errors = validateProductionConfig({ ...valid, requireSecrets: true });
  assert.ok(errors.some((error) => error.includes("secrets are missing")));
  assert.doesNotMatch(errors.join(" "), /secret-value|sk-[A-Za-z0-9]/);
});

test("production client artifact contains no internal origin or credential markers", async () => {
  const findings = await scanClientArtifact(path.resolve("dist/client"), ["CF-Access-Client-Secret", "QWEN_UPSTREAM_API_KEY", "AI_ORIGIN_URL", "Bearer "]);
  assert.deepEqual(findings, []);
});
