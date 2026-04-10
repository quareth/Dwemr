import path from "node:path";
import type { HandlerContext, HandlerResult } from "./action-handler-types";
import { textResult } from "./action-handler-types";
import { buildInitHelp, buildModeHelp, buildRunnerHelp, buildUseHelp, formatHelpText, mapActionToClaudeCommand } from "./command-routing";
import { formatRunnerResult, translateClaudeCommandSurface } from "../backend/claude-runner";
import { formatDoctorText, preflightExecution, runDwemrDoctor } from "../diagnostics/doctor";
import { getDefaultRuntimeBackend } from "../backend/runtime-backend";
import type { DwemrRuntimeBackend, DwemrSessionInfo } from "../backend/runtime-backend-types";
import {
  formatBootstrapPendingStatus,
  formatOnboardingBlocked,
  formatPendingOnboardingEntry,
  formatProjectUseStatus,
  formatUnsupportedContract,
  prepareOnboardingStateForEntry,
} from "../../control-plane/onboarding-flow";
import { writeOnboardingState } from "../../control-plane/onboarding-state";
import { syncPipelineExecutionMode, readPipelineStateBrief, formatPipelineStateBrief } from "../../control-plane/pipeline-state";
import {
  normalizeExecutionModeInput,
  readProjectExecutionMode,
  updateProjectExecutionMode,
  readProjectModelConfig,
  updateProjectModelField,
  readProjectScmConfig,
  isGitEnabled,
  disableProjectGit,
  type DwemrExecutionMode,
} from "../../control-plane/project-config";
import { formatOverwriteConfirmation, initializeProject, inspectProjectHealth, pathExists, provisionProjectProfile, validateInitTargetPath } from "../../control-plane/project-assets";
import { formatProjectsText, getPluginConfig, rememberProjectSelection } from "../state/project-selection";

// ── Constants ──────────────────────────────────────────────────────────

export const DWEMR_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
];

export const DWEMR_EFFORT_LEVELS = ["auto", "low", "medium", "high", "max"];

const ACTIONS_THAT_BEGIN_ONBOARDING = new Set(["start", "plan"]);
const ACTIONS_THAT_SURFACE_PENDING_ONBOARDING = new Set(["continue", "what-now"]);
const ACTIONS_THAT_MAY_PROVISION_BOOTSTRAP_PROJECT = new Set(["start", "continue", "plan", "what-now"]);
const ACTIONS_BLOCKED_UNTIL_ONBOARDING = new Set(["implement", "release", "pr"]);
const RELEASE_LANE_ACTIONS = new Set(["release", "pr"]);
const EXECUTION_MODE_REFRESH_ACTIONS = new Set(["start", "continue"]);
const ACTIONS_THAT_KEEP_STANDARD_TIMEOUT = new Set(["status", "what-now"]);

function resolveRuntimeBackend(ctx: Pick<HandlerContext, "runtimeBackend" | "pluginConfig" | "api" | "runtimeContext">) {
  return ctx.runtimeBackend ?? getDefaultRuntimeBackend({
    preferredKind: ctx.pluginConfig.runtimeBackend,
    runtimeContext: ctx.runtimeContext ?? { api: ctx.api },
    runtimeConfig: ctx.pluginConfig,
  });
}

// ── Internal helpers ───────────────────────────────────────────────────

