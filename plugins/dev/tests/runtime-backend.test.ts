import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AcpRuntimeError, __testing as acpRuntimeTesting } from "../../dwemr/node_modules/openclaw/dist/plugin-sdk/acp-runtime.js";
import { findActiveRun, registerActiveRun } from "../../dwemr/src/openclaw/active-runs";
import { getDefaultRuntimeBackend, setRuntimeBackendOverride } from "../../dwemr/src/openclaw/runtime-backend";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetRuntimeHarness() {
  acpRuntimeTesting.resetAcpSessionManagerForTests();
  acpRuntimeTesting.resetAcpRuntimeBackendsForTests();
  setRuntimeBackendOverride(undefined);
}

function registerFakeAcpBackend(id = "test-acp") {
  const state = acpRuntimeTesting.getAcpRuntimeRegistryGlobalStateForTests();
  state.backendsById.set(id, {
    id,
    runtime: {},
    healthy: () => true,
  });
}

function buildRuntimeApi(params: {
  backendId: string;
  withFlows?: boolean;
  withTaskFlow?: boolean;
  bindSessionTracker?: Array<{ seam: "flows" | "taskFlow"; sessionKey: string; requesterOrigin?: unknown }>;
  flowCancelTracker?: Array<{ flowId: string; sessionKey: string }>;
  flowCancelError?: string;
}): Record<string, unknown> {
  const withFlows = params.withFlows ?? true;
  const withTaskFlow = params.withTaskFlow ?? true;
  const bindSessionTracker = params.bindSessionTracker ?? [];
  const flowCancelTracker = params.flowCancelTracker ?? [];

  const flowStore = new Map<string, { flowId: string; revision: number }>();
  const taskSummaryStore = new Map<string, { count: number }>();

  return {
    config: {
      acp: {
        backend: params.backendId,
      },
    },
    runtime: {
      tasks: withFlows ? {
        flows: {
          bindSession({ sessionKey, requesterOrigin }: { sessionKey: string; requesterOrigin?: unknown }) {
            bindSessionTracker.push({ seam: "flows", sessionKey, requesterOrigin });
            return {
              get(flowId: string) {
                return flowStore.get(flowId);
              },
              list() {
                return Array.from(flowStore.values());
              },
              findLatest() {
                const values = Array.from(flowStore.values());
                return values[values.length - 1];
              },
              resolve(token: string) {
                return flowStore.get(token);
              },
              getTaskSummary(flowId: string) {
                return taskSummaryStore.get(flowId);
              },
            };
          },
        },
      } : {},
      ...(withTaskFlow ? {
        taskFlow: {
          bindSession({ sessionKey, requesterOrigin }: { sessionKey: string; requesterOrigin?: unknown }) {
            bindSessionTracker.push({ seam: "taskFlow", sessionKey, requesterOrigin });
            return {
              createManaged() {
                const flowId = "flow-1";
                const revision = 1;
                flowStore.set(flowId, { flowId, revision });
                return { flowId, revision };
              },
              runTask({ flowId }: { flowId: string }) {
                if (!flowStore.has(flowId)) {
                  return { created: false, found: false, reason: "missing flow" };
                }
                flowStore.set(flowId, { flowId, revision: 2 });
                taskSummaryStore.set(flowId, { count: 1 });
                return {
                  created: true,
                  flow: { flowId, revision: 2 },
                  task: { taskId: "task-1" },
                };
              },
              finish() {
                return { applied: true };
              },
              fail() {
                return { applied: true };
              },
              async cancel({ flowId }: { flowId: string }) {
                flowCancelTracker.push({ flowId, sessionKey });
                if (params.flowCancelError) {
                  throw new AcpRuntimeError("ACP_FLOW_CANCEL_FAILED", params.flowCancelError);
                }
                return { cancelled: true };
              },
            };
          },
        },
      } : {}),
    },
  };
}

test("ACP-native readiness gates on tasks.flows and backend while taskFlow remains optional", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  const backendWithOptionalTaskFlow = getDefaultRuntimeBackend({
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp", withTaskFlow: false }) },
  });
  assert.equal(backendWithOptionalTaskFlow.kind, "acp-native");
  const readyState = await backendWithOptionalTaskFlow.inspectRuntime({});
  assert.equal(readyState.ready, true);
  assert.match((readyState.notes ?? []).join("\n"), /compatibility seam `api\.runtime\.taskFlow` is unavailable/i);

  const backendWithoutRequiredFlows = getDefaultRuntimeBackend({
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp", withFlows: false }) },
  });
  assert.equal(backendWithoutRequiredFlows.kind, "spawn");
});

