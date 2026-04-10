import type { DwemrRuntimeBackend, DwemrRuntimeState, DwemrStopResult } from "./runtime-backend-types";
import type { DwemrRuntimeConfig, DwemrRuntimeInspection } from "./runtime";
import { ensureManagedDwemrRuntime, inspectDwemrRuntime } from "./runtime";
import {
  findActiveRun as findStoredActiveRun,
  stopActiveRun as stopStoredSpawnRun,
} from "./active-runs";
import {
  probeClaudeRuntime as probeSpawnClaudeRuntime,
  runClaudeCommand as runSpawnClaudeCommand,
} from "./claude-runner";

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

export function createSpawnRuntimeBackend(): DwemrRuntimeBackend {
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
