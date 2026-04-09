import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DwemrExecutionMode } from "../control-plane/project-config";

const ACTIVE_RUNS_RELATIVE_PATH = path.join("tools", "dwemr", "active-runs.json");
const STOP_GRACE_PERIOD_MS = 3_000;
const STOP_POLL_INTERVAL_MS = 200;

export type DwemrActiveRun = {
  projectPath: string;
  pid: number;
  startedAt: string;
  action: string;
  claudeCommand: string;
  sessionName: string;
  executionMode?: DwemrExecutionMode;
};

export type StopActiveRunResult =
  | { status: "not_found"; projectPath: string }
  | { status: "already_exited"; run: DwemrActiveRun }
  | { status: "stopped"; run: DwemrActiveRun; signal: "SIGTERM" | "SIGKILL" }
  | { status: "failed"; run: DwemrActiveRun; error: string };

function resolveProjectPath(projectPath: string) {
  return path.resolve(projectPath);
}

function normalizeActiveRun(raw: Partial<DwemrActiveRun>): DwemrActiveRun | undefined {
  if (typeof raw.projectPath !== "string" || raw.projectPath.trim().length === 0) {
    return;
  }
  if (typeof raw.pid !== "number" || !Number.isInteger(raw.pid) || raw.pid <= 0) {
    return;
  }
  if (typeof raw.startedAt !== "string" || raw.startedAt.trim().length === 0) {
    return;
  }
  if (typeof raw.action !== "string" || raw.action.trim().length === 0) {
    return;
  }
  if (typeof raw.claudeCommand !== "string" || raw.claudeCommand.trim().length === 0) {
    return;
  }
  if (typeof raw.sessionName !== "string" || raw.sessionName.trim().length === 0) {
    return;
  }

  return {
    projectPath: resolveProjectPath(raw.projectPath),
    pid: raw.pid,
    startedAt: raw.startedAt,
    action: raw.action.trim(),
    claudeCommand: raw.claudeCommand.trim(),
    sessionName: raw.sessionName.trim(),
    executionMode: raw.executionMode === "autonomous" || raw.executionMode === "checkpointed" ? raw.executionMode : undefined,
  } satisfies DwemrActiveRun;
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException;
    return execError.code === "EPERM";
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProcessExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await sleep(STOP_POLL_INTERVAL_MS);
  }

  return !isProcessRunning(pid);
}

async function readActiveRunsRaw(stateDir: string) {
  try {
    const raw = await readFile(resolveActiveRunsPath(stateDir), "utf8");
    const parsed = JSON.parse(raw) as { runs?: Array<Partial<DwemrActiveRun>> };
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}

async function writeActiveRuns(stateDir: string, runs: DwemrActiveRun[]) {
  const targetPath = resolveActiveRunsPath(stateDir);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify({ runs }, null, 2)}\n`, "utf8");
}

export function resolveActiveRunsPath(stateDir: string) {
  return path.join(stateDir, ACTIVE_RUNS_RELATIVE_PATH);
}

export async function loadActiveRuns(stateDir: string, options: { pruneStale?: boolean } = {}) {
  const normalized = (await readActiveRunsRaw(stateDir))
    .map((run) => normalizeActiveRun(run))
    .filter((run): run is DwemrActiveRun => Boolean(run));

  const pruneStale = options.pruneStale ?? true;
  if (!pruneStale) {
    return normalized;
  }

  const liveRuns = normalized.filter((run) => isProcessRunning(run.pid));
  if (liveRuns.length !== normalized.length) {
    await writeActiveRuns(stateDir, liveRuns);
  }

  return liveRuns;
}

export async function registerActiveRun(stateDir: string, run: DwemrActiveRun) {
  const normalized = normalizeActiveRun(run);
  if (!normalized) {
    return;
  }

  const existing = await loadActiveRuns(stateDir);
  const next = [
    ...existing.filter((entry) => entry.projectPath !== normalized.projectPath && entry.pid !== normalized.pid),
    normalized,
  ].sort((left, right) => right.startedAt.localeCompare(left.startedAt));

  await writeActiveRuns(stateDir, next);
}

export async function clearActiveRun(stateDir: string, projectPath: string, options: { pid?: number } = {}) {
  const normalizedProjectPath = resolveProjectPath(projectPath);
  const existing = await loadActiveRuns(stateDir, { pruneStale: false });
  const next = existing.filter((entry) => {
    if (entry.projectPath !== normalizedProjectPath) {
      return true;
    }
    if (options.pid !== undefined && entry.pid !== options.pid) {
      return true;
    }
    return false;
  });

  await writeActiveRuns(stateDir, next);
}

export async function findActiveRun(stateDir: string, projectPath: string) {
  const normalizedProjectPath = resolveProjectPath(projectPath);
  const runs = await loadActiveRuns(stateDir);
  return runs.find((run) => run.projectPath === normalizedProjectPath);
}

export async function stopActiveRun(stateDir: string, projectPath: string): Promise<StopActiveRunResult> {
  const normalizedProjectPath = resolveProjectPath(projectPath);
  const run = await findActiveRun(stateDir, normalizedProjectPath);
  if (!run) {
    return { status: "not_found", projectPath: normalizedProjectPath };
  }

  if (!isProcessRunning(run.pid)) {
    await clearActiveRun(stateDir, normalizedProjectPath, { pid: run.pid });
    return { status: "already_exited", run };
  }

  try {
    process.kill(run.pid, "SIGTERM");
  } catch (error) {
    const execError = error as NodeJS.ErrnoException;
    if (execError.code === "ESRCH") {
      await clearActiveRun(stateDir, normalizedProjectPath, { pid: run.pid });
      return { status: "already_exited", run };
    }

    return {
      status: "failed",
      run,
      error: String(error),
    };
  }

  if (await waitForProcessExit(run.pid, STOP_GRACE_PERIOD_MS)) {
    await clearActiveRun(stateDir, normalizedProjectPath, { pid: run.pid });
    return { status: "stopped", run, signal: "SIGTERM" };
  }

  try {
    process.kill(run.pid, "SIGKILL");
  } catch (error) {
    const execError = error as NodeJS.ErrnoException;
    if (execError.code === "ESRCH") {
      await clearActiveRun(stateDir, normalizedProjectPath, { pid: run.pid });
      return { status: "stopped", run, signal: "SIGTERM" };
    }

    return {
      status: "failed",
      run,
      error: String(error),
    };
  }

  if (await waitForProcessExit(run.pid, STOP_GRACE_PERIOD_MS)) {
    await clearActiveRun(stateDir, normalizedProjectPath, { pid: run.pid });
    return { status: "stopped", run, signal: "SIGKILL" };
  }

  return {
    status: "failed",
    run,
    error: `Process ${run.pid} did not exit after SIGTERM and SIGKILL.`,
  };
}