test("ACP-native readiness notes legacy spawn overrides as compatibility-only", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  const backend = getDefaultRuntimeBackend({
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp", withTaskFlow: true, withFlows: true }) },
  });
  assert.equal(backend.kind, "acp-native");

  const runtimeState = await backend.inspectRuntime({
    acpxPath: "/tmp/custom-acpx",
    managedRuntimeDir: "/tmp/dwemr-managed-runtime",
  });

  const notes = (runtimeState.notes ?? []).join("\n");
  assert.match(notes, /`acpxPath`.*ignored by ACP-native execution\./);
  assert.match(notes, /`managedRuntimeDir`.*ignored by ACP-native execution\./);
});

test("ACP-native command run uses one-shot session, owner session binding, and command-scoped identity", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  const bindSessionTracker: Array<{ seam: "flows" | "taskFlow"; sessionKey: string; requesterOrigin?: unknown }> = [];
  const runtimeApi = buildRuntimeApi({
    backendId: "test-acp",
    withFlows: true,
    withTaskFlow: true,
    bindSessionTracker,
  });

  let initializedMode: string | undefined;
  const closeCalls: Array<{ sessionKey: string; reason: string; clearMeta?: boolean; discardPersistentState?: boolean }> = [];
  let releaseTurn: (() => void) | undefined;
  let releaseClose: (() => void) | undefined;
  let sessionState: "ready" | "none" = "ready";
  const runTurnEntered = new Promise<void>((resolve) => {
    acpRuntimeTesting.setAcpSessionManagerForTests({
      async initializeSession(params: { mode?: string }) {
        initializedMode = params.mode;
      },
      async updateSessionRuntimeOptions() {
        return;
      },
      async runTurn(params: {
        onEvent?: (event: { type: string; text?: string; stream?: string }) => void | Promise<void>;
      }) {
        resolve();
        await new Promise<void>((turnResolve) => {
          releaseTurn = turnResolve;
        });
        await params.onEvent?.({ type: "text_delta", stream: "thought", text: "internal" });
        await params.onEvent?.({ type: "text_delta", stream: "output", text: "hello " });
        await params.onEvent?.({ type: "text_delta", stream: "output", text: "world" });
        await params.onEvent?.({ type: "done" });
      },
      async cancelSession() {
        return;
      },
      async closeSession(params: { sessionKey: string; reason: string; clearMeta?: boolean; discardPersistentState?: boolean }) {
        closeCalls.push(params);
        await new Promise<void>((resolve) => {
          releaseClose = resolve;
        });
        sessionState = "none";
        return { runtimeClosed: true, metaCleared: true };
      },
      resolveSession(params: { sessionKey: string }) {
        if (sessionState === "none") {
          return { kind: "none", sessionKey: params.sessionKey };
        }
        return {
          kind: "ready",
          sessionKey: params.sessionKey,
          meta: {
            state: "running",
            mode: "oneshot",
            agent: "claude",
            backend: "test-acp",
            runtimeOptions: {},
            capabilities: {},
            lastActivityAt: Date.now(),
          },
        };
      },
    });
  });

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "dwemr-runtime-backend-test-"));
  const targetPath = path.join(stateDir, "project");
  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: {
      api: runtimeApi,
      toolContext: {
        sessionKey: "owner-session-key",
        deliveryContext: { route: "unit-test" },
      },
    },
  });

  try {
    const runPromise = backend.runClaudeCommand({
      targetPath,
      claudeCommand: "/delivery-status",
      runtimeConfig: { model: "claude-sonnet-4-6" },
      options: {
        stateDir,
        action: "status",
      },
    });

    await runTurnEntered;

    let activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    for (let attempt = 0; attempt < 10 && !activeRun; attempt += 1) {
      await sleep(10);
      activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    }

    assert.ok(activeRun);
    assert.equal(activeRun.identity.backendKind, "acp-native");
    assert.match(activeRun.identity.runId, /^dwemr-/);
    assert.ok(activeRun.identity.childSessionKey);
    assert.match(activeRun.identity.childSessionKey ?? "", /:run-/);
    assert.equal(activeRun.identity.flowId, "flow-1");
    assert.equal(activeRun.identity.taskId, "task-1");

    const flowBind = bindSessionTracker.find((entry) => entry.seam === "flows");
    const taskFlowBind = bindSessionTracker.find((entry) => entry.seam === "taskFlow");
    assert.equal(flowBind?.sessionKey, "owner-session-key");
    assert.deepEqual(flowBind?.requesterOrigin, { route: "unit-test" });
    assert.equal(taskFlowBind?.sessionKey, "owner-session-key");
    assert.deepEqual(taskFlowBind?.requesterOrigin, { route: "unit-test" });
    assert.equal(initializedMode, "oneshot");

    releaseTurn?.();
    await sleep(10);
    const stillTrackedDuringClose = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    assert.ok(stillTrackedDuringClose);
    assert.equal(closeCalls.length, 1);
    assert.equal(closeCalls[0]?.reason, "dwemr-command-cleanup");
    assert.equal(closeCalls[0]?.clearMeta, true);
    assert.equal(closeCalls[0]?.discardPersistentState, true);

    releaseClose?.();
    const result = await runPromise;
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "hello world");
    assert.equal(result.timedOut, false);

    const cleared = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    assert.equal(cleared, undefined);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    resetRuntimeHarness();
  }
});

