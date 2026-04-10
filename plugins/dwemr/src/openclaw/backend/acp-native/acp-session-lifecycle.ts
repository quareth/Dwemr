import path from "node:path";
import {
  clearActiveRun,
  resolveCwdForPid,
  snapshotChildPids,
  type DwemrActiveRun,
} from "../../state/active-runs";
import type { RuntimeApiLike } from "../runtime-backend-types";
import { ACP_NATIVE_BACKEND_KIND, resolveOpenClawConfig } from "./acp-config";
import { formatAcpLifecycleError } from "./acp-output";
import { getAcpSessionManager, readAcpSessionEntry } from "openclaw/plugin-sdk/acp-runtime";

export const ACP_LIFECYCLE_REASONS = {
  commandCleanup: "dwemr-command-cleanup",
  stop: "dwemr-stop",
  stopCleanup: "dwemr-stop-cleanup",
  sessionsClear: "dwemr-sessions-clear",
  onboardingComplete: "dwemr-onboarding-complete",
} as const;

export async function discoverAcpAgentPid(beforePids: number[], targetPath: string): Promise<number | undefined> {
  try {
    const afterPids = await snapshotChildPids("claude");
    const beforeSet = new Set(beforePids);
    const newPids = afterPids.filter((pid) => !beforeSet.has(pid));

    for (const pid of newPids) {
      const cwd = await resolveCwdForPid(pid);
      if (cwd && path.resolve(cwd) === path.resolve(targetPath)) {
        return pid;
      }
    }
  } catch {
    // Best-effort PID discovery; return undefined on any failure.
  }
  return undefined;
}

export function closeAcpSession(
  sessionManager: ReturnType<typeof getAcpSessionManager>,
  cfg: Record<string, unknown>,
  sessionKey: string,
  reason: string,
  opts?: { clearMeta?: boolean },
) {
  return sessionManager.closeSession({
    cfg,
    sessionKey,
    reason,
    discardPersistentState: true,
    allowBackendUnavailable: true,
    ...(opts?.clearMeta ? { clearMeta: true } : {}),
  });
}

export type CloseAcpCommandSessionResult =
  | { status: "closed" }
  | { status: "stale"; error: string }
  | { status: "still_active"; error: string };

export async function closeAcpCommandSession(params: {
  cfg: Record<string, unknown>;
  manager: ReturnType<typeof getAcpSessionManager>;
  sessionKey: string;
}): Promise<CloseAcpCommandSessionResult> {
  const before = params.manager.resolveSession({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
  });
  if (before.kind === "none") {
    const storeEntry = readAcpSessionEntry({
      sessionKey: params.sessionKey,
      cfg: params.cfg,
    });
    if (!storeEntry?.acp) {
      return { status: "closed" };
    }
    return {
      status: "stale",
      error: "ACP session metadata still exists after runtime reported no active session.",
    };
  }

  try {
    await closeAcpSession(params.manager, params.cfg, params.sessionKey, ACP_LIFECYCLE_REASONS.commandCleanup, { clearMeta: true });
  } catch (error) {
    return {
      status: "still_active",
      error: `DWEMR could not close ACP session \`${params.sessionKey}\` cleanly: ${formatAcpLifecycleError(error)}`,
    };
  }

  const after = params.manager.resolveSession({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
  });
  const storeEntry = readAcpSessionEntry({
    sessionKey: params.sessionKey,
    cfg: params.cfg,
  });
  if (after.kind === "none" && !storeEntry?.acp) {
    return { status: "closed" };
  }

  return {
    status: "still_active",
    error: `ACP session \`${params.sessionKey}\` still appears active after DWEMR cleanup attempted to close it.`,
  };
}

export async function reconcileTrackedAcpRun(params: {
  stateDir: string;
  projectPath: string;
  run: DwemrActiveRun;
  runtimeApi: RuntimeApiLike | undefined;
}) {
  const sessionKey = params.run.identity.childSessionKey ?? params.run.sessionName;
  if (!sessionKey) {
    return params.run;
  }

  const cfg = resolveOpenClawConfig(params.runtimeApi);
  if (!cfg) {
    return params.run;
  }

  const manager = getAcpSessionManager();
  const resolution = manager.resolveSession({
    cfg,
    sessionKey,
  });
  if (resolution.kind !== "none") {
    return params.run;
  }

  const storeEntry = readAcpSessionEntry({
    sessionKey,
    cfg,
  });
  if (storeEntry?.acp) {
    return params.run;
  }

  await clearActiveRun(params.stateDir, params.projectPath, { runId: params.run.identity.runId, backendKind: ACP_NATIVE_BACKEND_KIND });
  return undefined;
}
