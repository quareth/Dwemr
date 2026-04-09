import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  clearActiveRun,
  findActiveRun as findStoredActiveRun,
  isProcessRunning,
  killProcessWithEscalation,
  loadActiveRuns,
  registerActiveRun,
  resolveCwdForPid,
  snapshotChildPids,
  stopActiveRun as stopStoredSpawnRun,
  updateActiveRunPid,
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
import { getAcpRuntimeBackend, getAcpSessionManager, isAcpRuntimeError, readAcpSessionEntry } from "openclaw/plugin-sdk/acp-runtime";

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

export type DwemrSessionInfo = {
  sessionKey: string;
  state: "idle" | "running" | "error" | "none" | "stale";
  mode?: "persistent" | "oneshot";
  agent?: string;
  backend?: string;
  cwd?: string;
  pid?: number;
  lastActivityAt?: number;
  lastError?: string;
  source: "active-run" | "onboarding-state";
  projectPath?: string;
  action?: string;
};

export type DwemrRuntimeBackend = {
  kind: string;
  inspectRuntime: (config: DwemrRuntimeConfig) => Promise<DwemrRuntimeState>;
  ensureRuntime: (config: DwemrRuntimeConfig) => Promise<DwemrRuntimeState>;
  runClaudeCommand: (request: DwemrRunCommandRequest) => Promise<ProcessResult>;
  probeClaudeRuntime: (request: DwemrRuntimeProbeRequest) => Promise<ClaudeRuntimeProbe>;
  findActiveRun: (stateDir: string, projectPath: string) => Promise<DwemrActiveRun | undefined>;
  stopActiveRun: (stateDir: string, projectPath: string) => Promise<DwemrStopResult>;
  closeStatefulSession?: (sessionKey: string) => Promise<void>;
  listSessions?: (stateDir: string) => Promise<{ sessions: DwemrSessionInfo[]; aggregate: { activeSessions: number; evictedTotal: number } }>;
  clearSessions?: (stateDir: string) => Promise<{ closed: number; failed: number }>;
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

export function buildOnboardingPersistentSessionKey(
  targetPath: string,
  runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig,
) {
  return buildAcpSessionScopeKey(targetPath, resolveAcpAgentId(undefined, runtimeConfig), runtimeConfig) + ":onboarding";
}

async function discoverAcpAgentPid(beforePids: number[], targetPath: string): Promise<number | undefined> {
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

export function buildAcpRuntimeOptionPatch(
  targetPath: string,
  runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined,
  timeoutSeconds: number | undefined,
) {
  return {
    model: runtimeConfig?.model?.trim() || undefined,
    cwd: targetPath,
    timeoutSeconds,
  };
}

function resolveOwnerSessionKey(context: DwemrRuntimeContext | undefined, fallbackSessionKey: string) {
  return normalizeOptionalString(context?.toolContext?.sessionKey) ?? fallbackSessionKey;
}

function collectAcpRuntimeOutput(events: Array<{ type: string; text?: string; stream?: string }>) {
  let lastToolCallIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "tool_call") {
      lastToolCallIndex = i;
      break;
    }
  }
  let output = "";
  for (let i = lastToolCallIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.type === "text_delta" && event.stream !== "thought" && event.text) {
      output += event.text;
    }
  }
  return output.trim();
}

function formatAcpLifecycleError(error: unknown) {
  return isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
}

