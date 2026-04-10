import { hasSavedClarificationBatch } from "../control-plane/onboarding-state";
import { inspectProjectHealth, provisionProjectProfile, repairBootstrapAssets, type ProjectHealth } from "../control-plane/project-assets";
import { readPipelineStateBrief } from "../control-plane/pipeline-state";
import type { DwemrClaudeRuntimeProbe } from "./claude-runner";
import type { DwemrPluginConfig } from "./project-selection";
import { DWEMR_CONTRACT_VERSION } from "../control-plane/state-contract";
import type { DwemrRuntimeInspection } from "./runtime";
import { getDefaultRuntimeBackend } from "./runtime-backend";
import type { DwemrRuntimeBackend, DwemrRuntimeState } from "./runtime-backend-types";

export type DwemrDoctorFixMode = "inspect" | "preview" | "apply";
export type DwemrDoctorRestartBehavior = "restart" | "no-restart";
type DwemrReloadMode = "hybrid" | "hot" | "restart" | "off" | "unknown";

type RuntimeConfigApi = {
  loadConfig: () => Promise<Record<string, unknown>>;
  writeConfigFile: (config: Record<string, unknown>) => Promise<unknown>;
};

export type DwemrDoctorAcpxPermissionRepair = {
  applicable: boolean;
  configAccess: "available" | "missing" | "error";
  enabled?: boolean;
  permissionMode?: string;
  nonInteractivePermissions?: string;
  timeoutSeconds?: number;
  reloadMode: DwemrReloadMode;
  needsRepair: boolean;
  previewed: boolean;
  attempted: boolean;
  changed: boolean;
  restartBehavior?: DwemrDoctorRestartBehavior;
  restartExpected: boolean;
  manualRestartRequired: boolean;
  error?: string;
};

