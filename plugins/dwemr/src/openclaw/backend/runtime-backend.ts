import type { DwemrRuntimeConfig } from "./runtime-types";
import type { DwemrRuntimeContext, RuntimeBackendFactory } from "./runtime-backend-types";
import { ACP_NATIVE_BACKEND_KIND, normalizeOptionalString } from "./acp-native/acp-config";
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

runtimeBackendRegistry.set(ACP_NATIVE_BACKEND_KIND, createAcpNativeRuntimeBackend);

let runtimeBackendOverride: string | undefined;

export function registerRuntimeBackend(kind: string, factory: RuntimeBackendFactory) {
  runtimeBackendRegistry.set(kind, factory);
}

export function setRuntimeBackendOverride(kind: string | undefined) {
  runtimeBackendOverride = kind?.trim() || undefined;
}

export function getDefaultRuntimeBackend(options: { preferredKind?: string; runtimeContext?: DwemrRuntimeContext; runtimeConfig?: DwemrRuntimeConfig } = {}) {
  // `runtimeConfig` is kept on the signature for backwards-compatible call sites
  // but no longer participates in backend selection: ACP-native is the only
  // registered runtime kind. The per-backend factory still receives the runtime
  // context (and reads its own config from there).
  void options.runtimeConfig;
  const selectedKind = runtimeBackendOverride
    ?? normalizeOptionalString(options.preferredKind)
    ?? ACP_NATIVE_BACKEND_KIND;
  const factory = runtimeBackendRegistry.get(selectedKind);
  if (!factory) {
    throw new Error(`DWEMR runtime backend "${selectedKind}" is not registered.`);
  }
  return factory(options.runtimeContext);
}