export function formatStopResult(result: Awaited<ReturnType<DwemrRuntimeBackend["stopActiveRun"]>>) {
  const commandText = result.status === "not_found" ? undefined : result.run.claudeCommand;
  const translatedCommand = commandText ? translateClaudeCommandSurface(commandText) : undefined;
  const runIdText = result.status === "not_found" ? undefined : result.run.identity.runId;
  const runtimeOwner = result.status === "not_found" ? undefined : formatRuntimeOwnerDescriptor(result.run);

  if (result.status === "not_found") {
    return [
      `No active OpenClaw-managed DWEMR run is currently registered for ${result.projectPath}.`,
      "",
      "If work is still in progress, wait for the current command to checkpoint or try `/dwemr continue` later.",
    ].join("\n");
  }

  if (result.status === "already_exited") {
    return [
      `No active DWEMR runtime owner was still in flight for ${result.run.projectPath}.`,
      `Cleared the stale active-run record for \`${translatedCommand ?? runIdText ?? "unknown run"}\`.`,
    ].join("\n");
  }

  if (result.status === "failed") {
    return [
      `DWEMR could not stop the active run for ${result.run.projectPath}.`,
      "",
      translatedCommand ? `Claude command: \`${translatedCommand}\`` : `Run ID: \`${runIdText}\``,
      `Runtime owner: \`${runtimeOwner ?? result.run.identity.backendKind}\``,
      "",
      String(result.error),
    ].join("\n");
  }

  return [
    `Stopped the active DWEMR run for ${result.run.projectPath}.`,
    `Action: \`${result.run.action}\``,
    translatedCommand ? `Claude command: \`${translatedCommand}\`` : `Run ID: \`${runIdText}\``,
    `Runtime owner: \`${runtimeOwner ?? result.run.identity.backendKind}\``,
    `Stop mechanism: \`${result.mechanism.kind}${result.mechanism.detail ? ` (${result.mechanism.detail})` : ""}\``,
    "",
    "Resume later with `/dwemr continue` or a narrower `/dwemr` command from the last saved checkpoint.",
  ].join("\n");
}

function formatRuntimeOwnerDescriptor(run: {
  identity: {
    backendKind: string;
    runId: string;
    flowId?: string;
    taskId?: string;
    childSessionKey?: string;
  };
  pid?: number;
  action: string;
  startedAt: string;
}) {
  const parts: string[] = [];
  if (run.identity.backendKind === "spawn" && run.pid) {
    parts.push(`spawn runtime PID ${run.pid}`);
  } else {
    parts.push(`${run.identity.backendKind} run ${run.identity.runId}`);
  }
  if (run.identity.flowId) {
    parts.push(`flow ${run.identity.flowId}`);
  }
  if (run.identity.taskId) {
    parts.push(`task ${run.identity.taskId}`);
  }
  return parts.join(" · ");
}

async function resolveClaudeRunOptions(stateDir: string, targetPath: string, action: string) {
  let executionMode: DwemrExecutionMode | undefined;

  try {
    executionMode = await readProjectExecutionMode(targetPath);
  } catch {
    executionMode = undefined;
  }

  return {
    stateDir,
    action,
    executionMode,
    timeoutMs: executionMode === "autonomous" && !ACTIONS_THAT_KEEP_STANDARD_TIMEOUT.has(action) ? null : undefined,
  };
}

async function ensureBootstrapReady(
  pluginConfig: ReturnType<typeof getPluginConfig>,
  targetPath: string,
  defaultProjectPath: string | undefined,
  action: string,
  runtimeBackend: DwemrRuntimeBackend,
) {
  return preflightExecution(pluginConfig, targetPath, defaultProjectPath, action, { allowBootstrap: true }, runtimeBackend);
}

async function runWithPreflight(
  pluginConfig: ReturnType<typeof getPluginConfig>,
  stateDir: string,
  targetPath: string,
  defaultProjectPath: string | undefined,
  action: string,
  claudeCommand: string,
  runtimeBackend: DwemrRuntimeBackend,
  options: {
    allowBootstrap?: boolean;
  } = {},
) {
  const preflight = await preflightExecution(pluginConfig, targetPath, defaultProjectPath, action, {
    allowBootstrap: options.allowBootstrap,
  }, runtimeBackend);
  if ("error" in preflight) {
    return preflight.error;
  }

  const projectModelConfig = await readProjectModelConfig(targetPath);
  const effectiveConfig = { ...pluginConfig, ...projectModelConfig };

  const result = await runtimeBackend.runClaudeCommand({
    targetPath,
    claudeCommand,
    runtimeConfig: effectiveConfig,
    options: await resolveClaudeRunOptions(stateDir, targetPath, action),
    runtimeState: preflight.runtime,
  });
  return formatRunnerResult(claudeCommand, result.exitCode, result.stdout, result.stderr, result.timedOut);
}

