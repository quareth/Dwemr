import type { RuntimeApiLike } from "../runtime-backend-types";
import { isProcessRunning, killProcessWithEscalation } from "../../state/active-runs";
import { resolveLegacyTaskFlow } from "./acp-config";
import { formatAcpLifecycleError } from "./acp-output";
import { ACP_LIFECYCLE_REASONS, closeAcpSession } from "./acp-session-lifecycle";
import { getAcpSessionManager } from "openclaw/plugin-sdk/acp-runtime";

export type StopAttemptResult =
  | { outcome: "stopped"; mechanism: { kind: "signal" | "runtime_cancel"; detail: string } }
  | { outcome: "failed"; error: string }
  | { outcome: "skipped" };

export async function attemptFlowCancel(params: {
  runtimeApi: RuntimeApiLike | undefined;
  cfg: Record<string, unknown>;
  flowId: string;
  ownerSessionKey: string;
  requesterOrigin?: unknown;
}): Promise<StopAttemptResult> {
  const legacyTaskFlow = resolveLegacyTaskFlow(params.runtimeApi);
  const boundTaskFlow = legacyTaskFlow?.bindSession({
    sessionKey: params.ownerSessionKey,
    requesterOrigin: params.requesterOrigin,
  });
  if (!boundTaskFlow?.cancel) {
    return { outcome: "skipped" };
  }
  try {
    await boundTaskFlow.cancel({ flowId: params.flowId, cfg: params.cfg });
    return { outcome: "stopped", mechanism: { kind: "runtime_cancel", detail: "taskFlow.cancel" } };
  } catch (error) {
    return { outcome: "failed", error: formatAcpLifecycleError(error) };
  }
}

export async function attemptSessionCancel(params: {
  manager: ReturnType<typeof getAcpSessionManager>;
  cfg: Record<string, unknown>;
  sessionKey: string;
  flowCancelFailed: boolean;
}): Promise<StopAttemptResult> {
  try {
    await params.manager.cancelSession({ cfg: params.cfg, sessionKey: params.sessionKey, reason: ACP_LIFECYCLE_REASONS.stop });
    try {
      await closeAcpSession(params.manager, params.cfg, params.sessionKey, ACP_LIFECYCLE_REASONS.stopCleanup);
    } catch {
      // Best-effort cleanup of persistent session state.
    }
    return {
      outcome: "stopped",
      mechanism: {
        kind: "runtime_cancel",
        detail: params.flowCancelFailed ? "acp.cancelSession (after taskFlow.cancel failed)" : "acp.cancelSession",
      },
    };
  } catch (error) {
    return { outcome: "failed", error: formatAcpLifecycleError(error) };
  }
}

export async function attemptOsKill(pid: number | undefined): Promise<StopAttemptResult> {
  if (!pid || !isProcessRunning(pid)) {
    return { outcome: "skipped" };
  }
  const killResult = await killProcessWithEscalation(pid);
  if (killResult.status === "killed" || killResult.status === "already_exited") {
    return {
      outcome: "stopped",
      mechanism: {
        kind: "signal",
        detail: `OS-level ${killResult.status === "killed" ? killResult.signal : "process already exited"} (after ACP cancel failed)`,
      },
    };
  }
  return { outcome: "skipped" };
}
