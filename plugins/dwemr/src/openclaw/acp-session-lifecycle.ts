import path from "node:path";
import {
  clearActiveRun,
  resolveCwdForPid,
  snapshotChildPids,
  type DwemrActiveRun,
} from "./active-runs";
import type { DwemrRuntimeState, RuntimeApiLike } from "./runtime-backend-types";
import type { DwemrRuntimeConfig } from "./runtime";
import type { DwemrClaudeModelConfig } from "./claude-runner";
import {
  ACP_NATIVE_BACKEND_KIND,
  buildAcpRuntimeSummary,
  collectAcpRuntimeOptionCaveatNotes,
  resolveAcpBackendId,
  resolveAcpConfig,
  resolveOpenClawConfig,
} from "./acp-config";
import { formatAcpLifecycleError } from "./acp-output";
import { getAcpRuntimeBackend, getAcpSessionManager, isAcpRuntimeError, readAcpSessionEntry } from "openclaw/plugin-sdk/acp-runtime";

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

export async function closeAcpCommandSession(params: {
  cfg: Record<string, unknown>;
  manager: ReturnType<typeof getAcpSessionManager>;
  sessionKey: string;
}) {
  const before = params.manager.resolveSession({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
  });
  if (before.kind === "none") {
    const storeEntry = readAcpSessionEntry({
      sessionKey: params.sessionKey,
      cfg: params.cfg,
    });
    return {
      terminal: !storeEntry?.acp,
      error: storeEntry?.acp ? "ACP session metadata still exists after runtime reported no active session." : undefined,
    };
  }

  try {
    await closeAcpSession(params.manager, params.cfg, params.sessionKey, ACP_LIFECYCLE_REASONS.commandCleanup, { clearMeta: true });
  } catch (error) {
    return {
      terminal: false,
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
    return { terminal: true, error: undefined };
  }

  return {
    terminal: false,
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

export function isAcpRuntimeReady(
  runtimeApi: RuntimeApiLike | undefined,
  runtimeConfig: DwemrRuntimeConfig,
): DwemrRuntimeState {
  const blockingNotes: string[] = [];
  const warningNotes: string[] = [];
  const acpSummary = buildAcpRuntimeSummary(runtimeApi, runtimeConfig);
  const acpConfig = resolveAcpConfig(runtimeApi);
  const backendId = resolveAcpBackendId(runtimeApi, runtimeConfig);

  if (!runtimeApi || !resolveOpenClawConfig(runtimeApi)) {
    blockingNotes.push("OpenClaw plugin runtime context is unavailable. ACP-native execution requires a live gateway runtime context.");
  }

  if (!acpSummary.flowViewsAvailable) {
    blockingNotes.push("Missing required runtime seam: `api.runtime.tasks.flows`.");
  }

  if (!acpSummary.taskFlowLegacyAvailable) {
    warningNotes.push("Compatibility seam `api.runtime.taskFlow` is unavailable; DWEMR will run without flow/task mutation ledger writes.");
  }

  if (acpConfig?.enabled === false) {
    blockingNotes.push("ACP is disabled in OpenClaw config (`acp.enabled=false`).");
  }

  const backend = getAcpRuntimeBackend(backendId);
  if (!backend) {
    blockingNotes.push(
      backendId
        ? `ACP backend \`${backendId}\` is not registered in this OpenClaw runtime.`
        : "No ACP backend is currently registered in this OpenClaw runtime.",
    );
  }

  warningNotes.push(...collectAcpRuntimeOptionCaveatNotes(runtimeConfig as DwemrRuntimeConfig & DwemrClaudeModelConfig));
  const notes = [...blockingNotes, ...warningNotes];

  return {
    backendKind: ACP_NATIVE_BACKEND_KIND,
    ready: blockingNotes.length === 0,
    acp: acpSummary,
    notes,
  };
}