test("ACP-native run works without taskFlow and keeps flow/task identity unset", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  let releaseTurn: (() => void) | undefined;
  const runTurnEntered = new Promise<void>((resolve) => {
    acpRuntimeTesting.setAcpSessionManagerForTests({
      async initializeSession() {
        return;
      },
      async updateSessionRuntimeOptions() {
        return;
      },
    async runTurn(params: {
      onEvent?: (event: { type: string; text?: string; stream?: string }) => void | Promise<void>;
    }) {
        resolve();
        await new Promise<void>((turnResolve) => {
          releaseTurn = turnResolve;
        });
        await params.onEvent?.({ type: "text_delta", stream: "output", text: "ok" });
        await params.onEvent?.({ type: "done" });
      },
      async cancelSession() {
        return;
      },
      async closeSession() {
        return { runtimeClosed: true, metaCleared: true };
      },
      resolveSession() {
        return { kind: "none", sessionKey: "ignored" };
      },
    });
  });

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "dwemr-runtime-backend-test-"));
  const targetPath = path.join(stateDir, "project");
  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp", withTaskFlow: false }) },
  });

  try {
    const state = await backend.inspectRuntime({});
    assert.equal(state.ready, true);
    assert.match((state.notes ?? []).join("\n"), /taskFlow.*unavailable/i);

    const runPromise = backend.runClaudeCommand({
      targetPath,
      claudeCommand: "/delivery-status",
      options: {
        stateDir,
        action: "status",
      },
    });

    await runTurnEntered;

    let activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    for (let attempt = 0; attempt < 10 && !activeRun; attempt += 1) {
      await sleep(10);
      activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    }

    assert.ok(activeRun);
    assert.equal(activeRun.identity.flowId, undefined);
    assert.equal(activeRun.identity.taskId, undefined);

    releaseTurn?.();
    const result = await runPromise;
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "ok");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    resetRuntimeHarness();
  }
});

test("ACP-native timeout errors map to timedOut process results", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  acpRuntimeTesting.setAcpSessionManagerForTests({
    async initializeSession() {
      return;
    },
    async updateSessionRuntimeOptions() {
      return;
    },
    async runTurn() {
      throw new AcpRuntimeError("ACP_TURN_FAILED", "ACP turn timed out after 5s.");
    },
    async cancelSession() {
      return;
    },
    async closeSession() {
      return { runtimeClosed: true, metaCleared: true };
    },
    resolveSession() {
      return { kind: "none", sessionKey: "ignored" };
    },
  });

  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp" }) },
  });

  try {
    const result = await backend.runClaudeCommand({
      targetPath: "/tmp/dwemr-acp-timeout",
      claudeCommand: "/delivery-status",
      options: { action: "status" },
    });

    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
    assert.match(result.stderr, /ACP_TURN_FAILED/);
  } finally {
    resetRuntimeHarness();
  }
});

