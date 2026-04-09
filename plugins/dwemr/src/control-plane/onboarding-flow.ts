import type { ProjectHealth } from "./project-assets";
import { hasSavedClarificationBatch, normalizeOnboardingState, type OnboardingState } from "./onboarding-state";

export function prepareOnboardingStateForEntry(currentState: OnboardingState, entryAction: string, requestText?: string) {
  const normalizedState = normalizeOnboardingState(currentState);
  const trimmedRequest = requestText?.trim() ?? "";

  if (hasSavedClarificationBatch(normalizedState)) {
    return normalizeOnboardingState({
      ...normalizedState,
      entryAction,
      requestContext: normalizedState.requestContext || trimmedRequest,
      clarificationResponse: trimmedRequest,
    });
  }

  return normalizeOnboardingState({
    ...normalizedState,
    entryAction,
    requestContext: trimmedRequest,
    clarificationSummary: "",
    clarificationQuestions: [],
    clarificationResponse: "",
  });
}

export function formatProjectUseStatus(targetPath: string, project: ProjectHealth) {
  const selectedProfile = project.canonicalProfile ?? project.onboardingState.selectedProfile ?? "unknown";

  if (project.installState === "unsupported_contract") {
    return [
      `Active DWEMR project set to ${targetPath}.`,
      "",
      "This project uses an older DWEMR state contract and must be refreshed before normal commands can run.",
      "",
      ...project.contractIssues.map((issue) => `- ${issue}`),
      "",
      `Next: run \`/dwemr init ${targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`,
    ].join("\n");
  }

  if (project.installState === "profile_installed") {
    return [
      `Active DWEMR project set to ${targetPath}.`,
      "",
      `DWEMR is fully installed for the \`${selectedProfile}\` profile.`,
    ].join("\n");
  }

  if (project.installState === "bootstrap_only") {
    const onboardingStatusText =
      project.onboardingState.status === "complete"
        ? "DWEMR bootstrap assets are installed and onboarding has completed, but the selected profile still needs provisioning."
        : hasSavedClarificationBatch(project.onboardingState)
          ? "DWEMR bootstrap assets are installed, and onboarding is waiting on one clarification batch."
          : "DWEMR bootstrap assets are installed, but onboarding is still pending.";

    return [
      `Active DWEMR project set to ${targetPath}.`,
      "",
      onboardingStatusText,
    ].join("\n");
  }

  return [
    `Active DWEMR project set to ${targetPath}.`,
    "",
    "DWEMR assets are not installed in this project yet. Run `/dwemr init` if needed.",
  ].join("\n");
}

export function formatUnsupportedContract(targetPath: string, project: ProjectHealth, action?: string) {
  const intro = action
    ? `DWEMR cannot run \`${action}\` in ${targetPath} because this project uses an older DWEMR state contract.`
    : `DWEMR cannot use ${targetPath} as a runnable project because it uses an older DWEMR state contract.`;

  return [
    intro,
    "",
    "This DWEMR runtime uses a clean-break state contract. Older initialized projects must be refreshed before routing can continue.",
    "",
    "Detected contract issues:",
    ...project.contractIssues.map((issue) => `- ${issue}`),
    "",
    "Next:",
    `- Run \`/dwemr init ${targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`,
    "- Re-run your DWEMR command after the overwrite completes.",
  ].join("\n");
}

export function formatBootstrapPendingStatus(targetPath: string, project: ProjectHealth) {
  const selectedProfile = project.canonicalProfile ?? project.onboardingState.selectedProfile ?? "not selected";
  const lines = [
    `DWEMR status for ${targetPath}`,
    "",
    `- Install state: ${project.installState}`,
    `- Onboarding status: ${project.onboardingState.status}`,
    `- Selected profile: ${selectedProfile}`,
  ];

  if (project.onboardingState.selectedPacks.length > 0) {
    lines.push(`- Selected packs: ${project.onboardingState.selectedPacks.join(", ")}`);
  }

  if (project.onboardingState.requiredArtifacts.length > 0) {
    lines.push(`- Required artifacts: ${project.onboardingState.requiredArtifacts.join(", ")}`);
  }

  if (project.onboardingState.clarificationSummary) {
    lines.push(`- Clarification summary: ${project.onboardingState.clarificationSummary}`);
  }

  if (project.onboardingState.clarificationQuestions.length > 0) {
    lines.push(...project.onboardingState.clarificationQuestions.map((question) => `- Clarification question: ${question}`));
  }

  lines.push("", "Next:");

  if (project.onboardingState.status === "complete") {
    lines.push("- Run `/dwemr start <request>` or `/dwemr continue` to finish profile provisioning and continue delivery.");
  } else if (hasSavedClarificationBatch(project.onboardingState)) {
    lines.push("- Answer the pending clarification with `/dwemr start <response>`.");
    lines.push("- `/dwemr continue` and `/dwemr what-now` will only repeat the current clarification batch until onboarding completes.");
  } else {
    lines.push("- Run `/dwemr start <request>` or `/dwemr plan <request>` to supply the initial onboarding request.");
    lines.push("- `/dwemr continue` and `/dwemr what-now` can report onboarding status, but they do not start first-pass project classification.");
  }

  return lines.join("\n");
}

export function formatPendingOnboardingEntry(targetPath: string, action: string, project: ProjectHealth) {
  const lines = [
    `DWEMR cannot use \`${action}\` as the first onboarding step for ${targetPath}.`,
    "",
  ];

  if (hasSavedClarificationBatch(project.onboardingState)) {
    lines.push("Onboarding is already waiting on one clarification batch.");
    if (project.onboardingState.clarificationSummary) {
      lines.push("", `Missing context: ${project.onboardingState.clarificationSummary}`);
    }
    if (project.onboardingState.clarificationQuestions.length > 0) {
      lines.push("", "Clarification questions:");
      lines.push(...project.onboardingState.clarificationQuestions.map((question) => `- ${question}`));
    }
    lines.push(
      "",
      "Next:",
      "- Answer the clarification with `/dwemr start <response>`.",
      "- `continue` and `what-now` only surface the saved clarification batch until onboarding completes.",
    );
    return lines.join("\n");
  }

  if (project.onboardingState.requestContext) {
    lines.push(
      "DWEMR already has onboarding request context saved, but the last headless onboarding pass did not finish cleanly.",
      "",
      "Next:",
      "- Re-run `/dwemr start <request>` or `/dwemr plan <request>` to resume onboarding with request-bearing input.",
      `- Run \`/dwemr doctor ${targetPath}\` if you suspect the Claude runtime interrupted onboarding.`,
    );
    return lines.join("\n");
  }

  lines.push(
    "A brand-new project needs one request-bearing onboarding command so Claude can classify the workflow profile in a single headless pass.",
    "",
    "Next:",
    "- Run `/dwemr start <request>` or `/dwemr plan <request>`.",
    "- `continue` and `what-now` do not carry enough project context to start onboarding from scratch.",
  );
  return lines.join("\n");
}

export function formatOnboardingBlocked(targetPath: string, action: string, project: ProjectHealth) {
  return [
    `DWEMR cannot run \`${action}\` in ${targetPath} before onboarding is complete.`,
    "",
    "Stage-isolated commands are blocked until the project has a selected workflow profile and the required packs are provisioned.",
    "",
    "Next:",
    hasSavedClarificationBatch(project.onboardingState)
      ? "- Answer the saved clarification with `/dwemr start <response>` first."
      : "- Run `/dwemr start <request>` or `/dwemr plan <request>` first.",
  ].join("\n");
}
