import { randomUUID } from "node:crypto";
import {
  clearActiveRun,
  findActiveRun as findStoredActiveRun,
  loadActiveRuns,
  registerActiveRun,
  snapshotChildPids,
  type DwemrActiveRun,
} from "./active-runs";
import type { ProcessResult } from "./claude-runner";
import type { DwemrRuntimeConfig } from "./runtime";
import type { DwemrClaudeModelConfig } from "./claude-runner";
import type {
  DwemrRuntimeBackend,
  DwemrRuntimeContext,
  DwemrSessionInfo,
} from "./runtime-backend-types";
import {
  ACP_NATIVE_BACKEND_KIND,
  asRuntimeApi,
  buildAcpRuntimeOptionPatch,
  buildAcpSessionScopeKey,
  buildCommandScopedAcpSessionKey,
  resolveAcpAgentId,
  resolveAcpBackendId,
  resolveOwnerSessionKey,
  resolveOpenClawConfig,
  resolveRuntimeTimeoutSeconds,
} from "./acp-config";
import { collectAcpRuntimeOutput, formatAcpLifecycleError } from "./acp-output";
import { type AcpFlowTracking, createAcpFlowTracking } from "./acp-flow-tracking";
import {
  ACP_LIFECYCLE_REASONS,
  closeAcpSession,
  closeAcpCommandSession,
  discoverAcpAgentPid,
  isAcpRuntimeReady,
  reconcileTrackedAcpRun,
} from "./acp-session-lifecycle";
import { attemptFlowCancel, attemptOsKill, attemptSessionCancel } from "./acp-stop";
import {
  buildErrorResult,
  buildSuccessResult,
  buildTurnEventHandler,
  createAcpEventCollector,
} from "./acp-turn-result";
import { getAcpSessionManager, readAcpSessionEntry } from "openclaw/plugin-sdk/acp-runtime";

const ACP_NATIVE_DOCTOR_PROMPT_TEXT = "Say only: DWEMR_READY";
const ACP_NATIVE_DOCTOR_PROMPT_EXPECTED = "DWEMR_READY";

async function initAcpOneshotSession(params: {
  manager: ReturnType<typeof getAcpSessionManager>;
  cfg: Record<string, unknown>;
  sessionKey: string;
  agentId: string;
  backendId: string | undefined;
  targetPath: string;
  runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined;
  timeoutSeconds: number | undefined;
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
    patch: buildAcpRuntimeOptionPatch(params.targetPath, params.runtimeConfig, params.timeoutSeconds),
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
      const runtimeState = request.runtimeState ?? isAcpRuntimeReady(runtimeApi, request.runtimeConfig ?? {});
      if (!runtimeState.ready) {
        throw new Error(`DWEMR ACP-native runtime is not ready.\n${runtimeState.notes?.join("\n") ?? ""}`.trim());
      }

      const cfg = resolveOpenClawConfig(runtimeApi);
      if (!cfg) {
        throw new Error("DWEMR ACP-native runtime is missing OpenClaw config context.");
      }

      const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
      const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
      const requestId = `dwemr-${randomUUID()}`;
      const sessionKey = buildCommandScopedAcpSessionKey(request.targetPath, agentId, requestId, request.runtimeConfig);
      const ownerSessionKey = resolveOwnerSessionKey(context, sessionKey);
      const timeoutSeconds = resolveRuntimeTimeoutSeconds(request.options);

      const collector = createAcpEventCollector();
      let flowTracking: AcpFlowTracking | undefined;
      let result: ProcessResult = { exitCode: 1, stdout: "", stderr: "", timedOut: false };

      try {
        const beforePids = await snapshotChildPids("claude");
        await initAcpOneshotSession({
          manager, cfg, sessionKey, agentId, backendId,
          targetPath: request.targetPath,
          runtimeConfig: request.runtimeConfig,
          timeoutSeconds,
        });
        const discoveredPid = await discoverAcpAgentPid(beforePids, request.targetPath);
        flowTracking = createAcpFlowTracking({
          runtimeApi, ownerSessionKey, childSessionKey: sessionKey,
          requesterOrigin: context?.toolContext?.deliveryContext,
          action: request.options?.action ?? "unknown",
          claudeCommand: request.claudeCommand, requestId,
        });

        if (request.options?.stateDir) {
          try {
            await registerActiveRun(request.options.stateDir, {
              projectPath: request.targetPath,
              startedAt: new Date().toISOString(),
              action: request.options.action ?? "unknown",
              executionMode: request.options.executionMode,
              claudeCommand: request.claudeCommand,
              sessionName: sessionKey,
              pid: discoveredPid,
              identity: {
                backendKind: ACP_NATIVE_BACKEND_KIND, runId: requestId,
                flowId: flowTracking.flowId, taskId: flowTracking.taskId,
                childSessionKey: sessionKey, ownerSessionKey, pid: discoveredPid,
              },
            });
          } catch {
            // Best-effort registry; command execution should continue even if bookkeeping fails.
          }
        }

        const handler = buildTurnEventHandler(collector);
        await manager.runTurn({ cfg, sessionKey, text: request.claudeCommand, mode: "prompt", requestId, onEvent: handler.onEvent });

        if (flowTracking) await flowTracking.finish({ failed: false });
        result = buildSuccessResult(collector, handler.summarize());
      } catch (error) {
        if (flowTracking) await flowTracking.finish({ failed: true, error: String(error) });
        result = buildErrorResult(error, collector);
      } finally {
        const cleanup = await closeAcpCommandSession({ cfg, manager, sessionKey });
        if (!cleanup.terminal && cleanup.error) {
          result.stderr = result.stderr ? `${result.stderr}\n${cleanup.error}` : cleanup.error;
        }
        if (request.options?.stateDir && cleanup.terminal) {
          try {
            await clearAcpActiveRun(request.options.stateDir, request.targetPath, requestId);
          } catch {
            // Best-effort cleanup; command result should still be returned.
          }
        }
      }
      return result;
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
        return { status: "failed", detail: "ACP-native runtime is missing OpenClaw config context." };
      }

      const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
      const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
      const sessionKey = `${buildAcpSessionScopeKey(request.targetPath, agentId, request.runtimeConfig)}-doctor`;
      const requestId = `dwemr-doctor-${randomUUID()}`;
      const collector = createAcpEventCollector();
      let probeResult:
        | { status: "ok"; detail: string; result: ProcessResult }
        | { status: "failed"; detail: string }
        | undefined;

      try {
        await initAcpOneshotSession({
          manager, cfg, sessionKey, agentId, backendId,
          targetPath: request.targetPath,
          runtimeConfig: request.runtimeConfig,
          timeoutSeconds: 60,
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
        if (!cleanup.terminal && cleanup.error) {
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
      const seenKeys = new Set<string>();

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
      for (const run of runs) {
        const key = run.identity.childSessionKey;
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);

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
      const seenKeys = new Set<string>();

      for (const run of runs) {
        const key = run.identity.childSessionKey;
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);

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
