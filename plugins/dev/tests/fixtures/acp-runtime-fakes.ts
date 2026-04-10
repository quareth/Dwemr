import { AcpRuntimeError, __testing as acpRuntimeTesting } from "../../../dwemr/node_modules/openclaw/dist/plugin-sdk/acp-runtime.js";
import { setRuntimeBackendOverride } from "../../../dwemr/src/openclaw/backend/runtime-backend";

export { AcpRuntimeError, acpRuntimeTesting };

/**
 * Reset all ACP runtime test state — session manager, registered backends, and
 * the runtime-backend kind override. Call from `before`/`after` hooks (or at
 * the start of each test) to keep tests independent.
 */
export function resetRuntimeHarness() {
  acpRuntimeTesting.resetAcpSessionManagerForTests();
  acpRuntimeTesting.resetAcpRuntimeBackendsForTests();
  setRuntimeBackendOverride(undefined);
}

/**
 * Register a fake healthy ACP backend in the global runtime registry under
 * the given id. Defaults to `"test-acp"`. The fake backend has an empty
 * `runtime` object and reports `healthy() === true`.
 */
export function registerFakeAcpBackend(id = "test-acp") {
  const state = acpRuntimeTesting.getAcpRuntimeRegistryGlobalStateForTests();
  state.backendsById.set(id, {
    id,
    runtime: {},
    healthy: () => true,
  });
}

/**
 * Build a minimal `RuntimeApiLike`-shaped object suitable for tests that need
 * an ACP runtime API. Toggle `withFlows` / `withTaskFlow` to simulate
 * compatibility-seam variations. Optional trackers and an injected cancel
 * error allow tests to assert orchestration behavior.
 */
export function buildRuntimeApi(params: {
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