export type DwemrDoctorReport = {
  runtime: DwemrRuntimeState;
  runtimeReady: boolean;
  project?: ProjectHealth;
  runtimeLedgerNotes: string[];
  fixApplied: boolean;
  fixMode: DwemrDoctorFixMode;
  fixNotes: string[];
  previewNotes: string[];
  automationNotes: string[];
  claudeProbe: DwemrClaudeRuntimeProbe;
  acpxPermissionRepair?: DwemrDoctorAcpxPermissionRepair;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: unknown) {
  return isRecord(value) ? { ...value } : {};
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeReloadMode(value: unknown): DwemrReloadMode {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (normalized === "hybrid" || normalized === "hot" || normalized === "restart" || normalized === "off") {
    return normalized;
  }
  return normalized ? "unknown" : "hybrid";
}

function normalizeOptionalPositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function resolveRuntimeConfigApi(api: unknown): RuntimeConfigApi | undefined {
  const candidate = isRecord(api) ? api.runtime : undefined;
  if (!isRecord(candidate)) {
    return undefined;
  }
  const config = candidate.config;
  if (!isRecord(config) || typeof config.loadConfig !== "function" || typeof config.writeConfigFile !== "function") {
    return undefined;
  }
  return config as unknown as RuntimeConfigApi;
}

function isAcpNativePermissionFailure(detail: string | undefined) {
  const text = detail?.toLowerCase() ?? "";
  return text.includes("permission prompt unavailable in non-interactive mode")
    || text.includes("could not apply acp runtime options before turn execution")
    || text.includes("approval_policy")
    || text.includes("session/set_config_option");
}

function isClaudeAgentPolicyFailure(detail: string | undefined) {
  const text = detail?.toLowerCase() ?? "";
  return text.includes("agent") && text.includes("claude") && text.includes("not allowed by policy");
}

function isAcpRuntimeOptionSetupFailure(detail: string | undefined) {
  const text = detail?.toLowerCase() ?? "";
  return text.includes("could not apply acp runtime options before turn execution")
    || text.includes("session/set_config_option")
    || text.includes("runtime options");
}

function getShellInspection(runtime: DwemrRuntimeState) {
  return runtime.shellInspection;
}

export function formatRuntimeSource(runtime: DwemrRuntimeState) {
  const shell = getShellInspection(runtime);
  if (!shell) {
    return `${runtime.backendKind} runtime (${runtime.ready ? "ready" : "not ready"})`;
  }
  if (shell.readySource === "managed") {
    return `managed runtime (${shell.managedCommandPath})`;
  }
  if (shell.readySource === "override" && shell.readyCommandPath) {
    return `configured override (${shell.readyCommandPath})`;
  }
  return "not ready";
}

function buildAcpxRecoveryNotes(runtime: DwemrRuntimeInspection) {
  if (runtime.openclawAcpxExtensionDetected) {
    return [
      "OpenClaw's ACPX runtime plugin is installed, but DWEMR could not find a runnable ACPX command from that install.",
      "Try `openclaw plugins install acpx`, then restart the gateway and rerun `/dwemr doctor --fix`.",
      "If you manage ACPX separately, set `plugins.entries.dwemr.config.acpxPath` to the executable path.",
    ];
  }

  return [
    "No OpenClaw ACPX runtime was detected for DWEMR bootstrap.",
    "Install or repair ACPX with `openclaw plugins install acpx`, restart the gateway, then rerun `/dwemr doctor --fix`.",
    "If you already have a custom ACPX executable, set `plugins.entries.dwemr.config.acpxPath` to that path.",
  ];
}

function buildRuntimeRecoveryNotes(runtime: DwemrRuntimeState) {
  const shell = getShellInspection(runtime);
  if (shell) {
    return buildAcpxRecoveryNotes(shell);
  }
  return runtime.notes?.length ? runtime.notes : ["The selected runtime backend is not ready. Re-run `/dwemr doctor --fix` or check backend runtime prerequisites."];
}

function formatActiveProjectCommand(command: string, args = "", projectPath?: string) {
  const suffix = args ? ` ${args}` : "";
  return projectPath ? `/dwemr ${command}${suffix}` : `/dwemr ${command} <path>${suffix}`;
}

function appendRuntimeSection(lines: string[], runtime: DwemrRuntimeState) {
  lines.push(`- Runtime backend: ${runtime.backendKind}`);
  lines.push(`- Runtime ready: ${runtime.ready ? "yes" : "no"}`);

  if (runtime.acp) {
    lines.push(`- ACP flow seam (tasks.flows): ${runtime.acp.flowViewsAvailable ? "available" : "missing"}`);
    lines.push(`- ACP taskFlow seam (compat): ${runtime.acp.taskFlowLegacyAvailable ? "available" : "missing"}`);
  }

  if (runtime.notes?.length) {
    lines.push(...runtime.notes.map((note) => `- Runtime note: ${note}`));
  }

  const shell = getShellInspection(runtime);
  if (!shell) {
    return;
  }

  lines.push("- Legacy ACPX compatibility diagnostics:");
  lines.push(`- Managed runtime: ${shell.managedReady ? `ready (${shell.managedCommandPath})` : "not ready"}`);
  lines.push(`- Configured acpxPath: ${shell.overrideCommandPath ? shell.overrideReady ? `ready (${shell.overrideCommandPath})` : `configured but not executable (${shell.overrideCommandPath})` : "not configured"}`);
}

function buildRuntimeLedgerNotes(activeRun: Awaited<ReturnType<DwemrRuntimeBackend["findActiveRun"]>> | undefined, pipelineMilestoneKind?: string) {
  if (!activeRun) {
    if (pipelineMilestoneKind === "user_input_required") {
      return ["No active runtime owner is expected right now; workflow is waiting on user input from saved DWEMR state."];
    }
    return ["No active runtime owner is currently registered for this project."];
  }

  const notes = [
    `Active runtime owner: ${activeRun.identity.backendKind} run ${activeRun.identity.runId}`,
  ];
  if (activeRun.identity.flowId && !activeRun.identity.taskId) {
    notes.push("Active run has a flow id but no task id; this can happen on degraded compatibility seams.");
  }
  if (activeRun.identity.backendKind === "acp-native" && !activeRun.identity.childSessionKey) {
    notes.push("Active ACP-native run is missing child session identity; stop/cancel reliability may be degraded.");
  }
  if (activeRun.identity.backendKind === "spawn" && !activeRun.pid) {
    notes.push("Active spawn run is missing PID metadata; signal-based stop may fail.");
  }
  return notes;
}

function buildAcpxPermissionPreviewNotes(
  projectPath: string | undefined,
  repair: DwemrDoctorAcpxPermissionRepair | undefined,
) {
  if (!repair?.needsRepair) {
    return [];
  }
  return [
    "DWEMR found an ACPX automation permission mismatch. ACPX, not `.claude/settings.json`, controls shell and file-write permissions for ACP-native runs.",
    `Choose one repair path: \`${formatActiveProjectCommand("doctor", "--fix --restart", projectPath)}\``,
    `Or repair only and restart manually: \`${formatActiveProjectCommand("doctor", "--fix --no-restart", projectPath)}\``,
  ];
}

function buildAcpxAutomationNotes(
  runtime: DwemrRuntimeState,
  claudeProbe: DwemrClaudeRuntimeProbe,
  repair: DwemrDoctorAcpxPermissionRepair | undefined,
) {
  const notes: string[] = [];
  const relevantRuntime = runtime.backendKind === "acp-native" || Boolean(runtime.acp);
  if (!relevantRuntime) {
    return notes;
  }

  const permissionIssue = isAcpNativePermissionFailure(claudeProbe.detail);
  if (permissionIssue || repair?.needsRepair) {
    notes.push("ACPX owns shell and file-write permissions for ACP-native DWEMR runs; `.claude/settings.json` does not override ACPX harness policy.");
  }

  if (repair?.configAccess === "missing") {
    notes.push("This OpenClaw runtime does not expose `api.runtime.config`, so DWEMR can diagnose ACPX permission issues but cannot repair host config automatically.");
  } else if (repair?.configAccess === "error" && repair.error) {
    notes.push(`DWEMR could not inspect or update OpenClaw config automatically: ${repair.error}`);
  }

  if (repair?.enabled === false) {
    notes.push("The ACPX plugin is disabled in OpenClaw config, so ACP-native DWEMR automation cannot be repaired through ACPX permission settings yet.");
  }

  if (isClaudeAgentPolicyFailure(claudeProbe.detail)) {
    notes.push("The remaining blocker is ACP policy for the `claude` agent. DWEMR will not auto-edit `acp.allowedAgents` or `acp.defaultAgent`.");
  }

  if (!repair?.needsRepair && permissionIssue) {
    notes.push("ACPX permission config already matches DWEMR's required `approve-all` + `fail` policy, so the remaining ACP-native failure is outside the permission scope doctor is allowed to auto-repair.");
  }

  return notes;
}

function patchAcpxPermissionConfig(config: Record<string, unknown>) {
  const next = { ...config };
  const plugins = cloneRecord(next.plugins);
  const entries = cloneRecord(plugins.entries);
  const acpx = cloneRecord(entries.acpx);
  const acpxConfig = cloneRecord(acpx.config);
  let changed = false;

  if (acpxConfig.permissionMode !== "approve-all") {
    acpxConfig.permissionMode = "approve-all";
    changed = true;
  }
  if (acpxConfig.nonInteractivePermissions !== "fail") {
    acpxConfig.nonInteractivePermissions = "fail";
    changed = true;
  }

  acpx.config = acpxConfig;
  entries.acpx = acpx;
  plugins.entries = entries;
  next.plugins = plugins;

  return { next, changed };
}

async function inspectAcpxPermissionRepair(
  api: unknown,
  applicable: boolean,
): Promise<{ repair?: DwemrDoctorAcpxPermissionRepair; config?: Record<string, unknown> }> {
  if (!applicable) {
    return {
      repair: {
        applicable: false,
        configAccess: "missing",
        reloadMode: "unknown",
        needsRepair: false,
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false,
      },
    };
  }

  const configApi = resolveRuntimeConfigApi(api);
  if (!configApi) {
    return {
      repair: {
        applicable: true,
        configAccess: "missing",
        reloadMode: "unknown",
        needsRepair: false,
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false,
      },
    };
  }

  try {
    const config = await configApi.loadConfig();
    const plugins = cloneRecord(config.plugins);
    const entries = cloneRecord(plugins.entries);
    const acpx = cloneRecord(entries.acpx);
    const acpxConfig = cloneRecord(acpx.config);
    const permissionMode = normalizeOptionalString(acpxConfig.permissionMode);
    const nonInteractivePermissions = normalizeOptionalString(acpxConfig.nonInteractivePermissions);
    const timeoutSeconds = normalizeOptionalPositiveNumber(acpxConfig.timeoutSeconds);
    const reloadMode = normalizeReloadMode(cloneRecord(config.gateway).reload && cloneRecord(cloneRecord(config.gateway).reload).mode);

    return {
      config,
      repair: {
        applicable: true,
        configAccess: "available",
        enabled: acpx.enabled !== false,
        permissionMode,
        nonInteractivePermissions,
        timeoutSeconds,
        reloadMode,
        needsRepair: permissionMode !== "approve-all" || nonInteractivePermissions !== "fail",
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false,
      },
    };
  } catch (error) {
    return {
      repair: {
        applicable: true,
        configAccess: "error",
        reloadMode: "unknown",
        needsRepair: false,
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false,
        error: String(error),
      },
    };
  }
}

async function applyAcpxPermissionRepair(params: {
  api: unknown;
  current: DwemrDoctorAcpxPermissionRepair;
  restartBehavior: DwemrDoctorRestartBehavior;
  config: Record<string, unknown> | undefined;
}) {
  const configApi = resolveRuntimeConfigApi(params.api);
  if (!configApi || !params.config) {
    return {
      repair: {
        ...params.current,
        attempted: true,
        error: "OpenClaw config access is unavailable for ACPX permission repair.",
      },
    };
  }

  try {
    const { next, changed } = patchAcpxPermissionConfig(params.config);
    if (changed) {
      await configApi.writeConfigFile(next);
    }
    const restartExpected = params.restartBehavior === "restart"
      && (params.current.reloadMode === "hybrid" || params.current.reloadMode === "restart");
    return {
      repair: {
        ...params.current,
        permissionMode: "approve-all",
        nonInteractivePermissions: "fail",
        attempted: true,
        changed,
        restartBehavior: params.restartBehavior,
        restartExpected,
        manualRestartRequired: params.restartBehavior === "no-restart" || !restartExpected,
      },
    };
  } catch (error) {
    return {
      repair: {
        ...params.current,
        attempted: true,
        restartBehavior: params.restartBehavior,
        error: String(error),
      },
    };
  }
}

export function formatDoctorText(report: DwemrDoctorReport, pluginConfig: DwemrPluginConfig, defaultProjectPath: string | undefined) {
  const lines = ["DWEMR doctor", "", "Runtime:"];

  appendRuntimeSection(lines, report.runtime);
  lines.push(`- Execution runtime: ${formatRuntimeSource(report.runtime)}`);
  lines.push(`- Claude model override: ${pluginConfig.model?.trim() ? pluginConfig.model : "not configured"}`);
  lines.push(`- Claude subagent model: ${pluginConfig.subagentModel?.trim() ? pluginConfig.subagentModel : "not configured"}`);
  lines.push(`- Claude effort override: ${pluginConfig.effortLevel?.trim() ? pluginConfig.effortLevel : "not configured"}`);

  if (report.project) {
    const selectedProfile = report.project.canonicalProfile ?? report.project.onboardingState.selectedProfile ?? "not selected";
    lines.push("", "Project:");
    lines.push(`- Target path: ${report.project.targetPath}`);
    lines.push(`- Exists: ${report.project.exists ? "yes" : "no"}`);
    lines.push(`- DWEMR install state: ${report.project.installState}`);
    if (report.project.contractIssues.length === 0) {
      lines.push(`- DWEMR contract: v${DWEMR_CONTRACT_VERSION}`);
    } else {
      lines.push("- DWEMR contract: unsupported");
      lines.push(...report.project.contractIssues.map((issue) => `- Contract issue: ${issue}`));
    }
    lines.push(`- Onboarding status: ${report.project.onboardingState.status}`);
    lines.push(`- Selected profile: ${selectedProfile}`);
    if (report.project.onboardingState.clarificationSummary) {
      lines.push(`- Clarification summary: ${report.project.onboardingState.clarificationSummary}`);
    }
    if (report.project.onboardingState.clarificationQuestions.length > 0) {
      lines.push(`- Clarification questions: ${report.project.onboardingState.clarificationQuestions.join(" | ")}`);
    }
    if (report.project.expectedPacks.length > 0) {
      lines.push(`- Expected packs: ${report.project.expectedPacks.join(", ")}`);
    }
    if (report.project.missingFiles.length > 0) {
      lines.push(...report.project.missingFiles.map((relativePath) => `- Missing: ${relativePath}`));
    }
  } else {
    lines.push("", "Project:");
    lines.push(`- Target path: ${defaultProjectPath ? `not provided (default is ${defaultProjectPath})` : "not provided"}`);
  }

  lines.push("", "Claude probe:");
  lines.push(`- ${report.claudeProbe.detail}`);

  if (report.acpxPermissionRepair?.applicable) {
    lines.push("", "ACPX permissions:");
    lines.push(`- permissionMode: ${report.acpxPermissionRepair.permissionMode ?? "not set"}`);
    lines.push(`- nonInteractivePermissions: ${report.acpxPermissionRepair.nonInteractivePermissions ?? "not set"}`);
    lines.push(`- timeoutSeconds: ${report.acpxPermissionRepair.timeoutSeconds ?? "not set"}`);
    lines.push(`- Gateway reload mode: ${report.acpxPermissionRepair.reloadMode}`);
  }

  if (report.automationNotes.length > 0) {
    lines.push("", "ACP-native automation:");
    lines.push(...report.automationNotes.map((note) => `- ${note}`));
  }

  if (report.previewNotes.length > 0) {
    lines.push("", "Permission repair preview:");
    lines.push(...report.previewNotes.map((note) => `- ${note}`));
  }

  if (report.fixNotes.length > 0) {
    lines.push("", report.fixApplied ? "Self-heal:" : "Fix suggestions:");
    lines.push(...report.fixNotes.map((note) => `- ${note}`));
  }

  if (report.runtimeLedgerNotes.length > 0) {
    lines.push("", "Runtime ledger:");
    lines.push(...report.runtimeLedgerNotes.map((note) => `- ${note}`));
  }

  lines.push("", "Next:");
  const activeProjectReady = report.project?.exists ? report.project.targetPath : defaultProjectPath;
  if (report.previewNotes.length > 0) {
    lines.push(`- Run \`${formatActiveProjectCommand("doctor", "--fix --restart", activeProjectReady)}\` to repair ACPX permissions and let OpenClaw apply the restart path when supported.`);
    lines.push(`- Run \`${formatActiveProjectCommand("doctor", "--fix --no-restart", activeProjectReady)}\` to repair ACPX permissions now and restart the gateway yourself later.`);
    return lines.join("\n");
  }

  if (report.fixApplied) {
    if (report.project?.installState === "unsupported_contract") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`);
    } else if (!report.runtimeReady) {
      lines.push(...buildRuntimeRecoveryNotes(report.runtime).map((note) => `- ${note}`));
    } else if (report.acpxPermissionRepair?.attempted && report.acpxPermissionRepair.manualRestartRequired) {
      lines.push("- Restart the OpenClaw gateway before retrying DWEMR so ACPX permission changes can take effect.");
    } else if (report.acpxPermissionRepair?.attempted && report.acpxPermissionRepair.restartExpected) {
      lines.push("- Wait for the OpenClaw gateway to reload, then retry your DWEMR command.");
    } else if (report.project?.targetPath) {
      lines.push(`- Retry the original command, for example: ${formatActiveProjectCommand("status", "", activeProjectReady)}`);
    } else {
      lines.push("- Retry your DWEMR command.");
    }
  } else {
    if (!report.runtimeReady) {
      if (getShellInspection(report.runtime)) {
        lines.push(`- Run \`${formatActiveProjectCommand("doctor", "--fix", activeProjectReady)}\` to bootstrap the managed ACPX runtime.`);
      } else {
        lines.push(...buildRuntimeRecoveryNotes(report.runtime).map((note) => `- ${note}`));
      }
    }
    if (report.project?.installState === "missing") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath}\` to install the DWEMR bootstrap assets.`);
    } else if (report.project?.installState === "unsupported_contract") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`);
    } else if (report.project?.installState === "bootstrap_only" && hasSavedClarificationBatch(report.project.onboardingState)) {
      lines.push(`- Answer the pending onboarding clarification with \`${formatActiveProjectCommand("start", "<response>", activeProjectReady)}\` or \`${formatActiveProjectCommand("plan", "<response>", activeProjectReady)}\`.`);
      lines.push(`- Run \`${formatActiveProjectCommand("what-now", "", activeProjectReady)}\` if you just want to review the saved clarification batch again.`);
    } else if (report.project?.installState === "bootstrap_only" && report.project.onboardingState.status !== "complete") {
      lines.push(`- Run \`${formatActiveProjectCommand("start", "<request>", activeProjectReady)}\` or \`${formatActiveProjectCommand("plan", "<request>", activeProjectReady)}\` to supply the initial onboarding request.`);
    } else if (report.project?.installState === "bootstrap_only") {
      lines.push(`- Run \`${formatActiveProjectCommand("start", "<request>", activeProjectReady)}\` or \`${formatActiveProjectCommand("continue", "", activeProjectReady)}\` to finish profile provisioning.`);
    } else if (!report.project && !defaultProjectPath) {
      lines.push("- Run `/dwemr init <path>` first to initialize and select a project, then retry your DWEMR command.");
    }
    if (report.claudeProbe.status === "failed") {
      const permissionIssue = isAcpNativePermissionFailure(report.claudeProbe.detail);
      const runtimeOptionIssue = isAcpRuntimeOptionSetupFailure(report.claudeProbe.detail);
      const permissionUnset = report.acpxPermissionRepair?.permissionMode !== "approve-all";
      const timeoutTooLowOrMissing = !report.acpxPermissionRepair?.timeoutSeconds || report.acpxPermissionRepair.timeoutSeconds < 7200;

      if (permissionIssue || permissionUnset) {
        lines.push("- If you are seeing ACPX permission errors, run `openclaw config set plugins.entries.acpx.config.permissionMode approve-all` and restart the OpenClaw gateway.");
      }
      if (runtimeOptionIssue || timeoutTooLowOrMissing) {
        lines.push("- If ACPX sessions fail during longer DWEMR turns or die around a repeatable time boundary, run `openclaw config set plugins.entries.acpx.config.timeoutSeconds 7200` and restart the OpenClaw gateway.");
      }
      lines.push("- Run `claude auth status` in your shell and re-authenticate Claude Code if needed.");
    }
  }

  return lines.join("\n");
}