async function ensureProfileProvisioned(
  pluginConfig: ReturnType<typeof getPluginConfig>,
  stateDir: string,
  targetPath: string,
  defaultProjectPath: string | undefined,
  action: string,
  runtimeBackend: DwemrRuntimeBackend,
  requestText?: string,
): Promise<{ project: Awaited<ReturnType<typeof inspectProjectHealth>> } | { error: string }> {
  let project = await inspectProjectHealth(targetPath);
  if (project.installState === "profile_installed") {
    return { project };
  }
  if (project.installState === "unsupported_contract") {
    return { error: formatUnsupportedContract(targetPath, project, action) };
  }

  const preflight = await ensureBootstrapReady(pluginConfig, targetPath, defaultProjectPath, "onboarding", runtimeBackend);
  if ("error" in preflight && typeof preflight.error === "string") {
    return { error: preflight.error };
  }

  if (project.onboardingState.status !== "complete") {
    if (ACTIONS_THAT_BEGIN_ONBOARDING.has(action)) {
      const preparedState = prepareOnboardingStateForEntry(project.onboardingState, action, requestText);
      await writeOnboardingState(targetPath, {
        ...preparedState,
        updatedAt: new Date().toISOString(),
      });
    }

    const onboardingResult = await runtimeBackend.runClaudeCommand({
      targetPath,
      claudeCommand: "/delivery-driver onboarding",
      runtimeConfig: pluginConfig,
      options: {
        stateDir,
        action: "onboarding",
      },
      runtimeState: preflight.runtime,
    });
    const formatted = formatRunnerResult(
      "/delivery-driver onboarding",
      onboardingResult.exitCode,
      onboardingResult.stdout,
      onboardingResult.stderr,
      onboardingResult.timedOut,
    );
    project = await inspectProjectHealth(targetPath);
    if (project.onboardingState.status !== "complete") {
      return { error: formatted };
    }
  }

  try {
    await provisionProjectProfile(targetPath, project.onboardingState);
  } catch (error) {
    return {
      error: [
        `DWEMR completed onboarding in ${targetPath} but could not provision the selected profile packs.`,
        "",
        String(error),
      ].join("\n"),
    };
  }

  const refreshed = await inspectProjectHealth(targetPath);
  if (refreshed.installState !== "profile_installed") {
    return {
      error: [
        `DWEMR attempted to provision the selected profile in ${targetPath}, but the project is still not fully installed.`,
        "",
        ...refreshed.missingFiles.map((relativePath) => `- Missing: ${relativePath}`),
      ].join("\n"),
    };
  }

  return { project: refreshed };
}

async function refreshPipelineExecutionMode(targetPath: string) {
  const executionMode = await readProjectExecutionMode(targetPath);
  await syncPipelineExecutionMode(targetPath, executionMode);
  return executionMode;
}

async function runWithEnoentFallback(
  ctx: HandlerContext,
  targetPath: string,
  action: string,
  claudeCommand: string,
  runtimeBackend: DwemrRuntimeBackend,
  options?: { allowBootstrap?: boolean; prefixText?: string },
): Promise<HandlerResult> {
  try {
    const text = await runWithPreflight(
      ctx.pluginConfig,
      ctx.stateDir,
      targetPath,
      ctx.defaultProjectPath,
      action,
      claudeCommand,
      runtimeBackend,
      options,
    );
    return textResult((options?.prefixText ?? "") + text);
  } catch (error) {
    const execError = error as NodeJS.ErrnoException;
    if (execError.code === "ENOENT") {
      const report = await runDwemrDoctor(ctx.pluginConfig, targetPath, "inspect", runtimeBackend, { stateDir: ctx.stateDir, api: ctx.api });
      return textResult(formatDoctorText(report, ctx.pluginConfig, ctx.defaultProjectPath));
    }
    return textResult(`DWEMR failed to run \`${claudeCommand}\` in ${targetPath}.\n\n${String(error)}`);
  }
}

// ── Simple handlers ────────────────────────────────────────────────────

export async function handleEmptyCommand(ctx: HandlerContext): Promise<HandlerResult> {
  return textResult(buildRunnerHelp(ctx.defaultProjectPath));
}

export async function handleHelp(ctx: HandlerContext): Promise<HandlerResult> {
  return textResult(formatHelpText(ctx.defaultProjectPath));
}

export async function handleProjects(ctx: HandlerContext): Promise<HandlerResult> {
  return textResult(await formatProjectsText(ctx.api));
}

// ── Medium handlers ────────────────────────────────────────────────────