test("ACP-native pre-turn initialization failures do not create flow/task ledger entries", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  const bindSessionTracker: Array<{ seam: "flows" | "taskFlow"; sessionKey: string; requesterOrigin?: unknown }> = [];
  acpRuntimeTesting.setAcpSessionManagerForTests({
    async initializeSession() {
      throw new AcpRuntimeError("ACP_INIT_FAILED", "ACP session initialization failed.");
    },
    async updateSessionRuntimeOptions() {
      return;
    },
    async runTurn() {
      return;
    },
    async cancelSession() {
      return;
    },
    async closeSession() {
      return { runtimeClosed: true, metaCleared: true };
    },
    resolveSession() {
      return { kind: "none", sessionKey: "ignored" };
    },
  });

  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: {
      api: buildRuntimeApi({
        backendId: "test-acp",
        withFlows: true,
        withTaskFlow: true,
        bindSessionTracker,
      }),
    },
  });

  try {
    const result = await backend.runClaudeCommand({
      targetPath: "/tmp/dwemr-acp-init-failure",
      claudeCommand: "/delivery-status",
      options: { action: "status" },
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /ACP_INIT_FAILED/);
    assert.equal(bindSessionTracker.length, 0);
  } finally {
    resetRuntimeHarness();
  }
});

test("ACP-native auto-selection honors runtime acpBackend override", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend("override-backend");

  const runtimeApi = buildRuntimeApi({ backendId: "missing-backend" });
  const fallbackBackend = getDefaultRuntimeBackend({
    runtimeContext: { api: runtimeApi },
  });
  assert.equal(fallbackBackend.kind, "spawn");

  const overriddenBackend = getDefaultRuntimeBackend({
    runtimeContext: { api: runtimeApi },
    runtimeConfig: { acpBackend: "override-backend" },
  });
  assert.equal(overriddenBackend.kind, "acp-native");
});

test("ACP-native leaves timeoutSeconds unset for timeoutMs=null", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  let observedTimeoutSeconds: number | undefined | null = null;
  acpRuntimeTesting.setAcpSessionManagerForTests({
    async initializeSession() {
      return;
    },
    async updateSessionRuntimeOptions(params: { patch?: { timeoutSeconds?: number } }) {
      observedTimeoutSeconds = params.patch?.timeoutSeconds;
    },
    async runTurn() {
      return;
    },
    async cancelSession() {
      return;
    },
    async closeSession() {
      return { runtimeClosed: true, metaCleared: true };
    },
    resolveSession() {
      return { kind: "none", sessionKey: "ignored" };
    },
  });

  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp" }) },
  });

  try {
    const result = await backend.runClaudeCommand({
      targetPath: "/tmp/dwemr-acp-no-timeout",
      claudeCommand: "/delivery-continue",
      options: { action: "continue", timeoutMs: null },
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.equal(observedTimeoutSeconds, undefined);
  } finally {
    resetRuntimeHarness();
  }
});

test("ACP-native stop cancels session using childSessionKey", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  const cancelled: Array<{ sessionKey: string; reason?: string }> = [];
  acpRuntimeTesting.setAcpSessionManagerForTests({
    async cancelSession(params: { sessionKey: string; reason?: string }) {
      cancelled.push(params);
    },
  });

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "dwemr-runtime-backend-test-"));
  const targetPath = path.join(stateDir, "project");
  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp" }) },
  });

  try {
    await registerActiveRun(stateDir, {
      projectPath: targetPath,
      startedAt: new Date().toISOString(),
      action: "continue",
      claudeCommand: "/delivery-continue",
      sessionName: "legacy-session-name",
      identity: {
        backendKind: "acp-native",
        runId: "dwemr-stop-test",
        childSessionKey: "child-session-key",
      },
    });

    const stopResult = await backend.stopActiveRun(stateDir, targetPath);
    assert.equal(stopResult.status, "stopped");
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0]?.sessionKey, "child-session-key");
    assert.equal(cancelled[0]?.reason, "dwemr-stop");

    const activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    assert.equal(activeRun, undefined);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    resetRuntimeHarness();
  }
});

test("ACP-native keeps tracked run when one-shot cleanup cannot close the session", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  acpRuntimeTesting.setAcpSessionManagerForTests({
    async initializeSession() {
      return;
    },
    async updateSessionRuntimeOptions() {
      return;
    },
    async runTurn(params: {
      onEvent?: (event: { type: string; text?: string; stream?: string }) => void | Promise<void>;
    }) {
      await params.onEvent?.({ type: "text_delta", stream: "output", text: "done" });
      await params.onEvent?.({ type: "done" });
    },
    async cancelSession() {
      return;
    },
    async closeSession() {
      throw new AcpRuntimeError("ACP_CLOSE_FAILED", "cleanup close failed");
    },
    resolveSession(params: { sessionKey: string }) {
      return {
        kind: "ready",
        sessionKey: params.sessionKey,
        meta: {
          state: "running",
          mode: "oneshot",
          agent: "claude",
          backend: "test-acp",
          runtimeOptions: {},
          capabilities: {},
          lastActivityAt: Date.now(),
        },
      };
    },
  });

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "dwemr-runtime-backend-test-"));
  const targetPath = path.join(stateDir, "project");
  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: { api: buildRuntimeApi({ backendId: "test-acp" }) },
  });

  try {
    const result = await backend.runClaudeCommand({
      targetPath,
      claudeCommand: "/delivery-continue",
      options: {
        stateDir,
        action: "continue",
      },
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stderr, /ACP_CLOSE_FAILED/);

    const activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    assert.ok(activeRun);
    assert.equal(activeRun.identity.backendKind, "acp-native");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    resetRuntimeHarness();
  }
});

