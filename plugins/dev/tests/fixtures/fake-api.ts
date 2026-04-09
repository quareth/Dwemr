import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HandlerContext } from "../../../dwemr/src/openclaw/action-handler-types";

export type FakeApiContext = HandlerContext & { cleanup: () => Promise<void> };

export async function makeFakeApiContext(overrides?: Partial<HandlerContext>): Promise<FakeApiContext> {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "dwemr-handler-test-"));
  const fakeApi = {
    pluginConfig: overrides?.pluginConfig ?? {},
    runtime: {
      state: {
        resolveStateDir: () => stateRoot,
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
    async cleanup() {
      await rm(stateRoot, { recursive: true, force: true });
    },
  };
}
