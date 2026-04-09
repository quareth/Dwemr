import { createHash, randomUUID } from "node:crypto";
import {
  clearActiveRun,
  findActiveRun as findStoredActiveRun,
  registerActiveRun,
  stopActiveRun as stopStoredSpawnRun,
  type DwemrActiveRun,
} from "./active-runs";
import {
  probeClaudeRuntime as probeSpawnClaudeRuntime,
  runClaudeCommand as runSpawnClaudeCommand,
  type ClaudeCommandRunOptions,
  type ClaudeRuntimeProbe,
  type DwemrClaudeModelConfig,
  type ProcessResult,
} from "./claude-runner";
import { ensureManagedDwemrRuntime, inspectDwemrRuntime, type DwemrRuntimeConfig, type DwemrRuntimeInspection } from "./runtime";
import type { ProjectHealth } from "../control-plane/project-assets";
import { getAcpRuntimeBackend, getAcpSessionManager, isAcpRuntimeError } from "openclaw/plugin-sdk/acp-runtime";

const ACP_NATIVE_BACKEND_KIND = "acp-native";
const ACP_DEFAULT_AGENT = "claude";
const ACP_NATIVE_DOCTOR_PROMPT_TEXT = "Say only: DWEMR_READY";
const ACP_NATIVE_DOCTOR_PROMPT_EXPECTED = "DWEMR_READY";

type RuntimeTasksFlowsApi = {
  bindSession: (params: { sessionKey: string; requesterOrigin?: unknown }) => {
    get: (flowId: string) => unknown;
    list: () => unknown[];
    findLatest: () => unknown | undefined;
    resolve: (token: string) => unknown | undefined;
    getTaskSummary: (flowId: string) => unknown;
  };
};

type RuntimeTaskFlowApi = {
  bindSession: (params: { sessionKey: string; requesterOrigin?: unknown }) => {
    createManaged?: (params: {
      controllerId: string;
      goal: string;
      status?: "queued" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled" | "lost";
      currentStep?: string | null;
      stateJson?: unknown;
      waitJson?: unknown;
      cancelRequestedAt?: number | null;
      createdAt?: number;
      updatedAt?: number;
      endedAt?: number | null;
    }) => { flowId: string; revision: number } | undefined;
    get?: (flowId: string) => { flowId: string; revision: number } | undefined;
    runTask?: (params: {
      flowId: string;
      runtime: "acp" | "subagent" | "cli" | "cron";
      sourceId?: string;
      childSessionKey?: string;
      parentTaskId?: string;
      agentId?: string;
      runId?: string;
      label?: string;
      task: string;
      preferMetadata?: boolean;
      status?: "queued" | "running";
      startedAt?: number;
      lastEventAt?: number;
      progressSummary?: string | null;
    }) => {
      created: boolean;
      flow?: { flowId: string; revision: number };
      task?: { taskId: string };
      reason?: string;
      found?: boolean;
    };
    finish?: (params: {
      flowId: string;
      expectedRevision: number;
      stateJson?: unknown;
      updatedAt?: number;
      endedAt?: number;
    }) => unknown;
    fail?: (params: {
      flowId: string;
      expectedRevision: number;
      stateJson?: unknown;
      blockedTaskId?: string | null;
      blockedSummary?: string | null;
      updatedAt?: number;
      endedAt?: number;
    }) => unknown;
    requestCancel?: (params: {
      flowId: string;
      expectedRevision: number;
      cancelRequestedAt?: number;
    }) => unknown;
    cancel?: (params: { flowId: string; cfg: Record<string, unknown> }) => Promise<unknown>;
  };
};

type RuntimeApiLike = {
  config?: any;
  runtime?: {
    tasks?: {
      flows?: RuntimeTasksFlowsApi;
    };
    taskFlow?: RuntimeTaskFlowApi;
  };
};

type AcpRuntimeSummary = {
  backendId?: string;
  defaultAgent?: string;
  flowViewsAvailable: boolean;
  taskFlowLegacyAvailable: boolean;
};