export async function handleUse(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const useTokens = tokens.slice(1);
  if (useTokens.length !== 1) {
    return textResult(buildUseHelp(ctx.defaultProjectPath));
  }

  const targetPath = path.resolve(useTokens[0]);
  if (!(await pathExists(targetPath))) {
    return textResult(`Project path does not exist: ${targetPath}`);
  }

  const project = await inspectProjectHealth(targetPath);
  await rememberProjectSelection(ctx.api, targetPath, { initialized: project.installState !== "missing", setActive: true });
  return textResult(formatProjectUseStatus(targetPath, project));
}

export async function handleStop(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const runtimeBackend = resolveRuntimeBackend(ctx);
  const stopTokens = tokens.slice(1);
  if (stopTokens.length > 1) {
    return textResult("Too many positional arguments for `stop`.\n" + buildRunnerHelp(ctx.defaultProjectPath));
  }

  const targetPath = stopTokens[0] ? path.resolve(stopTokens[0]) : ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult("Project path is required.\n" + buildRunnerHelp(ctx.defaultProjectPath));
  }

  return textResult(formatStopResult(await runtimeBackend.stopActiveRun(ctx.stateDir, targetPath)));
}

export async function handleInit(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const initTokens = tokens.slice(1);
  const overwrite = initTokens.includes("--overwrite") || initTokens.includes("-f");
  const confirmOverwrite = initTokens.includes("--confirm-overwrite");
  const pathTokens = initTokens.filter(
    (token) => token !== "--overwrite" && token !== "-f" && token !== "--confirm-overwrite",
  );
  const targetPath = pathTokens[0] ? path.resolve(pathTokens[0]) : ctx.defaultProjectPath;

  if (!targetPath) {
    return textResult(buildInitHelp(ctx.defaultProjectPath));
  }

  const validation = await validateInitTargetPath(targetPath);
  if (!validation.ok) {
    return textResult(validation.error);
  }
  if (overwrite && !confirmOverwrite) {
    return textResult(formatOverwriteConfirmation(targetPath));
  }

  const summary = await initializeProject(targetPath, overwrite);
  await rememberProjectSelection(ctx.api, targetPath, { initialized: true, setActive: true });
  return textResult(`${summary}\n\nRemembered ${targetPath} as the active DWEMR project.`);
}

export async function handleDoctor(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const runtimeBackend = resolveRuntimeBackend(ctx);
  const action = tokens[0];
  const doctorTokens = tokens.slice(1);
  const applyFix = action === "repair" || doctorTokens.includes("--fix");
  const restartRequested = action === "repair" || doctorTokens.includes("--restart");
  const noRestartRequested = doctorTokens.includes("--no-restart");
  if (restartRequested && noRestartRequested) {
    return textResult("Choose only one ACPX repair mode: `--restart` or `--no-restart`.");
  }
  const pathTokens = doctorTokens.filter((token) => token !== "--fix" && token !== "--restart" && token !== "--no-restart");

  if (pathTokens.length > 1) {
    return textResult("Too many positional arguments for `doctor`.\n" + buildRunnerHelp(ctx.defaultProjectPath));
  }

  const targetPath = pathTokens[0] ? path.resolve(pathTokens[0]) : ctx.defaultProjectPath;
  if (targetPath && (await pathExists(targetPath))) {
    const project = await inspectProjectHealth(targetPath);
    await rememberProjectSelection(ctx.api, targetPath, { initialized: project.installState !== "missing", setActive: true });
  }
  const report = await runDwemrDoctor(
    ctx.pluginConfig,
    targetPath,
    applyFix ? restartRequested || noRestartRequested ? "apply" : "preview" : "inspect",
    runtimeBackend,
    {
      stateDir: ctx.stateDir,
      api: ctx.api,
      restartBehavior: restartRequested ? "restart" : "no-restart",
    },
  );
  return textResult(formatDoctorText(report, ctx.pluginConfig, ctx.defaultProjectPath));
}

export async function handleGit(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const subAction = tokens[1];
  if (subAction !== "disable") {
    return textResult("Usage: /dwemr git disable\nDisables git for the active DWEMR project.");
  }

  const targetPath = ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult("No active project. Run `/dwemr use <path>` or `/dwemr init <path>` first.");
  }

  const project = await inspectProjectHealth(targetPath);
  if (project.installState === "missing") {
    return textResult(`DWEMR project not initialized at ${targetPath}. Run \`/dwemr init ${targetPath}\` first.`);
  }

  await disableProjectGit(targetPath);
  return textResult(
    `Git has been disabled for ${targetPath}.\n\nAll \`scm.*\` fields in \`.dwemr/project-config.yaml\` have been set to disabled/not_available.\nThe delivery workflow will continue without git operations.`,
  );
}

