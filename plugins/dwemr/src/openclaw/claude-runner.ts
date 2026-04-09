import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { clearActiveRun, registerActiveRun } from "./active-runs";
import type { DwemrExecutionMode } from "../control-plane/project-config";
import type { ProjectHealth } from "../control-plane/project-assets";

const DWEMR_SESSION_NAME = "dwemr";
const DOCTOR_PROMPT_TEXT = "Say only: DWEMR_READY";
const DOCTOR_PROMPT_EXPECTED = "DWEMR_READY";
const DOCTOR_TIMEOUT_MS = 60_000;
const DELIVERY_TIMEOUT_MS = 10 * 60_000;

export type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type ClaudeRuntimeProbe =
  | { status: "skipped"; detail: string }
  | { status: "ok"; detail: string; result: ProcessResult }
  | { status: "failed"; detail: string; result?: ProcessResult };

export type DwemrClaudeModelConfig = {
  model?: string;
  subagentModel?: string;
  effortLevel?: string;
};

export type ClaudeCommandRunOptions = {
  timeoutMs?: number | null;
  stateDir?: string;
  action?: string;
  executionMode?: DwemrExecutionMode;
};

const deliveryToDwemrLiteralTranslations: Array<[RegExp, string]> = [
  [/\/delivery-driver onboarding\b/g, "DWEMR onboarding"],
  [/\/delivery-driver\b/g, "DWEMR driver"],
  [/\/delivery-pr\b/g, "/dwemr pr"],
  [/\/delivery-what-now\b/g, "/dwemr what-now"],
  [/\/delivery-continue\b/g, "/dwemr continue"],
  [/\/delivery-implement\b/g, "/dwemr implement"],
  [/\/delivery-release\b/g, "/dwemr release"],
  [/\/delivery-status\b/g, "/dwemr status"],
];

function normalizeClaudeModelConfig(config: DwemrClaudeModelConfig = {}) {
  const model = config.model?.trim();
  const subagentModel = config.subagentModel?.trim();
  const effortLevel = config.effortLevel?.trim();

  return {
    model: model || undefined,
    subagentModel: subagentModel || undefined,
    effortLevel: effortLevel || undefined,
  };
}

function resolveDwemrSessionName(config: DwemrClaudeModelConfig = {}) {
  const normalized = normalizeClaudeModelConfig(config);
  const suffixSource = [normalized.model, normalized.subagentModel, normalized.effortLevel].filter(Boolean).join("|");
  if (!suffixSource) {
    return DWEMR_SESSION_NAME;
  }
  const suffix = createHash("sha256").update(suffixSource).digest("hex").slice(0, 10);
  return `${DWEMR_SESSION_NAME}-${suffix}`;
}

function createCommandScopedSessionName(config: DwemrClaudeModelConfig = {}) {
  return `${resolveDwemrSessionName(config)}-${randomUUID().slice(0, 8)}`;
}

export function buildProcessEnv(config: DwemrClaudeModelConfig = {}) {
  const existing = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const preferred = [
    path.dirname(process.execPath),
    path.join(os.homedir(), ".local", "bin"),
  ];
  const merged: string[] = [];

  for (const entry of [...preferred, ...existing]) {
    if (!entry || merged.includes(entry)) {
      continue;
    }
    merged.push(entry);
  }

  const normalized = normalizeClaudeModelConfig(config);

  return {
    ...process.env,
    PATH: merged.join(path.delimiter),
    ...(normalized.model ? { ANTHROPIC_MODEL: normalized.model } : {}),
    ...(normalized.subagentModel ? { CLAUDE_CODE_SUBAGENT_MODEL: normalized.subagentModel } : {}),
    ...(normalized.effortLevel ? { CLAUDE_CODE_EFFORT_LEVEL: normalized.effortLevel } : {}),
  };
}

export async function runProcessCapture(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number | null | undefined,
  config: DwemrClaudeModelConfig = {},
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildProcessEnv(config),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : undefined;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
      });
    });
  });
}

