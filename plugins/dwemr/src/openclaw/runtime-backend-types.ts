import type { DwemrActiveRun } from "./active-runs";
import type { ClaudeCommandRunOptions, ClaudeRuntimeProbe, DwemrClaudeModelConfig, ProcessResult } from "./claude-runner";
import type { DwemrRuntimeConfig, DwemrRuntimeInspection } from "./runtime";
import type { ProjectHealth } from "../control-plane/project-assets";

export type FlowRevision = { flowId: string; revision: number };

export type BoundFlowViews = {
  get: (flowId: string) => unknown;
  list: () => unknown[];
  findLatest: () => unknown | undefined;
  resolve: (token: string) => unknown | undefined;
  getTaskSummary: (flowId: string) => unknown;
};

export type CreateManagedFlowParams = {
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
};

export type RunTaskParams = {
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
};

export type RunTaskResult = {
  created: boolean;
  flow?: FlowRevision;
  task?: { taskId: string };
  reason?: string;
  found?: boolean;
};

export type FinishFlowParams = {
  flowId: string;
  expectedRevision: number;
  stateJson?: unknown;
  updatedAt?: number;
  endedAt?: number;
};

export type FailFlowParams = {
  flowId: string;
  expectedRevision: number;
  stateJson?: unknown;
  blockedTaskId?: string | null;
  blockedSummary?: string | null;
  updatedAt?: number;
  endedAt?: number;
};

export type RequestCancelParams = {
  flowId: string;
  expectedRevision: number;
  cancelRequestedAt?: number;
};

export type BoundTaskFlow = {
  createManaged?: (params: CreateManagedFlowParams) => FlowRevision | undefined;
  get?: (flowId: string) => FlowRevision | undefined;
  runTask?: (params: RunTaskParams) => RunTaskResult;
  finish?: (params: FinishFlowParams) => unknown;
  fail?: (params: FailFlowParams) => unknown;
  requestCancel?: (params: RequestCancelParams) => unknown;
  cancel?: (params: { flowId: string; cfg: Record<string, unknown> }) => Promise<unknown>;
};

export type RuntimeTasksFlowsApi = {
  bindSession: (params: { sessionKey: string; requesterOrigin?: unknown }) => BoundFlowViews;
};

export type RuntimeTaskFlowApi = {
  bindSession: (params: { sessionKey: string; requesterOrigin?: unknown }) => BoundTaskFlow;
};

export type RuntimeApiLike = {
  config?: any;
  runtime?: {
    tasks?: { flows?: RuntimeTasksFlowsApi };
    taskFlow?: RuntimeTaskFlowApi;
  };
};

export type AcpRuntimeSummary = {
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
  listSessions?: (stateDir: string) => Promise<{ sessions: DwemrSessionInfo[]; aggregate: { activeSessions: number; evictedTotal: number } }>;
  clearSessions?: (stateDir: string) => Promise<{ closed: number; failed: number }>;
};

export type RuntimeBackendFactory = (context?: DwemrRuntimeContext) => DwemrRuntimeBackend;
