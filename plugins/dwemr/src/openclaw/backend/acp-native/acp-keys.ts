import { createHash } from "node:crypto";
import type { DwemrClaudeModelConfig, DwemrRuntimeConfig } from "../runtime-types";
import { normalizeAcpAgentId } from "./acp-config";

export type AcpSessionKeyScope =
  | { kind: "scope" }
  | { kind: "command"; requestId: string }
  | { kind: "doctor" };

export function buildAcpSessionKey(params: {
  targetPath: string;
  agentId: string;
  runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig;
  scope: AcpSessionKeyScope;
}): string {
  const baseKey = buildBaseScopeKey(params.targetPath, params.agentId, params.runtimeConfig);
  switch (params.scope.kind) {
    case "scope":
      return baseKey;
    case "command": {
      const runSuffix = createHash("sha256")
        .update(`${params.scope.requestId}:${params.targetPath}`)
        .digest("hex")
        .slice(0, 8);
      return `${baseKey}:run-${runSuffix}`;
    }
    case "doctor":
      return `${baseKey}-doctor`;
  }
}

function buildBaseScopeKey(
  targetPath: string,
  agentId: string,
  runtimeConfig?: DwemrRuntimeConfig & DwemrClaudeModelConfig,
): string {
  const suffixSource = [
    targetPath,
    runtimeConfig?.model?.trim(),
    runtimeConfig?.subagentModel?.trim(),
    runtimeConfig?.effortLevel?.trim(),
  ].filter(Boolean).join("|");

  const hash = createHash("sha256").update(suffixSource || targetPath).digest("hex").slice(0, 12);
  return `agent:${normalizeAcpAgentId(agentId)}:acp:dwemr-${hash}`;
}