export function describeProcessFailure(action: string, result: ProcessResult) {
  if (result.timedOut) {
    return `Timed out while ${action}.`;
  }
  return result.stderr || result.stdout || `Exited with code ${result.exitCode} while ${action}.`;
}

export function claudeAuthLooksReady(stdout: string) {
  try {
    const parsed = JSON.parse(stdout) as { loggedIn?: boolean };
    return parsed.loggedIn === true;
  } catch {
    return /\bloggedIn\b[^a-zA-Z0-9]+true\b/i.test(stdout) || /\b(authenticated|logged in)\b/i.test(stdout);
  }
}

function translateParameterizedDeliveryCommand(text: string, commandName: "start" | "plan", publicPrefix: string) {
  return text.replace(new RegExp(String.raw`/delivery-${commandName}(?:(\s+)([^\n\r` + "`" + String.raw`]+))?`, "g"), (_match, spacing?: string, args?: string) => {
    const trimmedArgs = args?.trim();
    if (!trimmedArgs) {
      return `${publicPrefix} <request>`;
    }
    return `${publicPrefix}${spacing ?? " "}${trimmedArgs}`;
  });
}

export function translateClaudeCommandSurface(text: string) {
  let translated = translateParameterizedDeliveryCommand(text, "start", "/dwemr start");
  translated = translateParameterizedDeliveryCommand(translated, "plan", "/dwemr plan");

  for (const [pattern, replacement] of deliveryToDwemrLiteralTranslations) {
    translated = translated.replace(pattern, replacement);
  }

  return translated;
}

async function ensureClaudeSessionNamed(
  command: string,
  targetPath: string,
  timeoutMs: number,
  sessionName: string,
  config: DwemrClaudeModelConfig = {},
) {
  return runProcessCapture(
    command,
    ["--cwd", targetPath, "claude", "sessions", "ensure", "--name", sessionName],
    targetPath,
    timeoutMs,
    config,
  );
}

export async function ensureClaudeSession(command: string, targetPath: string, timeoutMs: number, config: DwemrClaudeModelConfig = {}) {
  return ensureClaudeSessionNamed(command, targetPath, timeoutMs, resolveDwemrSessionName(config), config);
}

async function runTrackedClaudeProcess(
  command: string,
  targetPath: string,
  sessionName: string,
  claudeCommand: string,
  timeoutMs: number | null | undefined,
  config: DwemrClaudeModelConfig = {},
  options: ClaudeCommandRunOptions = {},
) {
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(
      command,
      ["--cwd", targetPath, "--format", "quiet", "claude", "-s", sessionName, claudeCommand],
      {
        cwd: targetPath,
        env: buildProcessEnv(config),
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cleared = false;
    const timer =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : undefined;
    const registrationPromise = (async () => {
      if (!options.stateDir || !child.pid) {
        return;
      }
      try {
        await registerActiveRun(options.stateDir, {
          projectPath: targetPath,
          pid: child.pid,
          startedAt: new Date().toISOString(),
          action: options.action ?? "unknown",
          claudeCommand,
          sessionName,
          executionMode: options.executionMode,
        });
      } catch {
        // Best-effort registry; the Claude run should continue even if bookkeeping fails.
      }
    })();

    const clearTracking = async () => {
      await registrationPromise;
      if (cleared || !options.stateDir) {
        return;
      }
      cleared = true;
      try {
        await clearActiveRun(options.stateDir, targetPath, { pid: child.pid ?? undefined });
      } catch {
        // Best-effort cleanup; process result still matters more than registry noise.
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      void clearTracking().finally(() => reject(error));
    });

    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      void clearTracking().finally(() =>
        resolve({
          exitCode: code ?? 1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut,
        }),
      );
    });
  });
}

