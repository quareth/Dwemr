import type { AcpRuntimeSummary, DwemrRuntimeContext, RuntimeApiLike } from "../runtime-backend-types";
import type { DwemrClaudeModelConfig, DwemrRuntimeConfig } from "../runtime-types";

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

export function resolveOpenClawConfig(
  runtimeApi: RuntimeApiLike | undefined,
): Record<string, unknown> | undefined {
  const candidate = runtimeApi?.config;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  return candidate as Record<string, unknown>;
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

export function collectAcpRuntimeOptionCaveatNotes(runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined) {
  const notes: string[] = [];
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
) {
  return {
    model: runtimeConfig?.model?.trim() || undefined,
    cwd: targetPath,
  };
}

export function resolveOwnerSessionKey(context: DwemrRuntimeContext | undefined, fallbackSessionKey: string) {
  return normalizeOptionalString(context?.toolContext?.sessionKey) ?? fallbackSessionKey;
}
