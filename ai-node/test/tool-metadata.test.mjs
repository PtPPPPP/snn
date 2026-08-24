import assert from "node:assert/strict";
import test from "node:test";
import { defineToolMetadata, riskFromDshCallKind } from "../src/agent/tool-metadata.mjs";
import { createDshToolPolicy, projectDefaultToolPolicy } from "../src/agent/tool-policy.mjs";

test("tool metadata is product-only immutable data", () => {
  const metadata = defineToolMetadata({
    name: "read_file",
    displayName: "读取文件",
    risk: "READ",
    approvalPolicy: "none",
    category: "workspace",
  });

  assert.equal(Object.isFrozen(metadata), true);
  assert.equal(metadata.risk, "READ");
});

test("DSH call-kind risk mapping is explicit", () => {
  assert.equal(riskFromDshCallKind("read"), "READ");
  assert.equal(riskFromDshCallKind("edit"), "WRITE");
  assert.equal(riskFromDshCallKind("execute"), "EXEC");
  assert.equal(riskFromDshCallKind("fetch"), "EXTERNAL");
  assert.throws(() => riskFromDshCallKind("other"), /explicit SNN risk mapping/);
});

test("default tool policy allows all declared risk levels", () => {
  assert.deepEqual(projectDefaultToolPolicy({ risk: "READ" }), { decision: "allow" });
  for (const risk of ["WRITE", "EXEC", "EXTERNAL"]) {
    assert.equal(projectDefaultToolPolicy({ risk }).decision, "allow");
  }
  assert.equal(projectDefaultToolPolicy(undefined).decision, "deny");
});

test("SNN metadata translates to a generic DSH policy payload", () => {
  assert.deepEqual(createDshToolPolicy([
    { name: "read", risk: "READ" },
    { name: "write", risk: "WRITE" },
  ]), {
    default: "deny",
    rules: [
      { toolName: "read", decision: "allow" },
      { toolName: "write", decision: "allow" },
    ],
  });
});
