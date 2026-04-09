import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { DwemrExecutionMode } from "../control-plane/project-config";

const execFileAsync = promisify(execFile);

const ACTIVE_RUNS_RELATIVE_PATH = path.join("tools", "dwemr", "active-runs.json");
const STOP_GRACE_PERIOD_MS = 3_000;
const STOP_POLL_INTERVAL_MS = 200;

export type DwemrRunIdentity = {
  backendKind: string;
  runId: string;
  flowId?: string;
  taskId?: string;
  childSessionKey?: string;
  ownerSessionKey?: string;
  pid?: number;
};

export type DwemrActiveRun = {
  projectPath: string;
  startedAt: string;
  action: string;
  executionMode?: DwemrExecutionMode;
  identity: DwemrRunIdentity;
  pid?: number;
  claudeCommand?: string;
  sessionName?: string;
};

export type StopActiveRunResult =
  | { status: "not_found"; projectPath: string }
  | { status: "already_exited"; run: DwemrActiveRun }
  | { status: "stopped"; run: DwemrActiveRun; signal: "SIGTERM" | "SIGKILL" }
  | { status: "failed"; run: DwemrActiveRun; error: string };

type LoadActiveRunsOptions = {
  pruneStale?: boolean;
  backendKind?: string;
};

function resolveProjectPath(projectPath: string) {
  return path.resolve(projectPath);
}

function normalizeRunIdentity(raw: unknown): DwemrRunIdentity | undefined {
  if (typeof raw !== "object" || raw === null) {
    return;
  }

  const candidate = raw as Partial<DwemrRunIdentity>;
  if (typeof candidate.backendKind !== "string" || candidate.backendKind.trim().length === 0) {
    return;
  }
  if (typeof candidate.runId !== "string" || candidate.runId.trim().length === 0) {
    return;
  }

  return {
    backendKind: candidate.backendKind.trim(),
    runId: candidate.runId.trim(),
    flowId: typeof candidate.flowId === "string" && candidate.flowId.trim().length > 0 ? candidate.flowId.trim() : undefined,
    taskId: typeof candidate.taskId === "string" && candidate.taskId.trim().length > 0 ? candidate.taskId.trim() : undefined,
    childSessionKey: typeof candidate.childSessionKey === "string" && candidate.childSessionKey.trim().length > 0 ? candidate.childSessionKey.trim() : undefined,
    ownerSessionKey: typeof candidate.ownerSessionKey === "string" && candidate.ownerSessionKey.trim().length > 0 ? candidate.ownerSessionKey.trim() : undefined,
    pid: typeof candidate.pid === "number" && Number.isInteger(candidate.pid) && candidate.pid > 0 ? candidate.pid : undefined,
  };
}

function parseOptionalPid(raw: unknown) {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    return undefined;
  }
  return raw;
}

function buildLegacySpawnIdentity(raw: {
  projectPath: string;
  pid: number;
  startedAt: string;
  sessionName: string;
}) {
  const projectPath = resolveProjectPath(raw.projectPath);
  return {
    backendKind: "spawn",
    runId: `spawn:${projectPath}:${raw.pid}:${raw.startedAt}`,
    childSessionKey: raw.sessionName,
    pid: raw.pid,
  } satisfies DwemrRunIdentity;
}

