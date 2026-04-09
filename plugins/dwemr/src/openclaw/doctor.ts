import { ensureManagedDwemrRuntime, inspectDwemrRuntime, type DwemrRuntimeInspection } from "./runtime";
import { hasSavedClarificationBatch } from "../control-plane/onboarding-state";
import { inspectProjectHealth, provisionProjectProfile, repairBootstrapAssets, type ProjectHealth } from "../control-plane/project-assets";
import { probeClaudeRuntime, type ClaudeRuntimeProbe } from "./claude-runner";
import type { DwemrPluginConfig } from "./project-selection";
import { DWEMR_CONTRACT_VERSION } from "../control-plane/state-contract";

export type DwemrDoctorReport = {
  runtime: DwemrRuntimeInspection;
  project?: ProjectHealth;
  fixApplied: boolean;
  fixNotes: string[];
  claudeProbe: ClaudeRuntimeProbe;
};

export function formatRuntimeSource(runtime: DwemrRuntimeInspection) {
  if (runtime.readySource === "managed") {
    return `managed runtime (${runtime.managedCommandPath})`;
  }
  if (runtime.readySource === "override" && runtime.readyCommandPath) {
    return `configured override (${runtime.readyCommandPath})`;
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
    "No OpenClaw ACPX runtime or PATH-based `acpx` executable was detected for DWEMR bootstrap.",
    "Install or repair ACPX with `openclaw plugins install acpx`, restart the gateway, then rerun `/dwemr doctor --fix`.",
    "If you already have a custom ACPX executable, set `plugins.entries.dwemr.config.acpxPath` to that path.",
  ];
}

function formatActiveProjectCommand(command: string, args = "", projectPath?: string) {
  const suffix = args ? ` ${args}` : "";
  return projectPath ? `/dwemr ${command}${suffix}` : `/dwemr ${command} <path>${suffix}`;
}

export function formatDoctorText(report: DwemrDoctorReport, pluginConfig: DwemrPluginConfig, defaultProjectPath: string | undefined) {
  const lines = ["DWEMR doctor", "", "Runtime:"];

  lines.push(`- Managed runtime dir: ${report.runtime.managedRuntimeDir}`);
  lines.push(`- Managed runtime: ${report.runtime.managedReady ? `ready (${report.runtime.managedCommandPath})` : "not ready"}`);
  lines.push(`- Configured acpxPath: ${report.runtime.overrideCommandPath ? report.runtime.overrideReady ? `ready (${report.runtime.overrideCommandPath})` : `configured but not executable (${report.runtime.overrideCommandPath})` : "not configured"}`);
  lines.push(`- OpenClaw package root: ${report.runtime.openclawPackageRoot ?? "not detected"}`);
  lines.push(`- OpenClaw ACPX extension: ${report.runtime.openclawAcpxExtensionDetected ? `detected (${report.runtime.openclawAcpxExtensionPath})` : "not detected"}`);
  lines.push(`- Bundled ACPX source: ${report.runtime.bootstrapSourceKind === "bundled" && report.runtime.bootstrapSourcePath ? report.runtime.bootstrapSourcePath : "not detected"}`);
  lines.push(`- PATH fallback source: ${report.runtime.pathFallbackCommandPath ?? "not detected"}`);
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

  lines.push("", "Next:");
  const activeProjectReady = report.project?.exists ? report.project.targetPath : defaultProjectPath;
  if (report.fixApplied) {
    if (report.project?.installState === "unsupported_contract") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`);
    } else if (!report.runtime.readyCommandPath) {
      lines.push(...buildAcpxRecoveryNotes(report.runtime).map((note) => `- ${note}`));
    } else if (report.project?.targetPath) {
      lines.push(`- Retry the original command, for example: ${formatActiveProjectCommand("status", "", activeProjectReady)}`);
    } else {
      lines.push("- Retry your DWEMR command.");
    }
  } else {
    if (!report.runtime.readyCommandPath) {
      lines.push(`- Run \`${formatActiveProjectCommand("doctor", "--fix", activeProjectReady)}\` to bootstrap the managed ACPX runtime.`);
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

export async function runDwemrDoctor(pluginConfig: DwemrPluginConfig, targetPath: string | undefined, applyFix: boolean): Promise<DwemrDoctorReport> {
  let runtime = await inspectDwemrRuntime(pluginConfig);
  const fixNotes: string[] = [];

  if (applyFix && !runtime.readyCommandPath) {
    const previousRuntime = runtime;
    runtime = await ensureManagedDwemrRuntime(pluginConfig);
    if (runtime.managedReady && !previousRuntime.managedReady) {
      fixNotes.push(`Bootstrapped the managed ACPX runtime at ${runtime.managedCommandPath}.`);
    } else if (!runtime.readyCommandPath) {
      fixNotes.push("Could not bootstrap the managed ACPX runtime automatically.");
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

  let claudeProbe: ClaudeRuntimeProbe = { status: "skipped", detail: "Skipped because no execution runtime is ready yet." };
  if (runtime.readyCommandPath && project) {
    claudeProbe = await probeClaudeRuntime(runtime.readyCommandPath, project.targetPath, project, pluginConfig);
  } else if (runtime.readyCommandPath && !targetPath) {
    claudeProbe = { status: "skipped", detail: "Skipped because no target project path was provided." };
  }

  if (!runtime.readyCommandPath) {
    if (runtime.bootstrapSourcePath) {
      fixNotes.push(`A bootstrap source is available at ${runtime.bootstrapSourcePath}.`);
    } else {
      fixNotes.push(...buildAcpxRecoveryNotes(runtime));
    }
  }

  return {
    runtime,
    project,
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
) {
  const runtime = await inspectDwemrRuntime(pluginConfig);
  const project = await inspectProjectHealth(targetPath);
  if (
    runtime.readyCommandPath &&
    project.exists &&
    project.installState !== "unsupported_contract" &&
    (project.installState === "profile_installed" || (options.allowBootstrap && project.installState === "bootstrap_only"))
  ) {
    return { commandPath: runtime.readyCommandPath };
  }

  const report: DwemrDoctorReport = {
    runtime,
    project,
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
