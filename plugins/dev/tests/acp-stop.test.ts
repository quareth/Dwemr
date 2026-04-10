// Unit tests for acp-stop helpers.
//
// Note: the killed / already_exited paths of `attemptOsKill` require a real
// running subprocess, which is out of scope for these unit tests. Those paths
// are exercised end-to-end via the integration suite in
// `runtime-backend.test.ts` ("ACP-native stop falls back to OS kill when
// session metadata is degraded"). The tests below cover only the skip and
// short-circuit paths plus the cancel-tier helpers.

import assert from "node:assert/strict";
import test from "node:test";
import { attemptFlowCancel, attemptOsKill, attemptSessionCancel } from "../../dwemr/src/openclaw/acp-stop";
import type { RuntimeApiLike } from "../../dwemr/src/openclaw/runtime-backend-types";
import { AcpRuntimeError } from "./fixtures/acp-runtime-fakes";

const cfg: Record<string, unknown> = { stub: true };

function makeRuntimeApi(taskFlow: unknown): RuntimeApiLike {
  return {
    config: {},
    runtime: {
      taskFlow: taskFlow as RuntimeApiLike["runtime"] extends infer R
        ? R extends { taskFlow?: infer T }
          ? T
          : never
        : never,
    },
  } as RuntimeApiLike;
}

test("attemptFlowCancel returns skipped when taskFlow legacy seam is missing", async () => {
  const result = await attemptFlowCancel({
    runtimeApi: { config: {}, runtime: {} },
    cfg,
    flowId: "flow-1",
    ownerSessionKey: "session-x",
  });
  assert.equal(result.outcome, "skipped");
});

test("attemptFlowCancel returns skipped when boundTaskFlow.cancel is undefined", async () => {
  const runtimeApi = makeRuntimeApi({
    bindSession: () => ({ /* no cancel method */ }),
  });
  const result = await attemptFlowCancel({
    runtimeApi,
    cfg,
    flowId: "flow-1",
    ownerSessionKey: "session-x",
  });
  assert.equal(result.outcome, "skipped");
});

test("attemptFlowCancel returns stopped with runtime_cancel mechanism on success", async () => {
  const cancelled: Array<{ flowId: string }> = [];
  const runtimeApi = makeRuntimeApi({
    bindSession: () => ({
      async cancel({ flowId }: { flowId: string }) {
        cancelled.push({ flowId });
      },
    }),
  });
  const result = await attemptFlowCancel({
    runtimeApi,
    cfg,
    flowId: "flow-42",
    ownerSessionKey: "session-x",
  });
  assert.equal(result.outcome, "stopped");
  if (result.outcome === "stopped") {
    assert.equal(result.mechanism.kind, "runtime_cancel");
    assert.equal(result.mechanism.detail, "taskFlow.cancel");
  }
  assert.deepEqual(cancelled, [{ flowId: "flow-42" }]);
});

test("attemptFlowCancel returns failed with formatted error when cancel throws AcpRuntimeError", async () => {
  const runtimeApi = makeRuntimeApi({
    bindSession: () => ({
      async cancel() {
        throw new AcpRuntimeError("ACP_FLOW_CANCEL_FAILED", "downstream rejected cancel");
      },
    }),
  });
  const result = await attemptFlowCancel({
    runtimeApi,
    cfg,
    flowId: "flow-1",
    ownerSessionKey: "session-x",
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.error, "ACP_FLOW_CANCEL_FAILED: downstream rejected cancel");
  }
});

test("attemptSessionCancel returns stopped with plain detail when flowCancelFailed=false", async () => {
  const cancelled: Array<{ sessionKey: string; reason?: string }> = [];
  const manager = {
    async cancelSession(args: { sessionKey: string; reason?: string }) {
      cancelled.push({ sessionKey: args.sessionKey, reason: args.reason });
    },
    async closeSession() {
      return { runtimeClosed: true, metaCleared: true };
    },
  } as unknown as Parameters<typeof attemptSessionCancel>[0]["manager"];

  const result = await attemptSessionCancel({
    manager,
    cfg,
    sessionKey: "session-x",
    flowCancelFailed: false,
  });
  assert.equal(result.outcome, "stopped");
  if (result.outcome === "stopped") {
    assert.equal(result.mechanism.kind, "runtime_cancel");
    assert.equal(result.mechanism.detail, "acp.cancelSession");
  }
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].sessionKey, "session-x");
});

test("attemptSessionCancel returns stopped with augmented detail when flowCancelFailed=true", async () => {
  const manager = {
    async cancelSession() {},
    async closeSession() {
      return { runtimeClosed: true, metaCleared: true };
    },
  } as unknown as Parameters<typeof attemptSessionCancel>[0]["manager"];

  const result = await attemptSessionCancel({
    manager,
    cfg,
    sessionKey: "session-x",
    flowCancelFailed: true,
  });
  assert.equal(result.outcome, "stopped");
  if (result.outcome === "stopped") {
    assert.equal(result.mechanism.detail, "acp.cancelSession (after taskFlow.cancel failed)");
  }
});

test("attemptSessionCancel returns failed when manager.cancelSession throws", async () => {
  const manager = {
    async cancelSession() {
      throw new AcpRuntimeError("ACP_CANCEL_FAILED", "session cancel rejected");
    },
    async closeSession() {
      return { runtimeClosed: true, metaCleared: true };
    },
  } as unknown as Parameters<typeof attemptSessionCancel>[0]["manager"];

  const result = await attemptSessionCancel({
    manager,
    cfg,
    sessionKey: "session-x",
    flowCancelFailed: false,
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.error, "ACP_CANCEL_FAILED: session cancel rejected");
  }
});

test("attemptSessionCancel still reports stopped when best-effort closeSession cleanup throws", async () => {
  const manager = {
    async cancelSession() {},
    async closeSession() {
      throw new AcpRuntimeError("ACP_CLOSE_FAILED", "ignored cleanup error");
    },
  } as unknown as Parameters<typeof attemptSessionCancel>[0]["manager"];

  const result = await attemptSessionCancel({
    manager,
    cfg,
    sessionKey: "session-x",
    flowCancelFailed: false,
  });
  assert.equal(result.outcome, "stopped");
});

test("attemptOsKill returns skipped when pid is undefined", async () => {
  const result = await attemptOsKill(undefined);
  assert.equal(result.outcome, "skipped");
});

test("attemptOsKill returns skipped when pid is not a running process", async () => {
  // PID 999_999_999 is well above any realistic max_pid and will not be live.
  const result = await attemptOsKill(999_999_999);
  assert.equal(result.outcome, "skipped");
});