function normalizeActiveRun(raw: Partial<DwemrActiveRun>): DwemrActiveRun | undefined {
  if (typeof raw.projectPath !== "string" || raw.projectPath.trim().length === 0) {
    return;
  }
  if (typeof raw.startedAt !== "string" || raw.startedAt.trim().length === 0) {
    return;
  }
  if (typeof raw.action !== "string" || raw.action.trim().length === 0) {
    return;
  }

  const parsedPid = parseOptionalPid(raw.pid);
  const normalizedIdentity =
    normalizeRunIdentity(raw.identity) ??
    (
      parsedPid &&
      typeof raw.sessionName === "string" &&
      raw.sessionName.trim().length > 0 &&
      typeof raw.claudeCommand === "string" &&
      raw.claudeCommand.trim().length > 0
        ? buildLegacySpawnIdentity({
            projectPath: raw.projectPath,
            pid: parsedPid,
            startedAt: raw.startedAt,
            sessionName: raw.sessionName,
          })
        : undefined
    );

  if (!normalizedIdentity) {
    return;
  }

  const effectivePid = parsedPid ?? normalizedIdentity.pid;
  const identityWithPid =
    effectivePid && !normalizedIdentity.pid
      ? { ...normalizedIdentity, pid: effectivePid }
      : normalizedIdentity;

  if (identityWithPid.backendKind === "spawn" && !effectivePid) {
    return;
  }

  return {
    projectPath: resolveProjectPath(raw.projectPath),
    startedAt: raw.startedAt,
    action: raw.action.trim(),
    executionMode: raw.executionMode === "autonomous" || raw.executionMode === "checkpointed" ? raw.executionMode : undefined,
    identity: identityWithPid,
    pid: effectivePid,
    claudeCommand: typeof raw.claudeCommand === "string" && raw.claudeCommand.trim().length > 0 ? raw.claudeCommand.trim() : undefined,
    sessionName: typeof raw.sessionName === "string" && raw.sessionName.trim().length > 0 ? raw.sessionName.trim() : undefined,
  } satisfies DwemrActiveRun;
}

export function isProcessRunning(pid: number) {
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

function isActiveRun(run: DwemrActiveRun) {
  const pid = run.pid ?? run.identity.pid;
  if (typeof pid !== "number") {
    return true; // No PID — can't prove dead, keep it.
  }
  return isProcessRunning(pid);
}

export function resolveActiveRunsPath(stateDir: string) {
  return path.join(stateDir, ACTIVE_RUNS_RELATIVE_PATH);
}

export async function loadActiveRuns(stateDir: string, options: LoadActiveRunsOptions = {}) {
  const normalized = (await readActiveRunsRaw(stateDir))
    .map((run) => normalizeActiveRun(run))
    .filter((run): run is DwemrActiveRun => Boolean(run));

  const pruneStale = options.pruneStale ?? true;
  const baseRuns = pruneStale ? normalized.filter(isActiveRun) : normalized;
  if (pruneStale && baseRuns.length !== normalized.length) {
    await writeActiveRuns(stateDir, baseRuns);
  }

  if (!options.backendKind) {
    return baseRuns;
  }

  return baseRuns.filter((run) => run.identity.backendKind === options.backendKind);
}

export async function registerActiveRun(stateDir: string, run: DwemrActiveRun) {
  const normalized = normalizeActiveRun(run);
  if (!normalized) {
    return;
  }

  const existing = await loadActiveRuns(stateDir);
  const next = [
    ...existing.filter((entry) => entry.projectPath !== normalized.projectPath && entry.identity.runId !== normalized.identity.runId),
    normalized,
  ].sort((left, right) => right.startedAt.localeCompare(left.startedAt));

  await writeActiveRuns(stateDir, next);
}

export async function clearActiveRun(
  stateDir: string,
  projectPath: string,
  options: { pid?: number; runId?: string; backendKind?: string } = {},
) {
  const normalizedProjectPath = resolveProjectPath(projectPath);
  const existing = await loadActiveRuns(stateDir, { pruneStale: false });
  const next = existing.filter((entry) => {
    if (entry.projectPath !== normalizedProjectPath) {
      return true;
    }
    if (options.backendKind && entry.identity.backendKind !== options.backendKind) {
      return true;
    }
    if (options.runId && entry.identity.runId !== options.runId) {
      return true;
    }
    if (options.pid !== undefined) {
      const entryPid = entry.pid ?? entry.identity.pid;
      if (entryPid !== options.pid) {
        return true;
      }
    }
    if (options.pid === undefined && !options.runId && !options.backendKind) {
      return false;
    }
    return false;
  });

  await writeActiveRuns(stateDir, next);
}

export async function findActiveRun(stateDir: string, projectPath: string, options: { backendKind?: string } = {}) {
  const normalizedProjectPath = resolveProjectPath(projectPath);
  const runs = await loadActiveRuns(stateDir, { backendKind: options.backendKind });
  return runs.find((run) => run.projectPath === normalizedProjectPath);
}

export type KillProcessResult =
  | { status: "already_exited" }
  | { status: "killed"; signal: "SIGTERM" | "SIGKILL" }
  | { status: "failed"; error: string };

export async function killProcessWithEscalation(pid: number): Promise<KillProcessResult> {
  if (!isProcessRunning(pid)) {
    return { status: "already_exited" };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    const execError = error as NodeJS.ErrnoException;
    if (execError.code === "ESRCH") {
      return { status: "already_exited" };
    }
    return { status: "failed", error: String(error) };
  }

  if (await waitForProcessExit(pid, STOP_GRACE_PERIOD_MS)) {
    return { status: "killed", signal: "SIGTERM" };
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    const execError = error as NodeJS.ErrnoException;
    if (execError.code === "ESRCH") {
      return { status: "killed", signal: "SIGTERM" };
    }
    return { status: "failed", error: String(error) };
  }

  if (await waitForProcessExit(pid, STOP_GRACE_PERIOD_MS)) {
    return { status: "killed", signal: "SIGKILL" };
  }

  return { status: "failed", error: `Process ${pid} did not exit after SIGTERM and SIGKILL.` };
}

export async function snapshotChildPids(filter: string): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-f", filter]);
    return stdout.trim().split("\n").map(Number).filter((pid) => pid > 0 && Number.isInteger(pid));
  } catch {
    return [];
  }
}