function closeAcpSession(
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

async function closeAcpCommandSession(params: {
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
    await closeAcpSession(params.manager, params.cfg, params.sessionKey, "dwemr-command-cleanup", { clearMeta: true });
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

async function reconcileTrackedAcpRun(params: {
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

  await clearAcpActiveRun(params.stateDir, params.projectPath, params.run.identity.runId);
  return undefined;
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

const NOOP_FLOW_TRACKING: AcpFlowTracking = { async finish() {} };

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

function createAcpEventCollector() {
  const events: Array<{ type: string; text?: string; stream?: string }> = [];
  function collect(event: { type: string; [k: string]: unknown }) {
    events.push({
      type: event.type,
      text: "text" in event ? (event.text as string) : undefined,
      stream: event.type === "text_delta" ? (event.stream as string) : undefined,
    });
  }
  return { events, collect };
}

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
  return resolveRunPid(run);
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

function createAcpNativeRuntimeBackend(context?: DwemrRuntimeContext): DwemrRuntimeBackend {
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
      let discoveredPid: number | undefined;
      let result: ProcessResult = {
        exitCode: 1,
        stdout: "",
        stderr: "",
        timedOut: false,
      };

      try {
        const beforePids = await snapshotChildPids("claude");
        await initAcpOneshotSession({
          manager, cfg, sessionKey, agentId, backendId,
          targetPath: request.targetPath,
          runtimeConfig: request.runtimeConfig,
          timeoutSeconds,
        });
        discoveredPid = await discoverAcpAgentPid(beforePids, request.targetPath);
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
              pid: discoveredPid,
              identity: {
                backendKind: ACP_NATIVE_BACKEND_KIND,
                runId: requestId,
                flowId: flowTracking.flowId,
                taskId: flowTracking.taskId,
                childSessionKey: sessionKey,
                ownerSessionKey,
                pid: discoveredPid,
              },
            });
          } catch {
            // Best-effort registry; command execution should continue even if bookkeeping fails.
          }
        }

        const turnDiag: Array<{ type: string; detail?: string; at: number }> = [];
        const turnStartedAt = Date.now();

        await manager.runTurn({
          cfg,
          sessionKey,
          text: request.claudeCommand,
          mode: "prompt",
          requestId,
          onEvent(event) {
            collector.collect(event);

            if (event.type === "done") {
              turnDiag.push({
                type: "done",
                detail: "stopReason" in event ? String((event as { stopReason?: string }).stopReason ?? "none") : "no-field",
                at: Date.now() - turnStartedAt,
              });
            } else if (event.type === "error") {
              turnDiag.push({
                type: "error",
                detail: "message" in event ? String((event as { message?: string }).message ?? "") : "unknown",
                at: Date.now() - turnStartedAt,
              });
            } else if (event.type === "tool_call") {
              turnDiag.push({
                type: "tool_call",
                detail: "title" in event ? String((event as { title?: string }).title ?? "") : undefined,
                at: Date.now() - turnStartedAt,
              });
            }
          },
        });

        const turnDurationMs = Date.now() - turnStartedAt;
        const textDeltaCount = collector.events.filter((e) => e.type === "text_delta" && e.stream !== "thought").length;
        const toolCallCount = collector.events.filter((e) => e.type === "tool_call").length;
        const diagSummary = [
          `[DWEMR-DIAG] runTurn completed in ${Math.round(turnDurationMs / 1000)}s`,
          `events: ${collector.events.length} total, ${textDeltaCount} text_delta, ${toolCallCount} tool_call`,
          `done-events: ${JSON.stringify(turnDiag.filter((d) => d.type === "done"))}`,
          turnDiag.some((d) => d.type === "error") ? `errors: ${JSON.stringify(turnDiag.filter((d) => d.type === "error"))}` : undefined,
        ].filter(Boolean).join(" | ");

        if (flowTracking) {
          await flowTracking.finish({ failed: false });
        }
        const stdout = collectAcpRuntimeOutput(collector.events);
        result = {
          exitCode: 0,
          stdout,
          stderr: "",
          timedOut: false,
        };
        if (!stdout) {
          result.stderr = diagSummary;
        }
      } catch (error) {
        if (flowTracking) {
          await flowTracking.finish({ failed: true, error: String(error) });
        }
        const timedOut = isAcpRuntimeError(error) && /\btimed out\b/i.test(error.message);
        result = {
          exitCode: timedOut ? 124 : 1,
          stdout: collectAcpRuntimeOutput(collector.events),
          stderr: formatAcpLifecycleError(error),
          timedOut,
        };
      } finally {
        const cleanup = await closeAcpCommandSession({
          cfg,
          manager,
          sessionKey,
        });
        if (!cleanup.terminal && cleanup.error) {
          result.stderr = result.stderr ? `${result.stderr}\n${cleanup.error}` : cleanup.error;
        }
        if (request.options?.stateDir) {
          if (cleanup.terminal) {
            try {
              await clearAcpActiveRun(request.options.stateDir, request.targetPath, requestId);
            } catch {
              // Best-effort cleanup; command result should still be returned.
            }
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
          detail: formatAcpLifecycleError(error),
        };
      }
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

      let flowCancelError: string | undefined;
      if (cfg && flowId && ownerSessionKey) {
        const legacyTaskFlow = resolveLegacyTaskFlow(runtimeApi);
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
            await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
            return {
              status: "stopped",
              run,
              mechanism: {
                kind: "runtime_cancel",
                detail: "taskFlow.cancel",
              },
            };
          } catch (error) {
            flowCancelError = formatAcpLifecycleError(error);
          }
        }
      }

      if (!cfg || !sessionKey) {
        await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
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
        await manager.cancelSession({
          cfg,
          sessionKey,
          reason: "dwemr-stop",
        });
        try {
          await closeAcpSession(manager, cfg, sessionKey, "dwemr-stop-cleanup");
        } catch {
          // Best-effort cleanup of persistent session state.
        }
        await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
        return {
          status: "stopped",
          run,
          mechanism: {
            kind: "runtime_cancel",
            detail: flowCancelError ? `acp.cancelSession (after taskFlow.cancel failed)` : "acp.cancelSession",
          },
        };
      } catch (error) {
        const sessionCancelError = formatAcpLifecycleError(error);

        // OS-level fallback: if ACP cancel failed, try to kill the process directly.
        const pid = resolveRunPid(run);
        if (pid && isProcessRunning(pid)) {
          const killResult = await killProcessWithEscalation(pid);
          if (killResult.status === "killed" || killResult.status === "already_exited") {
            await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
            return {
              status: "stopped",
              run,
              mechanism: {
                kind: "signal",
                detail: `OS-level ${killResult.status === "killed" ? killResult.signal : "process already exited"} (after ACP cancel failed)`,
              },
            };
          }
        }

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

    async closeStatefulSession(sessionKey) {
      const cfg = resolveOpenClawConfig(runtimeApi);
      if (!cfg) {
        return;
      }
      try {
        await closeAcpSession(manager, cfg, sessionKey, "dwemr-onboarding-complete");
      } catch {
        // Best-effort cleanup of persistent session state.
      }
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
            await manager.cancelSession({ cfg, sessionKey: key, reason: "dwemr-sessions-clear" });
            sessionClosed = true;
          } catch {
            // cancelSession failed, try closeSession as fallback.
          }
          try {
            await closeAcpSession(manager, cfg, key, "dwemr-sessions-clear", { clearMeta: true });
            sessionClosed = true;
          } catch {
            // closeSession also failed.
          }
        }

        if (!sessionClosed) {
          // OS-level fallback: try to kill the process directly.
          const pid = resolveRunPid(run);
          if (pid && isProcessRunning(pid)) {
            const killResult = await killProcessWithEscalation(pid);
            if (killResult.status === "killed" || killResult.status === "already_exited") {
              sessionClosed = true;
            }
          }
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