export async function handleMode(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const modeTokens = tokens.slice(1);
  if (modeTokens.length !== 1) {
    return textResult(buildModeHelp(ctx.defaultProjectPath));
  }

  const executionMode = normalizeExecutionModeInput(modeTokens[0]);
  if (!executionMode) {
    return textResult(`Unknown execution mode: ${modeTokens[0]}\n` + buildModeHelp(ctx.defaultProjectPath));
  }

  const targetPath = ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult(
      [
        "DWEMR cannot set an execution mode yet because there is no active project.",
        "",
        "Run `/dwemr init <path>` or `/dwemr use <path>` first, then retry `/dwemr mode <auto|checkpointed>`.",
      ].join("\n"),
    );
  }

  if (!(await pathExists(targetPath))) {
    return textResult(
      [
        `The active DWEMR project path no longer exists: ${targetPath}`,
        "",
        "Run `/dwemr projects` to review remembered paths, then `/dwemr use <path>` or `/dwemr init <path>` before changing execution mode.",
      ].join("\n"),
    );
  }

  const project = await inspectProjectHealth(targetPath);
  if (project.installState === "missing") {
    return textResult(
      [
        `DWEMR cannot set execution mode in ${targetPath} because this project is not initialized yet.`,
        "",
        `Next: run \`/dwemr init ${targetPath}\` first.`,
      ].join("\n"),
    );
  }

  if (project.installState === "unsupported_contract") {
    return textResult(formatUnsupportedContract(targetPath, project, "mode"));
  }

  await updateProjectExecutionMode(targetPath, executionMode);
  await syncPipelineExecutionMode(targetPath, executionMode);
  await rememberProjectSelection(ctx.api, targetPath, { initialized: true, setActive: true });

  return textResult(
    [
      `DWEMR execution mode for ${targetPath} is now \`${executionMode}\`.`,
      executionMode === "autonomous"
        ? "CLI shorthand `auto` maps to the stored mode `autonomous`."
        : "DWEMR will now run until the next milestone, then stop and report before waiting for `/dwemr continue`.",
    ].join("\n"),
  );
}

function formatSessionState(state: string) {
  switch (state) {
    case "idle": return "idle";
    case "running": return "running";
    case "error": return "ERROR";
    case "stale": return "stale";
    case "none": return "not found";
    default: return state;
  }
}

function formatSessionInfo(session: DwemrSessionInfo) {
  const parts = [
    `- \`${session.sessionKey}\``,
    `  State: **${formatSessionState(session.state)}**` +
      (session.pid ? ` | PID: ${session.pid}` : "") +
      (session.mode ? ` | Mode: ${session.mode}` : "") +
      (session.agent ? ` | Agent: ${session.agent}` : ""),
  ];
  if (session.projectPath) {
    parts.push(`  Project: ${session.projectPath}` + (session.action ? ` (${session.action})` : ""));
  }
  if (session.lastActivityAt) {
    const ago = Math.round((Date.now() - session.lastActivityAt) / 1000);
    parts.push(`  Last activity: ${ago}s ago`);
  }
  if (session.lastError) {
    parts.push(`  Last error: ${session.lastError}`);
  }
  return parts.join("\n");
}

export async function handleSessions(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const runtimeBackend = resolveRuntimeBackend(ctx);

  if (!runtimeBackend.listSessions || !runtimeBackend.clearSessions) {
    return textResult("Session listing is only available with the ACP-native runtime backend.");
  }

  const subcommand = tokens[1]?.toLowerCase();

  if (subcommand === "clear") {
    const result = await runtimeBackend.clearSessions(ctx.stateDir);
    return textResult(
      result.closed > 0 || result.failed > 0
        ? `Cleared ${result.closed} tracked DWEMR session(s).`
          + (result.failed > 0 ? ` ${result.failed} tracked session(s) failed to close.` : "")
          + " Unrelated ACP/ACPX sessions were not touched."
        : "No tracked DWEMR sessions to clear. Unrelated ACP/ACPX sessions were not touched.",
    );
  }

  const { sessions, aggregate } = await runtimeBackend.listSessions(ctx.stateDir);

  const lines: string[] = [];
  lines.push(`ACP runtime cache: ${aggregate.activeSessions} active session(s), ${aggregate.evictedTotal} evicted total.`);
  lines.push("DWEMR lists only sessions it currently tracks for DWEMR-owned runs. Unrelated ACP/ACPX sessions are not shown here.");

  if (sessions.length === 0) {
    lines.push("", "No tracked DWEMR sessions.");
  } else {
    lines.push("", `Tracked DWEMR sessions (${sessions.length}):`);
    for (const session of sessions) {
      lines.push("", formatSessionInfo(session));
    }
  }

  lines.push("", "To clear tracked DWEMR sessions only: `/dwemr sessions clear`");

  return textResult(lines.join("\n"));
}