export async function resolveCwdForPid(pid: number): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-a", "-d", "cwd", "-p", String(pid), "-Fn"]);
    for (const line of stdout.split("\n")) {
      if (line.startsWith("n/")) {
        return line.slice(1);
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function updateActiveRunPid(stateDir: string, projectPath: string, runId: string, pid: number) {
  const normalizedProjectPath = resolveProjectPath(projectPath);
  const existing = await loadActiveRuns(stateDir, { pruneStale: false });
  for (const run of existing) {
    if (run.projectPath === normalizedProjectPath && run.identity.runId === runId) {
      run.pid = pid;
      run.identity.pid = pid;
    }
  }
  await writeActiveRuns(stateDir, existing);
}

export async function stopActiveRun(stateDir: string, projectPath: string): Promise<StopActiveRunResult> {
  const normalizedProjectPath = resolveProjectPath(projectPath);
  const run = await findActiveRun(stateDir, normalizedProjectPath, { backendKind: "spawn" });
  if (!run) {
    return { status: "not_found", projectPath: normalizedProjectPath };
  }

  const pid = run.pid ?? run.identity.pid;
  if (!pid) {
    await clearActiveRun(stateDir, normalizedProjectPath, { runId: run.identity.runId, backendKind: "spawn" });
    return {
      status: "failed",
      run,
      error: "Spawn run record does not include a PID and cannot be stopped with process signals.",
    };
  }

  const killResult = await killProcessWithEscalation(pid);
  if (killResult.status === "already_exited") {
    await clearActiveRun(stateDir, normalizedProjectPath, { pid, runId: run.identity.runId, backendKind: "spawn" });
    return { status: "already_exited", run };
  }
  if (killResult.status === "killed") {
    await clearActiveRun(stateDir, normalizedProjectPath, { pid, runId: run.identity.runId, backendKind: "spawn" });
    return { status: "stopped", run, signal: killResult.signal };
  }
  return { status: "failed", run, error: killResult.error };
}