test("ACP-native stop cancels task flow before session fallback", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  const sessionCancels: Array<{ sessionKey: string; reason?: string; cfg?: unknown }> = [];
  acpRuntimeTesting.setAcpSessionManagerForTests({
    async cancelSession(params: { sessionKey: string; reason?: string; cfg?: unknown }) {
      sessionCancels.push(params);
    },
  });

  const flowCancels: Array<{ flowId: string; sessionKey: string }> = [];
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "dwemr-runtime-backend-test-"));
  const targetPath = path.join(stateDir, "project");
  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: {
      api: buildRuntimeApi({
        backendId: "test-acp",
        flowCancelTracker: flowCancels,
      }),
    },
  });

  try {
    await registerActiveRun(stateDir, {
      projectPath: targetPath,
      startedAt: new Date().toISOString(),
      action: "continue",
      claudeCommand: "/delivery-continue",
      sessionName: "child-session-key",
      identity: {
        backendKind: "acp-native",
        runId: "dwemr-stop-flow-first",
        flowId: "flow-1",
        childSessionKey: "child-session-key",
        ownerSessionKey: "owner-session-key",
      },
    });

    const stopResult = await backend.stopActiveRun(stateDir, targetPath);
    assert.equal(stopResult.status, "stopped");
    assert.equal(stopResult.mechanism.detail, "taskFlow.cancel");
    assert.equal(flowCancels.length, 1);
    assert.deepEqual(flowCancels[0], { flowId: "flow-1", sessionKey: "owner-session-key" });
    assert.equal(sessionCancels.length, 0);

    const activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    assert.equal(activeRun, undefined);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    resetRuntimeHarness();
  }
});

test("ACP-native stop falls back to session cancel when flow cancel fails", async () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();

  const sessionCancels: Array<{ sessionKey: string; reason?: string }> = [];
  acpRuntimeTesting.setAcpSessionManagerForTests({
    async cancelSession(params: { sessionKey: string; reason?: string }) {
      sessionCancels.push(params);
    },
  });

  const flowCancels: Array<{ flowId: string; sessionKey: string }> = [];
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "dwemr-runtime-backend-test-"));
  const targetPath = path.join(stateDir, "project");
  const backend = getDefaultRuntimeBackend({
    preferredKind: "acp-native",
    runtimeContext: {
      api: buildRuntimeApi({
        backendId: "test-acp",
        flowCancelTracker: flowCancels,
        flowCancelError: "flow cancellation failed",
      }),
    },
  });

  try {
    await registerActiveRun(stateDir, {
      projectPath: targetPath,
      startedAt: new Date().toISOString(),
      action: "continue",
      claudeCommand: "/delivery-continue",
      sessionName: "child-session-key",
      identity: {
        backendKind: "acp-native",
        runId: "dwemr-stop-flow-fallback",
        flowId: "flow-1",
        childSessionKey: "child-session-key",
        ownerSessionKey: "owner-session-key",
      },
    });

    const stopResult = await backend.stopActiveRun(stateDir, targetPath);
    assert.equal(stopResult.status, "stopped");
    assert.match(stopResult.mechanism.detail ?? "", /acp\.cancelSession/);
    assert.equal(flowCancels.length, 1);
    assert.deepEqual(flowCancels[0], { flowId: "flow-1", sessionKey: "owner-session-key" });
    assert.equal(sessionCancels.length, 1);
    assert.deepEqual(sessionCancels[0], {
      cfg: { acp: { backend: "test-acp" } },
      sessionKey: "child-session-key",
      reason: "dwemr-stop",
    });

    const activeRun = await findActiveRun(stateDir, targetPath, { backendKind: "acp-native" });
    assert.equal(activeRun, undefined);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    resetRuntimeHarness();
  }
});
