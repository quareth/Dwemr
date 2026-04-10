import { createHash } from "node:crypto";
import type { AcpRuntimeSummary, DwemrRuntimeContext, RuntimeApiLike } from "./runtime-backend-types";
import type { DwemrRuntimeConfig } from "./runtime";
import type { ClaudeCommandRunOptions, DwemrClaudeModelConfig } from "./claude-runner";
import { getAcpRuntimeBackend, isAcpRuntimeError } from "openclaw/plugin-sdk/acp-runtime";

export const ACP_NATIVE_BACKEND_KIND = "acp-native";
export const ACP_DEFAULT_AGENT = "claude";

export function asRuntimeApi(api: unknown): RuntimeApiLike | undefined {
  if (!api || typeof api !== "object") {
    return;
  }
  const candidate = api as RuntimeApiLike;
  if (!candidate.runtime || typeof candidate.runtime !== "object") {
    return;
  }
  return candidate;
}

export function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeAcpAgentId(agent: string | undefined) {
  const candidate = (agent ?? ACP_DEFAULT_AGENT).trim().toLowerCase();
  const normalized = candidate.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return normalized || ACP_DEFAULT_AGENT;
}

export function resolveOpenClawConfig(runtimeApi: RuntimeApiLike | undefined) {
  return runtimeApi?.config && typeof runtimeApi.config === "object" ? runtimeApi.config : undefined;
}

export function resolveAcpConfig(runtimeApi: RuntimeApiLike | undefined) {
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

export function resolveAcpBackendId(runtimeApi: RuntimeApiLike | undefined, runtimeConfig?: DwemrRuntimeConfig) {
  return normalizeOptionalString((runtimeConfig as { acpBackend?: string } | undefined)?.acpBackend)
    ?? normalizeOptionalString(resolveAcpConfig(runtimeApi)?.backend);
}

export function resolveAcpAgentId(runtimeApi: RuntimeApiLike | undefined, runtimeConfig?: DwemrRuntimeConfig) {
  return normalizeAcpAgentId(
    normalizeOptionalString((runtimeConfig as { acpAgent?: string } | undefined)?.acpAgent)
      ?? ACP_DEFAULT_AGENT,
  );
}

export function resolveRuntimeTasksFlows(runtimeApi: RuntimeApiLike | undefined) {
  return runtimeApi?.runtime?.tasks?.flows;
}

export function resolveLegacyTaskFlow(runtimeApi: RuntimeApiLike | undefined) {
  return runtimeApi?.runtime?.taskFlow;
}

export function buildAcpRuntimeSummary(runtimeApi: RuntimeApiLike | undefined, runtimeConfig?: DwemrRuntimeConfig): AcpRuntimeSummary {
  return {
    backendId: resolveAcpBackendId(runtimeApi, runtimeConfig),
    defaultAgent: resolveAcpAgentId(runtimeApi, runtimeConfig),
    flowViewsAvailable: Boolean(resolveRuntimeTasksFlows(runtimeApi)),
    taskFlowLegacyAvailable: Boolean(resolveLegacyTaskFlow(runtimeApi)),
  };
}

export function buildAcpSessionScopeKey(targetPath: string, agentId: string, runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig) {
  const suffixSource = [
    targetPath,
    runtimeConfig?.model?.trim(),
    runtimeConfig?.subagentModel?.trim(),
    runtimeConfig?.effortLevel?.trim(),
  ].filter(Boolean).join("|");

  const hash = createHash("sha256").update(suffixSource || targetPath).digest("hex").slice(0, 12);
  return `agent:${normalizeAcpAgentId(agentId)}:acp:dwemr-${hash}`;
}

export function buildCommandScopedAcpSessionKey(
  targetPath: string,
  agentId: string,
  requestId: string,
  runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig,
) {
  const scopeKey = buildAcpSessionScopeKey(targetPath, agentId, runtimeConfig);
  const runSuffix = createHash("sha256").update(`${requestId}:${targetPath}`).digest("hex").slice(0, 8);
  return `${scopeKey}:run-${runSuffix}`;
}

export function resolveRuntimeTimeoutSeconds(options: ClaudeCommandRunOptions | undefined) {
  if (options?.timeoutMs === null) {
    return undefined;
  }
  if (typeof options?.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    return Math.max(1, Math.round(options.timeoutMs / 1000));
  }
  return undefined;
}

export function collectAcpRuntimeOptionCaveatNotes(runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined) {
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
  void timeoutSeconds;
  return {
    model: runtimeConfig?.model?.trim() || undefined,
    cwd: targetPath,
  };
}

export function resolveOwnerSessionKey(context: DwemrRuntimeContext | undefined, fallbackSessionKey: string) {
  return normalizeOptionalString(context?.toolContext?.sessionKey) ?? fallbackSessionKey;
}

export function collectAcpRuntimeOutput(events: Array<{ type: string; text?: string; stream?: string }>) {
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

export function formatAcpLifecycleError(error: unknown) {
  return isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
}