export type DwemrRuntimeToolContext = {
  sessionKey?: string;
  deliveryContext?: unknown;
};

export type DwemrRuntimeContext = {
  api?: unknown;
  toolContext?: DwemrRuntimeToolContext;
};

export type DwemrRuntimeState = {
  backendKind: string;
  ready: boolean;
  shellInspection?: DwemrRuntimeInspection;
  acp?: AcpRuntimeSummary;
  notes?: string[];
};

export type DwemrRunCommandRequest = {
  targetPath: string;
  claudeCommand: string;
  runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig;
  options?: ClaudeCommandRunOptions;
  runtimeState?: DwemrRuntimeState;
};

export type DwemrRuntimeProbeRequest = {
  targetPath: string;
  project: ProjectHealth;
  runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig;
  runtimeState?: DwemrRuntimeState;
};

export type DwemrStopResult =
  | { status: "not_found"; projectPath: string }
  | { status: "already_exited"; run: DwemrActiveRun }
  | { status: "stopped"; run: DwemrActiveRun; mechanism: { kind: "signal" | "runtime_cancel" | "runtime_close" | "other"; detail?: string } }
  | { status: "failed"; run: DwemrActiveRun; error: string };

export type DwemrRuntimeBackend = {
  kind: string;
  inspectRuntime: (config: DwemrRuntimeConfig) => Promise<DwemrRuntimeState>;
  ensureRuntime: (config: DwemrRuntimeConfig) => Promise<DwemrRuntimeState>;
  runClaudeCommand: (request: DwemrRunCommandRequest) => Promise<ProcessResult>;
  probeClaudeRuntime: (request: DwemrRuntimeProbeRequest) => Promise<ClaudeRuntimeProbe>;
  findActiveRun: (stateDir: string, projectPath: string) => Promise<DwemrActiveRun | undefined>;
  stopActiveRun: (stateDir: string, projectPath: string) => Promise<DwemrStopResult>;
};

type RuntimeBackendFactory = (context?: DwemrRuntimeContext) => DwemrRuntimeBackend;

const runtimeBackendRegistry = new Map<string, RuntimeBackendFactory>();

function toSpawnRuntimeState(inspection: DwemrRuntimeInspection): DwemrRuntimeState {
  return {
    backendKind: "spawn",
    ready: Boolean(inspection.readyCommandPath),
    shellInspection: inspection,
  };
}

function resolveReadyCommandPath(runtimeState: DwemrRuntimeState | undefined, runtimeConfig: DwemrRuntimeConfig = {}) {
  if (runtimeState?.shellInspection?.readyCommandPath) {
    return runtimeState.shellInspection.readyCommandPath;
  }
  return inspectDwemrRuntime(runtimeConfig).then((inspection) => inspection.readyCommandPath);
}

function mapSpawnStopResult(result: Awaited<ReturnType<typeof stopStoredSpawnRun>>): DwemrStopResult {
  if (result.status === "stopped") {
    return {
      status: "stopped",
      run: result.run,
      mechanism: {
        kind: "signal",
        detail: result.signal,
      },
    };
  }
  return result;
}

function createSpawnRuntimeBackend(): DwemrRuntimeBackend {
  return {
    kind: "spawn",
    async inspectRuntime(config) {
      return toSpawnRuntimeState(await inspectDwemrRuntime(config));
    },
    async ensureRuntime(config) {
      return toSpawnRuntimeState(await ensureManagedDwemrRuntime(config));
    },
    async runClaudeCommand(request) {
      const commandPath = await resolveReadyCommandPath(request.runtimeState, request.runtimeConfig);
      if (!commandPath) {
        throw new Error("DWEMR runtime is not ready: no executable command path is available.");
      }

      return runSpawnClaudeCommand(
        commandPath,
        request.targetPath,
        request.claudeCommand,
        request.runtimeConfig,
        request.options,
      );
    },
    async probeClaudeRuntime(request) {
      const commandPath = await resolveReadyCommandPath(request.runtimeState, request.runtimeConfig);
      if (!commandPath) {
        return { status: "skipped", detail: "Skipped because no execution runtime is ready yet." };
      }

      return probeSpawnClaudeRuntime(
        commandPath,
        request.targetPath,
        request.project,
        request.runtimeConfig,
      );
    },
    findActiveRun(stateDir, projectPath) {
      return findStoredActiveRun(stateDir, projectPath, { backendKind: "spawn" });
    },
    async stopActiveRun(stateDir, projectPath) {
      return mapSpawnStopResult(await stopStoredSpawnRun(stateDir, projectPath));
    },
  };
}