export async function handleModelConfig(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const action = tokens[0];
  const targetPath = ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult("No active project. Run `/dwemr use <path>` or `/dwemr init <path>` first.");
  }

  const isEffort = action === "effort";
  const items = isEffort ? DWEMR_EFFORT_LEVELS : DWEMR_MODELS.map((m) => m.id);
  const configKey = action === "model" ? "main" : action === "subagents" ? "subagents" : "effort";
  const fieldLabel = action === "model" ? "main model" : action === "subagents" ? "subagent model" : "effort level";

  const current = await readProjectModelConfig(targetPath);
  const currentValue = action === "model" ? current.model : action === "subagents" ? current.subagentModel : current.effortLevel;

  const selectionToken = tokens[1];

  if (!selectionToken) {
    const listLines = [
      `DWEMR ${fieldLabel} for ${targetPath}:`,
      `Current: ${currentValue ?? "(openclaw default)"}`,
      "",
      ...items.map((item, i) => {
        const label = isEffort ? item : `${DWEMR_MODELS[i].label} (${item})`;
        return `${i + 1}. ${label}${item === currentValue ? " ✓" : ""}`;
      }),
      "",
      `Use \`/dwemr ${action} <number>\` to select, or \`/dwemr ${action} unset\` to clear.`,
    ];
    return textResult(listLines.join("\n"));
  }

  if (selectionToken === "unset") {
    await updateProjectModelField(targetPath, configKey, undefined);
    return textResult(`Cleared ${fieldLabel} for ${targetPath}. Will use openclaw default.`);
  }

  const selectionIndex = parseInt(selectionToken, 10) - 1;
  if (isNaN(selectionIndex) || selectionIndex < 0 || selectionIndex >= items.length) {
    return textResult(`Invalid selection. Choose a number between 1 and ${items.length}, or \`unset\` to clear.`);
  }

  const selected = items[selectionIndex];
  await updateProjectModelField(targetPath, configKey, selected);
  const selectedLabel = isEffort ? selected : `${DWEMR_MODELS[selectionIndex].label} (${selected})`;
  return textResult(`DWEMR ${fieldLabel} for ${targetPath} is now \`${selectedLabel}\`.`);
}

// ── Complex routed handler ─────────────────────────────────────────────