export async function runDwemrDoctor(
  pluginConfig: DwemrPluginConfig,
  targetPath: string | undefined,
  fixMode: DwemrDoctorFixMode,
  runtimeBackend: DwemrRuntimeBackend = getDefaultRuntimeBackend({ runtimeConfig: pluginConfig }),
  options: {
    stateDir?: string;
    api?: unknown;
    restartBehavior?: DwemrDoctorRestartBehavior;
  } = {},
): Promise<DwemrDoctorReport> {
  let runtime = await runtimeBackend.inspectRuntime(pluginConfig);
  const fixNotes: string[] = [];
  const runtimeReady = () => runtime.ready;
  const shouldApplyExistingFixes = fixMode !== "inspect";

  if (shouldApplyExistingFixes && !runtimeReady()) {
    const previousRuntime = runtime;
    runtime = await runtimeBackend.ensureRuntime(pluginConfig);
    if (!previousRuntime.ready && runtime.ready) {
      fixNotes.push("Bootstrapped the DWEMR runtime backend.");
    } else if (!runtimeReady()) {
      fixNotes.push("Could not bootstrap the DWEMR runtime backend automatically.");
    }
  }

  let project: ProjectHealth | undefined;
  if (targetPath) {
    project = await inspectProjectHealth(targetPath);
    if (shouldApplyExistingFixes && project.exists && project.installState === "missing") {
      try {
        const repaired = await repairBootstrapAssets(targetPath);
        if (repaired.installedTargets.length > 0) {
          fixNotes.push(`Repaired missing DWEMR bootstrap assets in ${targetPath}: ${repaired.installedTargets.join(", ")}.`);
        } else {
          fixNotes.push(`DWEMR checked ${targetPath} for missing bootstrap assets, but nothing new needed to be installed.`);
        }
        project = await inspectProjectHealth(targetPath);
      } catch (error) {
        fixNotes.push(`Could not repair the project assets automatically: ${String(error)}`);
      }
    } else if (shouldApplyExistingFixes && project.exists && project.installState === "unsupported_contract") {
      fixNotes.push(
        `DWEMR did not auto-upgrade ${targetPath}. Run \`/dwemr init ${targetPath} --overwrite --confirm-overwrite\` to destroy the current target folder contents and adopt the current contract from scratch.`,
      );
    } else if (shouldApplyExistingFixes && project.exists && project.installState === "bootstrap_only" && project.onboardingState.status === "complete") {
      try {
        const provisioned = await provisionProjectProfile(targetPath, project.onboardingState);
        fixNotes.push(`Provisioned the selected profile packs in ${targetPath}: ${provisioned.packNames.join(", ")}.`);
        project = await inspectProjectHealth(targetPath);
      } catch (error) {
        fixNotes.push(`Could not finish profile provisioning automatically: ${String(error)}`);
      }
    }
  }

  let runtimeLedgerNotes: string[] = [];
  if (targetPath && options.stateDir) {
    const [activeRun, brief] = await Promise.all([
      runtimeBackend.findActiveRun(options.stateDir, targetPath),
      readPipelineStateBrief(targetPath),
    ]);
    runtimeLedgerNotes = buildRuntimeLedgerNotes(activeRun, brief?.milestoneKind);
  }

  let claudeProbe: DwemrClaudeRuntimeProbe = { status: "skipped", detail: "Skipped because no execution runtime is ready yet." };
  if (runtimeReady() && project) {
    claudeProbe = await runtimeBackend.probeClaudeRuntime({
      targetPath: project.targetPath,
      project,
      runtimeConfig: pluginConfig,
      runtimeState: runtime,
    });
  } else if (runtimeReady() && !targetPath) {
    claudeProbe = { status: "skipped", detail: "Skipped because no target project path was provided." };
  }

  const acpxPermissionApplicable = runtime.backendKind === "acp-native" && (runtime.acp?.backendId ?? "acpx") === "acpx";
  const acpxInspection = await inspectAcpxPermissionRepair(options.api, acpxPermissionApplicable);
  let acpxPermissionRepair = acpxInspection.repair;
  const previewNotes: string[] = [];

  if (acpxPermissionRepair?.needsRepair) {
    if (fixMode === "apply") {
      const applied = await applyAcpxPermissionRepair({
        api: options.api,
        current: acpxPermissionRepair,
        restartBehavior: options.restartBehavior ?? "no-restart",
        config: acpxInspection.config,
      });
      acpxPermissionRepair = applied.repair;

      if (acpxPermissionRepair.error) {
        fixNotes.push(`Could not repair ACPX automation permissions automatically: ${acpxPermissionRepair.error}`);
      } else if (acpxPermissionRepair.changed) {
        fixNotes.push("Updated OpenClaw ACPX permission config to `permissionMode=approve-all` and `nonInteractivePermissions=fail`.");
        if (acpxPermissionRepair.restartExpected) {
          fixNotes.push(`Gateway reload mode is \`${acpxPermissionRepair.reloadMode}\`, so OpenClaw should apply the restart path automatically.`);
        } else {
          fixNotes.push("A manual OpenClaw gateway restart is still required before ACPX permission changes take effect.");
        }
      } else {
        fixNotes.push("OpenClaw ACPX permission config was already set to DWEMR's required automation values.");
      }
    } else if (fixMode === "preview") {
      acpxPermissionRepair = {
        ...acpxPermissionRepair,
        previewed: true,
        restartBehavior: options.restartBehavior,
      };
      previewNotes.push(...buildAcpxPermissionPreviewNotes(project?.exists ? project.targetPath : targetPath, acpxPermissionRepair));
    }
  } else if (fixMode === "apply" && acpxPermissionRepair?.applicable && acpxPermissionRepair.configAccess === "available") {
    fixNotes.push("OpenClaw ACPX permission config already matches DWEMR's required automation values.");
  }

  if (!runtimeReady()) {
    fixNotes.push(...buildRuntimeRecoveryNotes(runtime));
  }

  const automationNotes = buildAcpxAutomationNotes(runtime, claudeProbe, acpxPermissionRepair);

  return {
    runtime,
    runtimeReady: runtimeReady(),
    project,
    runtimeLedgerNotes,
    fixApplied: shouldApplyExistingFixes && fixNotes.length > 0,
    fixMode,
    fixNotes,
    previewNotes,
    automationNotes,
    claudeProbe,
    acpxPermissionRepair,
  };
}

