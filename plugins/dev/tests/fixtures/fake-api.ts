import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HandlerContext } from "../../../dwemr/src/openclaw/cli/action-handler-types";

export type FakeApiContext = HandlerContext & {
  cleanup: () => Promise<void>;
  readConfig: () => Record<string, unknown>;
};

export async function makeFakeApiContext(overrides?: Partial<HandlerContext>): Promise<FakeApiContext> {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "dwemr-handler-test-"));
  let runtimeConfig = structuredClone(
    (overrides?.api as { runtime?: { config?: { current?: Record<string, unknown> } } } | undefined)?.runtime?.config?.current
      ?? {},
  ) as Record<string, unknown>;
  const fakeApi = {
    pluginConfig: overrides?.pluginConfig ?? {},
    runtime: {
      state: {
        resolveStateDir: () => stateRoot,
      },
      config: {
        async loadConfig() {
          return structuredClone(runtimeConfig);
        },
        async writeConfigFile(nextConfig: Record<string, unknown>) {
          runtimeConfig = structuredClone(nextConfig);
        },
      },
    },
  };
  return {
    pluginConfig: overrides?.pluginConfig ?? {},
    stateDir: stateRoot,
    defaultProjectPath: overrides?.defaultProjectPath ?? undefined,
    api: fakeApi,
    runtimeContext: overrides?.runtimeContext,
    runtimeBackend: overrides?.runtimeBackend,
    readConfig() {
      return structuredClone(runtimeConfig);
    },
    async cleanup() {
      await rm(stateRoot, { recursive: true, force: true });
    },
  };
}