export async function handleGenericRouted(ctx: HandlerContext, tokens: string[]): Promise<HandlerResult> {
  const runtimeBackend = resolveRuntimeBackend(ctx);
  const action = tokens[0];
  const mapped = mapActionToClaudeCommand(action, undefined, tokens, ctx.defaultProjectPath);
  if ("error" in mapped) {
    return textResult(mapped.error);
  }

  let project = await inspectProjectHealth(mapped.targetPath);
  if (project.exists) {
    await rememberProjectSelection(ctx.api, mapped.targetPath, { initialized: project.installState !== "missing", setActive: true });
  }

  if (project.installState === "unsupported_contract") {
    return textResult(formatUnsupportedContract(mapped.targetPath, project, action));
  }

  if (project.installState === "bootstrap_only") {
    if (action === "status") {
      const activeRun = await runtimeBackend.findActiveRun(ctx.stateDir, mapped.targetPath);
      let activeRunInfo = "";
      if (activeRun) {
        const startedAt = new Date(activeRun.startedAt).toLocaleTimeString();
        const descriptor = formatRuntimeOwnerDescriptor(activeRun);
        activeRunInfo = `\n\nActive runtime owner: ${descriptor} (${activeRun.action}) — started ${startedAt}`;
      } else if (project.onboardingState.status === "awaiting_clarification") {
        activeRunInfo = "\n\nActive runtime owner: none (waiting on onboarding clarification from saved DWEMR state)";
      } else {
        activeRunInfo = "\n\nActive runtime owner: none";
      }
      return textResult(formatBootstrapPendingStatus(mapped.targetPath, project) + activeRunInfo);
    }

    if (ACTIONS_BLOCKED_UNTIL_ONBOARDING.has(action)) {
      return textResult(formatOnboardingBlocked(mapped.targetPath, action, project));
    }

    if (project.onboardingState.status !== "complete" && ACTIONS_THAT_SURFACE_PENDING_ONBOARDING.has(action)) {
      return textResult(formatPendingOnboardingEntry(mapped.targetPath, action, project));
    }

    if (ACTIONS_THAT_MAY_PROVISION_BOOTSTRAP_PROJECT.has(action)) {
      const ensured = await ensureProfileProvisioned(
        ctx.pluginConfig,
        ctx.stateDir,
        mapped.targetPath,
        ctx.defaultProjectPath,
        action,
        runtimeBackend,
        mapped.requestText,
      );
      if ("error" in ensured) {
        return textResult(ensured.error);
      }
      project = ensured.project;
      await rememberProjectSelection(ctx.api, mapped.targetPath, { initialized: true, setActive: true });
    }
  }

  if (RELEASE_LANE_ACTIONS.has(action) && project.installState === "profile_installed") {
    const scmConfig = await readProjectScmConfig(mapped.targetPath);
    if (!isGitEnabled(scmConfig)) {
      return textResult(
        [
          `Git is not enabled for ${mapped.targetPath}.`,
          "",
          `The \`${action}\` command requires git to be enabled in \`.dwemr/project-config.yaml\`.`,
          "",
          "To enable git, re-run onboarding with `/dwemr start <request>` and select a git-enabled workflow.",
        ].join("\n"),
      );
    }
  }

  if (action === "status" && project.installState === "profile_installed") {
    const [brief, activeRun] = await Promise.all([
      readPipelineStateBrief(mapped.targetPath),
      runtimeBackend.findActiveRun(ctx.stateDir, mapped.targetPath),
    ]);

    let activeRunInfo: string;
    if (activeRun) {
      const startedAt = new Date(activeRun.startedAt).toLocaleTimeString();
      const descriptor = formatRuntimeOwnerDescriptor(activeRun);
      activeRunInfo = `${descriptor} (${activeRun.action}) — started ${startedAt}`;
    } else if (brief?.milestoneKind === "user_input_required") {
      activeRunInfo = "none (waiting on user input from saved DWEMR state)";
    } else {
      activeRunInfo = "none (no runtime owner in flight)";
    }

    const snapshot = brief ? formatPipelineStateBrief(brief, activeRunInfo) : `Runtime owner: ${activeRunInfo}`;
    const claudeText = await runWithPreflight(
      ctx.pluginConfig,
      ctx.stateDir,
      mapped.targetPath,
      ctx.defaultProjectPath,
      action,
      mapped.claudeCommand,
      runtimeBackend,
    );
    return textResult(`${snapshot}\n\n${claudeText}`);
  }

  if (action === "continue" && project.installState === "profile_installed") {
    const brief = await readPipelineStateBrief(mapped.targetPath);
    if (brief?.milestoneKind === "user_input_required") {
      const pendingQuestion = brief.milestoneSummary || "User input required";
      const injectedContext = `## Pending user input
Question: ${pendingQuestion}

Use AskUserQuestion to get the user's answer in this session before continuing the pipeline.\n\n`;

      if (EXECUTION_MODE_REFRESH_ACTIONS.has(action) && project.installState === "profile_installed") {
        await refreshPipelineExecutionMode(mapped.targetPath);
      }
      return runWithEnoentFallback(ctx, mapped.targetPath, action, mapped.claudeCommand, runtimeBackend, { prefixText: injectedContext });
    }
  }

  if (EXECUTION_MODE_REFRESH_ACTIONS.has(action) && project.installState === "profile_installed") {
    await refreshPipelineExecutionMode(mapped.targetPath);
  }
  return runWithEnoentFallback(ctx, mapped.targetPath, action, mapped.claudeCommand, runtimeBackend);
}
