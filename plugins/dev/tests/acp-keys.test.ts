import assert from "node:assert/strict";
import test from "node:test";
import { buildAcpSessionKey } from "../../dwemr/src/openclaw/backend/acp-native/acp-keys";

test("buildAcpSessionKey scope kind returns base key with no suffix", () => {
  const key = buildAcpSessionKey({
    targetPath: "/tmp/dwemr-keys-scope",
    agentId: "claude",
    scope: { kind: "scope" },
  });
  assert.match(key, /^agent:claude:acp:dwemr-[0-9a-f]{12}$/);
});

test("buildAcpSessionKey command kind appends deterministic :run-<8hex> suffix", () => {
  const params = {
    targetPath: "/tmp/dwemr-keys-command",
    agentId: "claude",
    scope: { kind: "command" as const, requestId: "req-123" },
  };
  const first = buildAcpSessionKey(params);
  const second = buildAcpSessionKey(params);
  assert.equal(first, second, "same inputs must produce stable keys");
  assert.match(first, /^agent:claude:acp:dwemr-[0-9a-f]{12}:run-[0-9a-f]{8}$/);

  const differentRequest = buildAcpSessionKey({
    ...params,
    scope: { kind: "command", requestId: "req-different" },
  });
  assert.notEqual(first, differentRequest, "different requestId must change run suffix");
});

test("buildAcpSessionKey doctor kind appends -doctor suffix", () => {
  const key = buildAcpSessionKey({
    targetPath: "/tmp/dwemr-keys-doctor",
    agentId: "claude",
    scope: { kind: "doctor" },
  });
  assert.match(key, /^agent:claude:acp:dwemr-[0-9a-f]{12}-doctor$/);
});

test("buildAcpSessionKey base hash differs for different targetPaths", () => {
  const a = buildAcpSessionKey({
    targetPath: "/tmp/dwemr-keys-a",
    agentId: "claude",
    scope: { kind: "scope" },
  });
  const b = buildAcpSessionKey({
    targetPath: "/tmp/dwemr-keys-b",
    agentId: "claude",
    scope: { kind: "scope" },
  });
  assert.notEqual(a, b);
});

test("buildAcpSessionKey base hash incorporates model / subagentModel / effortLevel", () => {
  const base = {
    targetPath: "/tmp/dwemr-keys-runtime",
    agentId: "claude",
    scope: { kind: "scope" as const },
  };
  const plain = buildAcpSessionKey(base);
  const withModel = buildAcpSessionKey({ ...base, runtimeConfig: { model: "claude-opus-4" } });
  const withSubagent = buildAcpSessionKey({ ...base, runtimeConfig: { subagentModel: "claude-haiku" } });
  const withEffort = buildAcpSessionKey({ ...base, runtimeConfig: { effortLevel: "high" } });

  assert.notEqual(plain, withModel);
  assert.notEqual(plain, withSubagent);
  assert.notEqual(plain, withEffort);
  assert.notEqual(withModel, withSubagent);
  assert.notEqual(withModel, withEffort);
  assert.notEqual(withSubagent, withEffort);
});

test("buildAcpSessionKey normalizes agentId to a slug", () => {
  const key = buildAcpSessionKey({
    targetPath: "/tmp/dwemr-keys-agent",
    agentId: "Claude/Custom Agent!!",
    scope: { kind: "scope" },
  });
  assert.match(key, /^agent:claude-custom-agent:acp:dwemr-[0-9a-f]{12}$/);
});

test("buildAcpSessionKey command run suffix depends on requestId AND targetPath", () => {
  const a = buildAcpSessionKey({
    targetPath: "/tmp/dwemr-keys-suffix-a",
    agentId: "claude",
    scope: { kind: "command", requestId: "req-shared" },
  });
  const b = buildAcpSessionKey({
    targetPath: "/tmp/dwemr-keys-suffix-b",
    agentId: "claude",
    scope: { kind: "command", requestId: "req-shared" },
  });
  // Different targetPath → both base hash and run suffix differ.
  assert.notEqual(a, b);
  const aSuffix = a.split(":run-")[1];
  const bSuffix = b.split(":run-")[1];
  assert.notEqual(aSuffix, bSuffix);
});
