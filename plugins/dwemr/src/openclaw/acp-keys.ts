import { createHash } from "node:crypto";
import type { DwemrRuntimeConfig } from "./runtime";
import type { DwemrClaudeModelConfig } from "./claude-runner";
import { normalizeAcpAgentId } from "./acp-config";

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
