import { randomUUID } from "node:crypto";
import {
  clearActiveRun,
  findActiveRun as findStoredActiveRun,
  loadActiveRuns,
  registerActiveRun,
  snapshotChildPids,
  type DwemrActiveRun,
} from "../../state/active-runs";
import type { DwemrProcessResult } from "../claude-runner";
import type { DwemrRuntimeConfig } from "../runtime";
import type { DwemrClaudeModelConfig } from "../claude-runner";
import type {
  DwemrRunCommandRequest,
  DwemrRuntimeBackend,
  DwemrRuntimeContext,
  DwemrSessionInfo,
  RuntimeApiLike,
} from "../runtime-backend-types";
import {
  ACP_NATIVE_BACKEND_KIND,
  asRuntimeApi,
  buildAcpRuntimeOptionPatch,
  resolveAcpAgentId,
  resolveAcpBackendId,
  resolveOwnerSessionKey,
  resolveOpenClawConfig,
} from "./acp-config";
import { buildAcpSessionKey } from "./acp-keys";
import { collectAcpRuntimeOutput, formatAcpLifecycleError } from "./acp-output";
import { type AcpFlowTracking, createAcpFlowTracking } from "./acp-flow-tracking";
import { isAcpRuntimeReady } from "./acp-readiness";
import {
  ACP_LIFECYCLE_REASONS,
  closeAcpSession,
  closeAcpCommandSession,
  discoverAcpAgentPid,
  reconcileTrackedAcpRun,
} from "./acp-session-lifecycle";
import { attemptFlowCancel, attemptOsKill, attemptSessionCancel } from "./acp-stop";
import {
  type AcpEventCollector,
  buildErrorResult,
  buildSuccessResult,
  buildTurnEventHandler,
  createAcpEventCollector,
} from "./acp-turn-result";
import { getAcpSessionManager, readAcpSessionEntry } from "openclaw/plugin-sdk/acp-runtime";

const ACP_NATIVE_DOCTOR_PROMPT_TEXT = "Say only: DWEMR_READY";
const ACP_NATIVE_DOCTOR_PROMPT_EXPECTED = "DWEMR_READY";
const MISSING_OPENCLAW_CONFIG_CONTEXT_MESSAGE =
  "DWEMR ACP-native runtime is missing OpenClaw config context.";

async function initAcpOneshotSession(params: {
  manager: ReturnType<typeof getAcpSessionManager>;
  cfg: Record<string, unknown>;
  sessionKey: string;
  agentId: string;
  backendId: string | undefined;
  targetPath: string;
  runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined;
}) {
  await params.manager.initializeSession({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    agent: params.agentId,
    mode: "oneshot",
    cwd: params.targetPath,
    ...(params.backendId ? { backendId: params.backendId } : {}),
  });
  await params.manager.updateSessionRuntimeOptions({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    patch: buildAcpRuntimeOptionPatch(params.targetPath, params.runtimeConfig),
  });
}

function applySessionMeta(
  info: DwemrSessionInfo,
  meta: { state?: string; mode?: string; agent?: string; backend?: string; cwd?: string; lastActivityAt?: number; lastError?: string },
) {
  info.state = (meta.state as DwemrSessionInfo["state"]) ?? info.state;
  info.mode = (meta.mode as DwemrSessionInfo["mode"]) ?? info.mode;
  info.agent = meta.agent ?? info.agent;
  info.backend = meta.backend ?? info.backend;
  info.cwd = meta.cwd ?? info.cwd;
  info.lastActivityAt = meta.lastActivityAt ?? info.lastActivityAt;
  info.lastError = meta.lastError ?? info.lastError;
}

function resolveRunPid(run: DwemrActiveRun) {
  return run.pid ?? run.identity.pid;
}

function findAcpActiveRun(stateDir: string, projectPath: string) {
  return findStoredActiveRun(stateDir, projectPath, { backendKind: ACP_NATIVE_BACKEND_KIND });
}

