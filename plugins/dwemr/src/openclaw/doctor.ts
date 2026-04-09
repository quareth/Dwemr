import { hasSavedClarificationBatch } from "../control-plane/onboarding-state";
import { inspectProjectHealth, provisionProjectProfile, repairBootstrapAssets, type ProjectHealth } from "../control-plane/project-assets";
import { readPipelineStateBrief } from "../control-plane/pipeline-state";
import type { ClaudeRuntimeProbe } from "./claude-runner";
import type { DwemrPluginConfig } from "./project-selection";
import { DWEMR_CONTRACT_VERSION } from "../control-plane/state-contract";
import type { DwemrRuntimeInspection } from "./runtime";
import { getDefaultRuntimeBackend, type DwemrRuntimeBackend, type DwemrRuntimeState } from "./runtime-backend";

export type DwemrDoctorReport = {
  runtime: DwemrRuntimeState;
  runtimeReady: boolean;
  project?: ProjectHealth;
  runtimeLedgerNotes: string[];
  fixApplied: boolean;
  fixNotes: string[];
  claudeProbe: ClaudeRuntimeProbe;
};

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
  if (report.fixApplied) {
    if (report.project?.installState === "unsupported_contract") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`);
    } else if (!report.runtimeReady) {
      lines.push(...buildRuntimeRecoveryNotes(report.runtime).map((note) => `- ${note}`));
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
      lines.push("- Run `claude auth status` in your shell and re-authenticate Claude Code if needed.");
    }
  }

  return lines.join("\n");
}

export async function runDwemrDoctor(
  pluginConfig: DwemrPluginConfig,
  targetPath: string | undefined,
  applyFix: boolean,
  runtimeBackend: DwemrRuntimeBackend = getDefaultRuntimeBackend({ runtimeConfig: pluginConfig }),
  options: {
    stateDir?: string;
  } = {},
): Promise<DwemrDoctorReport> {
  let runtime = await runtimeBackend.inspectRuntime(pluginConfig);
  const fixNotes: string[] = [];
  const runtimeReady = () => runtime.ready;

  if (applyFix && !runtimeReady()) {
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
    if (applyFix && project.exists && project.installState === "missing") {
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
    } else if (applyFix && project.exists && project.installState === "unsupported_contract") {
      fixNotes.push(
        `DWEMR did not auto-upgrade ${targetPath}. Run \`/dwemr init ${targetPath} --overwrite --confirm-overwrite\` to destroy the current target folder contents and adopt the current contract from scratch.`,
      );
    } else if (applyFix && project.exists && project.installState === "bootstrap_only" && project.onboardingState.status === "complete") {
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

  let claudeProbe: ClaudeRuntimeProbe = { status: "skipped", detail: "Skipped because no execution runtime is ready yet." };
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

  if (!runtimeReady()) {
    fixNotes.push(...buildRuntimeRecoveryNotes(runtime));
  }

  return {
    runtime,
    runtimeReady: runtimeReady(),
    project,
    runtimeLedgerNotes,
    fixApplied: applyFix,
    fixNotes,
    claudeProbe,
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
    fixNotes: [],
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
