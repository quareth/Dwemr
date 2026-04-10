import type { RuntimeApiLike } from "./runtime-backend-types";
import { resolveRuntimeTasksFlows, resolveLegacyTaskFlow } from "./acp-config";

export type AcpFlowTracking = {
  flowId?: string;
  flowRevision?: number;
  taskId?: string;
  finish: (params: { failed: boolean; error?: string }) => Promise<void>;
};

export const NOOP_FLOW_TRACKING: AcpFlowTracking = { async finish() {} };

export function createAcpFlowTracking(params: {
  runtimeApi: RuntimeApiLike | undefined;
  ownerSessionKey: string;
  childSessionKey: string;
  requesterOrigin?: unknown;
  action: string;
  claudeCommand: string;
  requestId: string;
}): AcpFlowTracking {
  const flowViews = resolveRuntimeTasksFlows(params.runtimeApi);
  const boundFlowViews = flowViews?.bindSession({
    sessionKey: params.ownerSessionKey,
    requesterOrigin: params.requesterOrigin,
  });
  const legacyTaskFlow = resolveLegacyTaskFlow(params.runtimeApi);
  if (!legacyTaskFlow) {
    return NOOP_FLOW_TRACKING;
  }

  const bound = legacyTaskFlow.bindSession({
    sessionKey: params.ownerSessionKey,
    requesterOrigin: params.requesterOrigin,
  });
  if (!bound?.createManaged || !bound.runTask) {
    return NOOP_FLOW_TRACKING;
  }

  let flowId: string | undefined;
  let flowRevision: number | undefined;
  let taskId: string | undefined;

  try {
    const flow = bound.createManaged({
      controllerId: "dwemr/acp-native",
      goal: `DWEMR ${params.action}: ${params.claudeCommand}`,
      status: "running",
      currentStep: params.action,
      stateJson: {
        requestId: params.requestId,
      },
    });
    if (flow?.flowId) {
      flowId = flow.flowId;
      flowRevision = flow.revision;
      const persisted = boundFlowViews?.get?.(flow.flowId);
      if (!persisted) {
        flowId = undefined;
        flowRevision = undefined;
      }
    }
  } catch {
    // Best-effort task flow tracking; run execution should proceed even if ledger writes fail.
  }

  if (flowId) {
    try {
      const taskResult = bound.runTask({
        flowId,
        runtime: "acp",
        sourceId: params.requestId,
        childSessionKey: params.childSessionKey,
        runId: params.requestId,
        label: `DWEMR ${params.action}`,
        task: params.claudeCommand,
        status: "running",
        startedAt: Date.now(),
      });
      if (taskResult?.flow?.revision !== undefined) {
        flowRevision = taskResult.flow.revision;
      }
      if (taskResult?.task?.taskId) {
        taskId = taskResult.task.taskId;
      }
      const summary = boundFlowViews?.getTaskSummary?.(flowId);
      if (!summary) {
        taskId = undefined;
      }
    } catch {
      // Same as above: flow/task failures must not block command execution.
    }
  }

  return {
    flowId,
    flowRevision,
    taskId,
    async finish({ failed, error }) {
      if (!flowId || typeof flowRevision !== "number") {
        return;
      }
      try {
        if (failed && bound.fail) {
          bound.fail({
            flowId,
            expectedRevision: flowRevision,
            blockedSummary: error,
            endedAt: Date.now(),
          });
          return;
        }
        if (!failed && bound.finish) {
          bound.finish({
            flowId,
            expectedRevision: flowRevision,
            endedAt: Date.now(),
          });
          return;
        }
      } catch {
        // Ignore completion-ledger failures.
      }
    },
  };
}