function loadAcpActiveRuns(stateDir: string) {
  return loadActiveRuns(stateDir, { backendKind: ACP_NATIVE_BACKEND_KIND, pruneStale: false });
}

function clearAcpActiveRun(stateDir: string, projectPath: string, runId: string) {
  return clearActiveRun(stateDir, projectPath, { runId, backendKind: ACP_NATIVE_BACKEND_KIND });
}

function uniqueRunsByChildSessionKey(
  runs: DwemrActiveRun[],
): Array<{ run: DwemrActiveRun; key: string }> {
  const seen = new Set<string>();
  const result: Array<{ run: DwemrActiveRun; key: string }> = [];
  for (const run of runs) {
    const key = run.identity.childSessionKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ run, key });
  }
  return result;
}

type RunAcpClaudeCommandDeps = {
  request: DwemrRunCommandRequest;
  runtimeApi: RuntimeApiLike | undefined;
  manager: ReturnType<typeof getAcpSessionManager>;
  context: DwemrRuntimeContext | undefined;
};

type AcpRunPlan = {
  cfg: Record<string, unknown>;
  agentId: string;
  backendId: string | undefined;
  requestId: string;
  sessionKey: string;
  ownerSessionKey: string;
};

function planAcpRun(deps: RunAcpClaudeCommandDeps): AcpRunPlan {
  const { request, runtimeApi, context } = deps;
  const runtimeState = request.runtimeState ?? isAcpRuntimeReady(runtimeApi, request.runtimeConfig ?? {});
  if (!runtimeState.ready) {
    throw new Error(`DWEMR ACP-native runtime is not ready.\n${runtimeState.notes?.join("\n") ?? ""}`.trim());
  }
  const cfg = resolveOpenClawConfig(runtimeApi);
  if (!cfg) {
    throw new Error(MISSING_OPENCLAW_CONFIG_CONTEXT_MESSAGE);
  }
  const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
  const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
  const requestId = `dwemr-${randomUUID()}`;
  const sessionKey = buildAcpSessionKey({
    targetPath: request.targetPath,
    agentId,
    runtimeConfig: request.runtimeConfig,
    scope: { kind: "command", requestId },
  });
  const ownerSessionKey = resolveOwnerSessionKey(context, sessionKey);
  return { cfg, agentId, backendId, requestId, sessionKey, ownerSessionKey };
}

async function startAcpRun(params: {
  manager: ReturnType<typeof getAcpSessionManager>;
  plan: AcpRunPlan;
  request: DwemrRunCommandRequest;
  runtimeApi: RuntimeApiLike | undefined;
  context: DwemrRuntimeContext | undefined;
}): Promise<AcpFlowTracking> {
  const { manager, plan, request, runtimeApi, context } = params;
  const beforePids = await snapshotChildPids("claude");
  await initAcpOneshotSession({
    manager,
    cfg: plan.cfg,
    sessionKey: plan.sessionKey,
    agentId: plan.agentId,
    backendId: plan.backendId,
    targetPath: request.targetPath,
    runtimeConfig: request.runtimeConfig,
  });
  const discoveredPid = await discoverAcpAgentPid(beforePids, request.targetPath);
  const flowTracking = createAcpFlowTracking({
    runtimeApi,
    ownerSessionKey: plan.ownerSessionKey,
    childSessionKey: plan.sessionKey,
    requesterOrigin: context?.toolContext?.deliveryContext,
    action: request.options?.action ?? "unknown",
    claudeCommand: request.claudeCommand,
    requestId: plan.requestId,
  });
  await tryRegisterAcpActiveRun({ request, plan, discoveredPid, flowTracking });
  return flowTracking;
}

