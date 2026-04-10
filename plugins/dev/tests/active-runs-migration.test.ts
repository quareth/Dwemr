import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  findActiveRun,
  loadActiveRuns,
  resolveActiveRunsPath,
} from "../../dwemr/src/openclaw/state/active-runs";

async function withTempStateDir(action: (stateDir: string) => Promise<void>) {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "dwemr-active-runs-migration-"));
  try {
    await action(stateDir);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

async function writeRawActiveRuns(stateDir: string, payload: unknown) {
  const target = resolveActiveRunsPath(stateDir);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("loadActiveRuns silently drops legacy spawn-shape rows that no longer parse", async () => {
  await withTempStateDir(async (stateDir) => {
    // Pre-identity legacy shape: top-level pid + sessionName + claudeCommand,
    // no `identity` block. The retired spawn-backend used to write this; the
    // current normalizer no longer reconstructs it.
    await writeRawActiveRuns(stateDir, {
      runs: [
        {
          projectPath: "/tmp/dwemr-legacy-shape",
          startedAt: "2025-01-01T00:00:00.000Z",
          action: "start",
          pid: 99999,
          sessionName: "dwemr",
          claudeCommand: "/delivery-driver onboarding",
        },
      ],
    });

    const runs = await loadActiveRuns(stateDir, { pruneStale: false });
    assert.deepEqual(runs, [], "expected legacy pre-identity rows to be dropped");
  });
});

test("loadActiveRuns parses identity-shaped spawn rows but they are unreachable from acp-native lookup", async () => {
  await withTempStateDir(async (stateDir) => {
    // Identity-shaped spawn row: identity block carries an opaque
    // `backendKind: "spawn"` value. `normalizeRunIdentity` accepts any
    // non-empty string, so this row still parses, but no live backend looks
    // for it. Asserts that ACP-native lookups skip it.
    await writeRawActiveRuns(stateDir, {
      runs: [
        {
          projectPath: "/tmp/dwemr-spawn-identity",
          startedAt: "2025-01-01T00:00:00.000Z",
          action: "continue",
          identity: {
            backendKind: "spawn",
            runId: "spawn:legacy",
          },
        },
      ],
    });

    const acpNativeMatch = await findActiveRun(stateDir, "/tmp/dwemr-spawn-identity", {
      backendKind: "acp-native",
    });
    assert.equal(acpNativeMatch, undefined, "ACP-native lookup must not surface legacy spawn rows");
  });
});