export async function preflightExecution(
  pluginConfig: DwemrPluginConfig,
  targetPath: string,
  defaultProjectPath: string | undefined,
  action: string,
  options: {
    allowBootstrap?: boolean;
  } = {},
  runtimeBackend: DwemrRuntimeBackend = getDefaultRuntimeBackend({ runtimeConfig: pluginConfig }),
) {
  const runtime = await runtimeBackend.inspectRuntime(pluginConfig);
  const project = await inspectProjectHealth(targetPath);
  if (
    runtime.ready &&
    project.exists &&
    project.installState !== "unsupported_contract" &&
    (project.installState === "profile_installed" || (options.allowBootstrap && project.installState === "bootstrap_only"))
  ) {
    return { runtime };
  }

  const report: DwemrDoctorReport = {
    runtime,
    runtimeReady: runtime.ready,
    project,
    runtimeLedgerNotes: [],
    fixApplied: false,
    fixMode: "inspect",
    fixNotes: [],
    previewNotes: [],
    automationNotes: [],
    claudeProbe: {
      status: "skipped",
      detail: "Skipped during preflight. Run `/dwemr doctor` to validate Claude auth and session readiness.",
    },
  };

  return {
    error: [
      `DWEMR is not ready to run \`${action}\` in ${targetPath}.`,
      "",
      formatDoctorText(report, pluginConfig, defaultProjectPath),
    ].join("\n"),
  };
}