async function tryRegisterAcpActiveRun(params: {
  request: DwemrRunCommandRequest;
  plan: AcpRunPlan;
  discoveredPid: number | undefined;
  flowTracking: AcpFlowTracking;
}) {
  const { request, plan, discoveredPid, flowTracking } = params;
  if (!request.options?.stateDir) return;
  try {
    await registerActiveRun(request.options.stateDir, {
      projectPath: request.targetPath,
      startedAt: new Date().toISOString(),
      action: request.options.action ?? "unknown",
      executionMode: request.options.executionMode,
      claudeCommand: request.claudeCommand,
      sessionName: plan.sessionKey,
      pid: discoveredPid,
      identity: {
        backendKind: ACP_NATIVE_BACKEND_KIND,
        runId: plan.requestId,
        flowId: flowTracking.flowId,
        taskId: flowTracking.taskId,
        childSessionKey: plan.sessionKey,
        ownerSessionKey: plan.ownerSessionKey,
        pid: discoveredPid,
      },
    });
  } catch {
    // Best-effort registry; command execution should continue even if bookkeeping fails.
  }
}

async function executeAcpTurn(params: {
  manager: ReturnType<typeof getAcpSessionManager>;
  plan: AcpRunPlan;
  request: DwemrRunCommandRequest;
  collector: AcpEventCollector;
}): Promise<string> {
  const { manager, plan, request, collector } = params;
  const handler = buildTurnEventHandler(collector);
  await manager.runTurn({
    cfg: plan.cfg,
    sessionKey: plan.sessionKey,
    text: request.claudeCommand,
    mode: "prompt",
    requestId: plan.requestId,
    onEvent: handler.onEvent,
  });
  return handler.summarize();
}

async function cleanupAcpRun(params: {
  manager: ReturnType<typeof getAcpSessionManager>;
  plan: AcpRunPlan;
  request: DwemrRunCommandRequest;
}): Promise<{ stderrSuffix?: string }> {
  const { manager, plan, request } = params;
  const cleanup = await closeAcpCommandSession({ cfg: plan.cfg, manager, sessionKey: plan.sessionKey });
  if (cleanup.status === "closed" && request.options?.stateDir) {
    try {
      await clearAcpActiveRun(request.options.stateDir, request.targetPath, plan.requestId);
    } catch {
      // Best-effort cleanup; command result should still be returned.
    }
  }
  if (cleanup.status !== "closed") {
    return { stderrSuffix: cleanup.error };
  }
  return {};
}

async function runAcpClaudeCommand(deps: RunAcpClaudeCommandDeps): Promise<DwemrProcessResult> {
  const { request, runtimeApi, manager, context } = deps;
  const plan = planAcpRun(deps);
  const collector = createAcpEventCollector();
  let flowTracking: AcpFlowTracking | undefined;
  let result: DwemrProcessResult = { exitCode: 1, stdout: "", stderr: "", timedOut: false };

  try {
    flowTracking = await startAcpRun({ manager, plan, request, runtimeApi, context });
    const diagSummary = await executeAcpTurn({ manager, plan, request, collector });
    await flowTracking.finish({ failed: false });
    result = buildSuccessResult(collector, diagSummary);
  } catch (error) {
    if (flowTracking) await flowTracking.finish({ failed: true, error: String(error) });
    result = buildErrorResult(error, collector);
  } finally {
    const { stderrSuffix } = await cleanupAcpRun({ manager, plan, request });
    if (stderrSuffix) {
      result.stderr = result.stderr ? `${result.stderr}\n${stderrSuffix}` : stderrSuffix;
    }
  }
  return result;
}

