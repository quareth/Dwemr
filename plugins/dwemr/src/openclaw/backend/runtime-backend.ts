import type { DwemrRuntimeConfig } from "./runtime";
import type { DwemrRuntimeContext, RuntimeBackendFactory } from "./runtime-backend-types";
import { ACP_NATIVE_BACKEND_KIND, asRuntimeApi, normalizeOptionalString } from "./acp-native/acp-config";
import { isAcpRuntimeReady } from "./acp-native/acp-readiness";
import { createSpawnRuntimeBackend } from "./spawn-backend";
import { createAcpNativeRuntimeBackend } from "./acp-native/acp-native-backend";

export type {
  DwemrRuntimeToolContext,
  DwemrRuntimeContext,
  DwemrRuntimeState,
  DwemrRunCommandRequest,
  DwemrRuntimeProbeRequest,
  DwemrStopResult,
  DwemrSessionInfo,
  DwemrRuntimeBackend,
} from "./runtime-backend-types";
export { buildAcpRuntimeOptionPatch } from "./acp-native/acp-config";

const runtimeBackendRegistry = new Map<string, RuntimeBackendFactory>();

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
