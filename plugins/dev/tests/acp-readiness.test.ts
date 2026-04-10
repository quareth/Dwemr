import assert from "node:assert/strict";
import test from "node:test";
import { isAcpRuntimeReady } from "../../dwemr/src/openclaw/acp-readiness";
import type { RuntimeApiLike } from "../../dwemr/src/openclaw/runtime-backend-types";
import {
  buildRuntimeApi,
  registerFakeAcpBackend,
  resetRuntimeHarness,
} from "./fixtures/acp-runtime-fakes";

test("isAcpRuntimeReady reports not-ready with blocking note when runtimeApi is undefined", () => {
  resetRuntimeHarness();
  const state = isAcpRuntimeReady(undefined, {});
  assert.equal(state.ready, false);
  assert.equal(state.backendKind, "acp-native");
  assert.match((state.notes ?? []).join("\n"), /OpenClaw plugin runtime context is unavailable/i);
});

test("isAcpRuntimeReady reports not-ready when api.runtime.tasks.flows seam is missing", () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();
  const runtimeApi = buildRuntimeApi({ backendId: "test-acp", withFlows: false }) as unknown as RuntimeApiLike;
  const state = isAcpRuntimeReady(runtimeApi, {});
  assert.equal(state.ready, false);
  assert.match((state.notes ?? []).join("\n"), /api\.runtime\.tasks\.flows/);
});

test("isAcpRuntimeReady reports ready with warning when only the legacy taskFlow seam is missing", () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();
  const runtimeApi = buildRuntimeApi({ backendId: "test-acp", withTaskFlow: false }) as unknown as RuntimeApiLike;
  const state = isAcpRuntimeReady(runtimeApi, {});
  assert.equal(state.ready, true);
  assert.match((state.notes ?? []).join("\n"), /api\.runtime\.taskFlow.*unavailable/i);
});

test("isAcpRuntimeReady reports not-ready when no ACP backend is registered", () => {
  resetRuntimeHarness();
  // Intentionally do NOT call registerFakeAcpBackend.
  const runtimeApi = buildRuntimeApi({ backendId: "missing-backend" }) as unknown as RuntimeApiLike;
  const state = isAcpRuntimeReady(runtimeApi, {});
  assert.equal(state.ready, false);
  assert.match((state.notes ?? []).join("\n"), /backend `missing-backend` is not registered/i);
});

test("isAcpRuntimeReady reports ready when seams are present and backend is registered", () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();
  const runtimeApi = buildRuntimeApi({ backendId: "test-acp" }) as unknown as RuntimeApiLike;
  const state = isAcpRuntimeReady(runtimeApi, {});
  assert.equal(state.ready, true);
  assert.equal(state.acp?.flowViewsAvailable, true);
  assert.equal(state.acp?.taskFlowLegacyAvailable, true);
});

test("isAcpRuntimeReady surfaces caveat notes for legacy spawn-only runtime overrides", () => {
  resetRuntimeHarness();
  registerFakeAcpBackend();
  const runtimeApi = buildRuntimeApi({ backendId: "test-acp" }) as unknown as RuntimeApiLike;
  const state = isAcpRuntimeReady(runtimeApi, {
    acpxPath: "/legacy/acpx",
    managedRuntimeDir: "/legacy/managed",
    subagentModel: "claude-haiku",
    effortLevel: "high",
  });
  assert.equal(state.ready, true);
  const joined = (state.notes ?? []).join("\n");
  assert.match(joined, /acpxPath.*legacy spawn compatibility override/i);
  assert.match(joined, /managedRuntimeDir.*legacy spawn compatibility override/i);
  assert.match(joined, /subagentModel/);
  assert.match(joined, /effortLevel/);
});