export function createAcpNativeRuntimeBackend(context?: DwemrRuntimeContext): DwemrRuntimeBackend {
  const runtimeApi = asRuntimeApi(context?.api);
  const manager = getAcpSessionManager();

  return {
    kind: ACP_NATIVE_BACKEND_KIND,
    async inspectRuntime(config) {
      return isAcpRuntimeReady(runtimeApi, config);
    },
    async ensureRuntime(config) {
      return isAcpRuntimeReady(runtimeApi, config);
    },
    async runClaudeCommand(request) {
      return runAcpClaudeCommand({ request, runtimeApi, manager, context });
    },
    async probeClaudeRuntime(request) {
      if (!request.project.exists) {
        return { status: "skipped", detail: "Skipped because the target project path does not exist." };
      }
      if (request.project.installState === "missing") {
        return { status: "skipped", detail: "Skipped because DWEMR project assets are not installed yet." };
      }
      if (request.project.installState === "unsupported_contract") {
        return {
          status: "skipped",
          detail: "Skipped because the project uses an unsupported DWEMR state contract. Re-run `/dwemr init <path> --overwrite --confirm-overwrite` first.",
        };
      }

      const runtimeState = request.runtimeState ?? isAcpRuntimeReady(runtimeApi, request.runtimeConfig ?? {});
      if (!runtimeState.ready) {
        return { status: "skipped", detail: "Skipped because ACP-native runtime is not ready yet." };
      }

      const cfg = resolveOpenClawConfig(runtimeApi);
      if (!cfg) {
        return { status: "failed", detail: MISSING_OPENCLAW_CONFIG_CONTEXT_MESSAGE };
      }

      const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
      const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
      const sessionKey = buildAcpSessionKey({
        targetPath: request.targetPath,
        agentId,
        runtimeConfig: request.runtimeConfig,
        scope: { kind: "doctor" },
      });
      const requestId = `dwemr-doctor-${randomUUID()}`;
      const collector = createAcpEventCollector();
      let probeResult:
        | { status: "ok"; detail: string; result: DwemrProcessResult }
        | { status: "failed"; detail: string }
        | undefined;

      try {
        await initAcpOneshotSession({
          manager, cfg, sessionKey, agentId, backendId,
          targetPath: request.targetPath,
          runtimeConfig: request.runtimeConfig,
        });
        await manager.runTurn({
          cfg,
          sessionKey,
          text: ACP_NATIVE_DOCTOR_PROMPT_TEXT,
          mode: "prompt",
          requestId,
          onEvent: collector.collect,
        });

        const output = collectAcpRuntimeOutput(collector.events);
        if (output.trim() !== ACP_NATIVE_DOCTOR_PROMPT_EXPECTED) {
          probeResult = {
            status: "failed",
            detail: output || "ACP runtime returned an unexpected health-check response.",
          };
        } else {
          probeResult = {
            status: "ok",
            detail: `ACP runtime is reachable, session \`${sessionKey}\` is healthy, and a probe prompt returned \`DWEMR_READY\`.`,
            result: {
              exitCode: 0,
              stdout: output,
              stderr: "",
              timedOut: false,
            },
          };
        }
      } catch (error) {
        probeResult = {
          status: "failed",
          detail: formatAcpLifecycleError(error),
        };
      } finally {
        const cleanup = await closeAcpCommandSession({ cfg, manager, sessionKey });
        if (cleanup.status !== "closed") {
          probeResult = {
            status: "failed",
            detail: probeResult
              ? `${probeResult.detail}\n${cleanup.error}`
              : cleanup.error,
          };
        }
      }
      return probeResult ?? { status: "failed", detail: "ACP probe finished without producing a result." };
    },
    findActiveRun(stateDir, projectPath) {
      return findAcpActiveRun(stateDir, projectPath).then((run) => {
        if (!run) {
          return undefined;
        }
        return reconcileTrackedAcpRun({
          stateDir,
          projectPath,
          run,
          runtimeApi,
        });
      });
    },
    async stopActiveRun(stateDir, projectPath) {
      const run = await findAcpActiveRun(stateDir, projectPath);
      if (!run) {
        return { status: "not_found", projectPath };
      }

      const cfg = resolveOpenClawConfig(runtimeApi);
      const sessionKey = run.identity.childSessionKey ?? run.sessionName;
      const flowId = run.identity.flowId;
      const ownerSessionKey = run.identity.ownerSessionKey ?? sessionKey;
      const errors: string[] = [];

      // Tier 1: Try flow-level cancel
      if (cfg && flowId && ownerSessionKey) {
        const r = await attemptFlowCancel({ runtimeApi, cfg, flowId, ownerSessionKey, requesterOrigin: context?.toolContext?.deliveryContext });
        if (r.outcome === "stopped") {
          await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
          return { status: "stopped", run, mechanism: r.mechanism };
        }
        if (r.outcome === "failed") errors.push(`Flow cancellation error: ${r.error}`);
      }

      if (!cfg || !sessionKey) {
        errors.push("ACP-native run is missing session context; runtime-level cancellation was skipped.");
      } else {
        // Tier 2: Try session-level cancel
        const sessionResult = await attemptSessionCancel({ manager, cfg, sessionKey, flowCancelFailed: errors.length > 0 });
        if (sessionResult.outcome === "stopped") {
          await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
          return { status: "stopped", run, mechanism: sessionResult.mechanism };
        }
        if (sessionResult.outcome === "failed") errors.push(`Session cancellation error: ${sessionResult.error}`);
      }

      // Tier 3: OS-level fallback
      const osResult = await attemptOsKill(resolveRunPid(run));
      if (osResult.outcome === "stopped") {
        await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
        return { status: "stopped", run, mechanism: osResult.mechanism };
      }

      return { status: "failed", run, error: errors.join(" ") };
    },

    async listSessions(stateDir) {
      const cfg = resolveOpenClawConfig(runtimeApi);
      const sessions: DwemrSessionInfo[] = [];

      // Collect session keys from active runs
      const trackedRuns = await loadAcpActiveRuns(stateDir);
      const runs: DwemrActiveRun[] = [];
      for (const run of trackedRuns) {
        const reconciled = await reconcileTrackedAcpRun({
          stateDir,
          projectPath: run.projectPath,
          run,
          runtimeApi,
        });
        if (reconciled) {
          runs.push(reconciled);
        }
      }
      for (const { run, key } of uniqueRunsByChildSessionKey(runs)) {
        const info: DwemrSessionInfo = {
          sessionKey: key,
          state: "none",
          source: "active-run",
          projectPath: run.projectPath,
          action: run.action,
          pid: resolveRunPid(run),
        };

        if (cfg) {
          const resolution = manager.resolveSession({ cfg, sessionKey: key });
          if (resolution.kind === "ready" && resolution.meta) {
            applySessionMeta(info, resolution.meta);
          } else if (resolution.kind !== "ready") {
            info.state = resolution.kind;
          }
        }

        const storeEntry = readAcpSessionEntry({ sessionKey: key, cfg: cfg ?? undefined });
        if (storeEntry?.acp && info.state === "none") {
          applySessionMeta(info, storeEntry.acp);
        }

        sessions.push(info);
      }

      let aggregate = { activeSessions: 0, evictedTotal: 0 };
      if (cfg) {
        const snapshot = manager.getObservabilitySnapshot(cfg);
        aggregate = {
          activeSessions: snapshot.runtimeCache.activeSessions,
          evictedTotal: snapshot.runtimeCache.evictedTotal,
        };
      }

      return { sessions, aggregate };
    },

    async clearSessions(stateDir) {
      const cfg = resolveOpenClawConfig(runtimeApi);
      let closed = 0;
      let failed = 0;

      const runs = await loadAcpActiveRuns(stateDir);

      for (const { run, key } of uniqueRunsByChildSessionKey(runs)) {
        let sessionClosed = false;
        if (cfg) {
          try {
            await manager.cancelSession({ cfg, sessionKey: key, reason: ACP_LIFECYCLE_REASONS.sessionsClear });
            sessionClosed = true;
          } catch {
            // cancelSession failed, try closeSession as fallback.
          }
          try {
            await closeAcpSession(manager, cfg, key, ACP_LIFECYCLE_REASONS.sessionsClear, { clearMeta: true });
            sessionClosed = true;
          } catch {
            // closeSession also failed.
          }
        }

        if (!sessionClosed) {
          const osResult = await attemptOsKill(resolveRunPid(run));
          if (osResult.outcome === "stopped") sessionClosed = true;
        }

        if (sessionClosed) {
          closed += 1;
          try {
            await clearAcpActiveRun(stateDir, run.projectPath, run.identity.runId);
          } catch {
            // Best-effort registry cleanup.
          }
        } else {
          failed += 1;
        }
      }

      return { closed, failed };
    },
  };
}
