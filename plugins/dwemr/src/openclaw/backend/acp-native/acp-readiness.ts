import type { DwemrRuntimeConfig } from "../runtime";
import type { DwemrClaudeModelConfig } from "../claude-runner";
import type { DwemrRuntimeState, RuntimeApiLike } from "../runtime-backend-types";
import {
  ACP_NATIVE_BACKEND_KIND,
  buildAcpRuntimeSummary,
  collectAcpRuntimeOptionCaveatNotes,
  resolveAcpBackendId,
  resolveAcpConfig,
  resolveOpenClawConfig,
} from "./acp-config";
import { getAcpRuntimeBackend } from "openclaw/plugin-sdk/acp-runtime";

export function isAcpRuntimeReady(
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