function asRuntimeApi(api: unknown): RuntimeApiLike | undefined {
  if (!api || typeof api !== "object") {
    return;
  }
  const candidate = api as RuntimeApiLike;
  if (!candidate.runtime || typeof candidate.runtime !== "object") {
    return;
  }
  return candidate;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeAcpAgentId(agent: string | undefined) {
  const candidate = (agent ?? ACP_DEFAULT_AGENT).trim().toLowerCase();
  const normalized = candidate.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return normalized || ACP_DEFAULT_AGENT;
}

function resolveOpenClawConfig(runtimeApi: RuntimeApiLike | undefined) {
  return runtimeApi?.config && typeof runtimeApi.config === "object" ? runtimeApi.config : undefined;
}

function resolveAcpConfig(runtimeApi: RuntimeApiLike | undefined) {
  const config = resolveOpenClawConfig(runtimeApi);
  if (!config) {
    return;
  }
  const candidate = config.acp;
  if (!candidate || typeof candidate !== "object") {
    return;
  }
  return candidate as {
    enabled?: boolean;
    backend?: string;
    defaultAgent?: string;
  };
}

function resolveAcpBackendId(runtimeApi: RuntimeApiLike | undefined, runtimeConfig?: DwemrRuntimeConfig) {
  return normalizeOptionalString((runtimeConfig as { acpBackend?: string } | undefined)?.acpBackend)
    ?? normalizeOptionalString(resolveAcpConfig(runtimeApi)?.backend);
}

function resolveAcpAgentId(runtimeApi: RuntimeApiLike | undefined, runtimeConfig?: DwemrRuntimeConfig) {
  return normalizeAcpAgentId(
    normalizeOptionalString((runtimeConfig as { acpAgent?: string } | undefined)?.acpAgent)
      ?? normalizeOptionalString(resolveAcpConfig(runtimeApi)?.defaultAgent)
      ?? ACP_DEFAULT_AGENT,
  );
}

function resolveRuntimeTasksFlows(runtimeApi: RuntimeApiLike | undefined) {
  return runtimeApi?.runtime?.tasks?.flows;
}

function resolveLegacyTaskFlow(runtimeApi: RuntimeApiLike | undefined) {
  return runtimeApi?.runtime?.taskFlow;
}

function buildAcpRuntimeSummary(runtimeApi: RuntimeApiLike | undefined, runtimeConfig?: DwemrRuntimeConfig): AcpRuntimeSummary {
  return {
    backendId: resolveAcpBackendId(runtimeApi, runtimeConfig),
    defaultAgent: resolveAcpAgentId(runtimeApi, runtimeConfig),
    flowViewsAvailable: Boolean(resolveRuntimeTasksFlows(runtimeApi)),
    taskFlowLegacyAvailable: Boolean(resolveLegacyTaskFlow(runtimeApi)),
  };
}

function buildAcpSessionScopeKey(targetPath: string, agentId: string, runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig) {
  const suffixSource = [
    targetPath,
    runtimeConfig?.model?.trim(),
    runtimeConfig?.subagentModel?.trim(),
    runtimeConfig?.effortLevel?.trim(),
  ].filter(Boolean).join("|");

  const hash = createHash("sha256").update(suffixSource || targetPath).digest("hex").slice(0, 12);
  return `agent:${normalizeAcpAgentId(agentId)}:acp:dwemr-${hash}`;
}

function buildCommandScopedAcpSessionKey(
  targetPath: string,
  agentId: string,
  requestId: string,
  runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig,
) {
  const scopeKey = buildAcpSessionScopeKey(targetPath, agentId, runtimeConfig);
  const runSuffix = createHash("sha256").update(`${requestId}:${targetPath}`).digest("hex").slice(0, 8);
  return `${scopeKey}:run-${runSuffix}`;
}

function resolveRuntimeTimeoutSeconds(options: ClaudeCommandRunOptions | undefined) {
  if (options?.timeoutMs === null) {
    return undefined;
  }
  if (typeof options?.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    return Math.max(1, Math.round(options.timeoutMs / 1000));
  }
  return undefined;
}

function collectAcpRuntimeOptionCaveatNotes(runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined) {
  const notes: string[] = [];
  if (runtimeConfig?.acpxPath?.trim()) {
    notes.push("`acpxPath` is a legacy spawn compatibility override and is ignored by ACP-native execution.");
  }
  if (runtimeConfig?.managedRuntimeDir?.trim()) {
    notes.push("`managedRuntimeDir` is a legacy spawn compatibility override and is ignored by ACP-native execution.");
  }
  if (runtimeConfig?.subagentModel?.trim()) {
    notes.push("ACP-native runtime does not guarantee a direct mapping for `subagentModel`; the configured value is currently best-effort.");
  }
  if (runtimeConfig?.effortLevel?.trim()) {
    notes.push("ACP-native runtime does not guarantee a direct mapping for `effortLevel`; the configured value is currently best-effort.");
  }
  return notes;
}

function resolveOwnerSessionKey(context: DwemrRuntimeContext | undefined, fallbackSessionKey: string) {
  return normalizeOptionalString(context?.toolContext?.sessionKey) ?? fallbackSessionKey;
}

function collectAcpRuntimeOutput(events: Array<{ type: string; text?: string; stream?: string }>) {
  let output = "";
  for (const event of events) {
    if (event.type === "text_delta" && event.stream !== "thought" && event.text) {
      output += event.text;
    }
  }
  return output.trim();
}

function isAcpRuntimeReady(
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

type AcpFlowTracking = {
  flowId?: string;
  flowRevision?: number;
  taskId?: string;
  finish: (params: { failed: boolean; error?: string }) => Promise<void>;
};

function createAcpFlowTracking(params: {
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
    return {
      async finish() {
        return;
      },
    };
  }

  const bound = legacyTaskFlow.bindSession({
    sessionKey: params.ownerSessionKey,
    requesterOrigin: params.requesterOrigin,
  });
  if (!bound?.createManaged || !bound.runTask) {
    return {
      async finish() {
        return;
      },
    };
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

function createAcpNativeRuntimeBackend(context?: DwemrRuntimeContext): DwemrRuntimeBackend {
  const runtimeApi = asRuntimeApi(context?.api);

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

      const manager = getAcpSessionManager();
      const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
      const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
      const requestId = `dwemr-${randomUUID()}`;
      const sessionKey = buildCommandScopedAcpSessionKey(request.targetPath, agentId, requestId, request.runtimeConfig);
      const ownerSessionKey = resolveOwnerSessionKey(context, sessionKey);
      const timeoutSeconds = resolveRuntimeTimeoutSeconds(request.options);

      const events: Array<{ type: string; text?: string; stream?: string }> = [];
      let flowTracking: AcpFlowTracking | undefined;

      try {
        await manager.initializeSession({
          cfg,
          sessionKey,
          agent: agentId,
          mode: "oneshot",
          cwd: request.targetPath,
          ...(backendId ? { backendId } : {}),
        });
        await manager.updateSessionRuntimeOptions({
          cfg,
          sessionKey,
          patch: {
            model: request.runtimeConfig?.model?.trim() || undefined,
            cwd: request.targetPath,
            timeoutSeconds,
          },
        });
        flowTracking = createAcpFlowTracking({
          runtimeApi,
          ownerSessionKey,
          childSessionKey: sessionKey,
          requesterOrigin: context?.toolContext?.deliveryContext,
          action: request.options?.action ?? "unknown",
          claudeCommand: request.claudeCommand,
          requestId,
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
              identity: {
                backendKind: ACP_NATIVE_BACKEND_KIND,
                runId: requestId,
                flowId: flowTracking.flowId,
                taskId: flowTracking.taskId,
                childSessionKey: sessionKey,
                ownerSessionKey,
              },
            });
          } catch {
            // Best-effort registry; command execution should continue even if bookkeeping fails.
          }
        }

        await manager.runTurn({
          cfg,
          sessionKey,
          text: request.claudeCommand,
          mode: "prompt",
          requestId,
          onEvent(event) {
            events.push({
              type: event.type,
              text: "text" in event ? event.text : undefined,
              stream: event.type === "text_delta" ? event.stream : undefined,
            });
          },
        });

        if (flowTracking) {
          await flowTracking.finish({ failed: false });
        }
        return {
          exitCode: 0,
          stdout: collectAcpRuntimeOutput(events),
          stderr: "",
          timedOut: false,
        };
      } catch (error) {
        if (flowTracking) {
          await flowTracking.finish({ failed: true, error: String(error) });
        }
        const timedOut = isAcpRuntimeError(error) && /\btimed out\b/i.test(error.message);
        return {
          exitCode: timedOut ? 124 : 1,
          stdout: collectAcpRuntimeOutput(events),
          stderr: isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error),
          timedOut,
        };
      } finally {
        if (request.options?.stateDir) {
          try {
            await clearActiveRun(request.options.stateDir, request.targetPath, {
              runId: requestId,
              backendKind: ACP_NATIVE_BACKEND_KIND,
            });
          } catch {
            // Best-effort cleanup; command result should still be returned.
          }
        }
      }
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

      const manager = getAcpSessionManager();
      const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
      const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
      const sessionKey = `${buildAcpSessionScopeKey(request.targetPath, agentId, request.runtimeConfig)}-doctor`;
      const requestId = `dwemr-doctor-${randomUUID()}`;
      const events: Array<{ type: string; text?: string; stream?: string }> = [];

      try {
        await manager.initializeSession({
          cfg,
          sessionKey,
          agent: agentId,
          mode: "oneshot",
          cwd: request.targetPath,
          ...(backendId ? { backendId } : {}),
        });
        await manager.updateSessionRuntimeOptions({
          cfg,
          sessionKey,
          patch: {
            model: request.runtimeConfig?.model?.trim() || undefined,
            cwd: request.targetPath,
            timeoutSeconds: 60,
          },
        });
        await manager.runTurn({
          cfg,
          sessionKey,
          text: ACP_NATIVE_DOCTOR_PROMPT_TEXT,
          mode: "prompt",
          requestId,
          onEvent(event) {
            events.push({
              type: event.type,
              text: "text" in event ? event.text : undefined,
              stream: event.type === "text_delta" ? event.stream : undefined,
            });
          },
        });

        const output = collectAcpRuntimeOutput(events);
        if (output.trim() !== ACP_NATIVE_DOCTOR_PROMPT_EXPECTED) {
          return {
            status: "failed",
            detail: output || "ACP runtime returned an unexpected health-check response.",
          };
        }

        return {
          status: "ok",
          detail: `ACP runtime is reachable, session \`${sessionKey}\` is healthy, and a probe prompt returned \`DWEMR_READY\`.`,
          result: {
            exitCode: 0,
            stdout: output,
            stderr: "",
            timedOut: false,
          },
        };
      } catch (error) {
        return {
          status: "failed",
          detail: isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error),
        };
      }
    },
    findActiveRun(stateDir, projectPath) {
      return findStoredActiveRun(stateDir, projectPath, { backendKind: ACP_NATIVE_BACKEND_KIND });
    },
    async stopActiveRun(stateDir, projectPath) {
      const run = await findStoredActiveRun(stateDir, projectPath, { backendKind: ACP_NATIVE_BACKEND_KIND });
      if (!run) {
        return { status: "not_found", projectPath };
      }

      const runtimeApiForStop = asRuntimeApi(context?.api);
      const cfg = resolveOpenClawConfig(runtimeApiForStop);
      const sessionKey = run.identity.childSessionKey ?? run.sessionName;
      const flowId = run.identity.flowId;
      const ownerSessionKey = run.identity.ownerSessionKey ?? sessionKey;

      let flowCancelError: string | undefined;
      if (cfg && flowId && ownerSessionKey) {
        const legacyTaskFlow = resolveLegacyTaskFlow(runtimeApiForStop);
        const boundTaskFlow = legacyTaskFlow?.bindSession({
          sessionKey: ownerSessionKey,
          requesterOrigin: context?.toolContext?.deliveryContext,
        });
        if (boundTaskFlow?.cancel) {
          try {
            await boundTaskFlow.cancel({
              flowId,
              cfg,
            });
            await clearActiveRun(stateDir, projectPath, {
              runId: run.identity.runId,
              backendKind: ACP_NATIVE_BACKEND_KIND,
            });
            return {
              status: "stopped",
              run,
              mechanism: {
                kind: "runtime_cancel",
                detail: "taskFlow.cancel",
              },
            };
          } catch (error) {
            flowCancelError = isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
          }
        }
      }

      if (!cfg || !sessionKey) {
        await clearActiveRun(stateDir, projectPath, {
          runId: run.identity.runId,
          backendKind: ACP_NATIVE_BACKEND_KIND,
        });
        return {
          status: "failed",
          run,
          error: [
            "ACP-native run is missing session context and cannot be cancelled cleanly.",
            flowCancelError ? `Flow cancellation error: ${flowCancelError}` : undefined,
          ].filter(Boolean).join(" "),
        };
      }

      try {
        await getAcpSessionManager().cancelSession({
          cfg,
          sessionKey,
          reason: "dwemr-stop",
        });
        await clearActiveRun(stateDir, projectPath, {
          runId: run.identity.runId,
          backendKind: ACP_NATIVE_BACKEND_KIND,
        });
        return {
          status: "stopped",
          run,
          mechanism: {
            kind: "runtime_cancel",
            detail: flowCancelError ? `acp.cancelSession (after taskFlow.cancel failed)` : "acp.cancelSession",
          },
        };
      } catch (error) {
        const sessionCancelError = isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
        return {
          status: "failed",
          run,
          error: [
            flowCancelError ? `Flow cancellation error: ${flowCancelError}` : undefined,
            `Session cancellation error: ${sessionCancelError}`,
          ].filter(Boolean).join(" "),
        };
      }
    },
  };
}

