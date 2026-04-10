import type { DwemrExecutionMode } from "../../control-plane/project-config";

export type DwemrRuntimeConfig = {
  acpAgent?: string;
  acpBackend?: string;
};

export type DwemrProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type DwemrClaudeRuntimeProbe =
  | { status: "skipped"; detail: string }
  | { status: "ok"; detail: string; result: DwemrProcessResult }
  | { status: "failed"; detail: string; result?: DwemrProcessResult };

export type DwemrClaudeModelConfig = {
  model?: string;
  subagentModel?: string;
  effortLevel?: string;
};

export type ClaudeCommandRunOptions = {
  timeoutMs?: number | null;
  stateDir?: string;
  action?: string;
  executionMode?: DwemrExecutionMode;
};