export async function probeClaudeRuntime(command: string, targetPath: string, project: ProjectHealth, config: DwemrClaudeModelConfig = {}): Promise<ClaudeRuntimeProbe> {
  if (!project.exists) {
    return { status: "skipped", detail: "Skipped because the target project path does not exist." };
  }
  if (project.installState === "missing") {
    return { status: "skipped", detail: "Skipped because DWEMR project assets are not installed yet." };
  }
  if (project.installState === "unsupported_contract") {
    return {
      status: "skipped",
      detail: "Skipped because the project uses an unsupported DWEMR state contract. Re-run `/dwemr init <path> --overwrite --confirm-overwrite` first.",
    };
  }

  try {
    const authResult = await runProcessCapture("claude", ["auth", "status"], targetPath, DOCTOR_TIMEOUT_MS, config);
    if (authResult.exitCode !== 0 || authResult.timedOut) {
      return {
        status: "failed",
        detail: describeProcessFailure("checking `claude auth status`", authResult),
        result: authResult,
      };
    }
    if (!claudeAuthLooksReady(authResult.stdout)) {
      return {
        status: "failed",
        detail: authResult.stdout || "Claude Code is installed, but `claude auth status` did not report a logged-in session.",
        result: authResult,
      };
    }

    const sessionName = createCommandScopedSessionName(config);
    const sessionResult = await ensureClaudeSessionNamed(command, targetPath, DOCTOR_TIMEOUT_MS, sessionName, config);
    if (sessionResult.exitCode !== 0 || sessionResult.timedOut) {
      return {
        status: "failed",
        detail: describeProcessFailure(`ensuring the Claude session \`${sessionName}\``, sessionResult),
        result: sessionResult,
      };
    }

    const promptResult = await runProcessCapture(
      command,
      ["--cwd", targetPath, "--format", "quiet", "claude", "-s", sessionName, DOCTOR_PROMPT_TEXT],
      targetPath,
      DOCTOR_TIMEOUT_MS,
      config,
    );
    if (promptResult.exitCode !== 0 || promptResult.timedOut) {
      return {
        status: "failed",
        detail: describeProcessFailure("running a quiet Claude health-check prompt", promptResult),
        result: promptResult,
      };
    }
    if (promptResult.stdout.trim() !== DOCTOR_PROMPT_EXPECTED) {
      return {
        status: "failed",
        detail: promptResult.stdout || promptResult.stderr || "Claude returned an unexpected health-check response.",
        result: promptResult,
      };
    }

    return { status: "ok", detail: `Claude auth is ready, the DWEMR session \`${sessionName}\` can be ensured, and a quiet prompt returned \`DWEMR_READY\`.`, result: promptResult };
  } catch (error) {
    return {
      status: "failed",
      detail: String(error),
    };
  }
}

export async function runClaudeCommand(
  command: string,
  targetPath: string,
  claudeCommand: string,
  config: DwemrClaudeModelConfig = {},
  options: ClaudeCommandRunOptions = {},
) {
  const sessionName = createCommandScopedSessionName(config);
  const sessionResult = await ensureClaudeSessionNamed(command, targetPath, DOCTOR_TIMEOUT_MS, sessionName, config);
  if (sessionResult.exitCode !== 0 || sessionResult.timedOut) {
    return {
      ...sessionResult,
      stderr: [`Failed to ensure the Claude session \`${sessionName}\`.`, describeProcessFailure("ensuring the Claude session", sessionResult)]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  return runTrackedClaudeProcess(
    command,
    targetPath,
    sessionName,
    claudeCommand,
    options.timeoutMs === undefined ? DELIVERY_TIMEOUT_MS : options.timeoutMs,
    config,
    options,
  );
}

export function formatRunnerResult(claudeCommand: string, exitCode: number, stdout: string, stderr: string, timedOut: boolean) {
  const publicCommand = translateClaudeCommandSurface(claudeCommand);

  if (exitCode === 0 && !timedOut && stdout) {
    return translateClaudeCommandSurface(stdout);
  }

  const lines = [`DWEMR failed to run \`${publicCommand}\` in Claude.`, `Exit code: \`${exitCode}\``];

  if (timedOut) {
    lines.push("The command timed out before Claude returned a final response.");
  }

  if (stdout) {
    lines.push(`Stdout:\n${translateClaudeCommandSurface(stdout)}`);
  } else {
    lines.push("Stdout: (empty)");
  }

  if (stderr) {
    lines.push(`Stderr:\n${translateClaudeCommandSurface(stderr)}`);
  }

  return lines.join("\n\n");
}