runtimeBackendRegistry.set("spawn", createSpawnRuntimeBackend);
runtimeBackendRegistry.set(ACP_NATIVE_BACKEND_KIND, createAcpNativeRuntimeBackend);

let runtimeBackendOverride: string | undefined;

export function registerRuntimeBackend(kind: string, factory: RuntimeBackendFactory) {
  runtimeBackendRegistry.set(kind, factory);
}

export function setRuntimeBackendOverride(kind: string | undefined) {
  runtimeBackendOverride = kind?.trim() || undefined;
}

function shouldAutoUseAcpNative(context?: DwemrRuntimeContext, runtimeConfig: DwemrRuntimeConfig = {}) {
  const runtimeApi = asRuntimeApi(context?.api);
  if (!runtimeApi) {
    return false;
  }
  return isAcpRuntimeReady(runtimeApi, runtimeConfig).ready;
}

export function getDefaultRuntimeBackend(options: { preferredKind?: string; runtimeContext?: DwemrRuntimeContext; runtimeConfig?: DwemrRuntimeConfig } = {}) {
  const selectedKind = runtimeBackendOverride
    ?? normalizeOptionalString(options.preferredKind)
    ?? (shouldAutoUseAcpNative(options.runtimeContext, options.runtimeConfig) ? ACP_NATIVE_BACKEND_KIND : "spawn");
  const factory = runtimeBackendRegistry.get(selectedKind) ?? runtimeBackendRegistry.get("spawn");
  if (!factory) {
    throw new Error("DWEMR runtime backend registry is empty.");
  }
  return factory(options.runtimeContext);
}
