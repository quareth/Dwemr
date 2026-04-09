import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatOverwriteConfirmation, initializeProject, inspectProjectHealth, provisionProjectProfile } from "../../dwemr/src/control-plane/project-assets";
import { writeOnboardingState } from "../../dwemr/src/control-plane/onboarding-state";
import { updateProjectSize } from "../../dwemr/src/control-plane/project-config";
import { DWEMR_CONTRACT_VERSION } from "../../dwemr/src/control-plane/state-contract";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.resolve(testDir, "../../dwemr/templates");
const retiredTeamMemoryPaths = [
  ".dwemr/memory/teams/implementation/agenda.md",
  ".dwemr/memory/teams/implementation/journal.md",
  ".dwemr/memory/teams/managers/agenda.md",
  ".dwemr/memory/teams/managers/journal.md",
  ".dwemr/memory/teams/orchestration/agenda.md",
  ".dwemr/memory/teams/orchestration/journal.md",
  ".dwemr/memory/teams/planning/agenda.md",
  ".dwemr/memory/teams/planning/journal.md",
  ".dwemr/memory/teams/qa/agenda.md",
  ".dwemr/memory/teams/qa/journal.md",
];

async function makeTempProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dwemr-contract-"));
  const projectPath = path.join(root, "project");
  return {
    root,
    projectPath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("inspectProjectHealth accepts the current authoritative contract", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);

    const project = await inspectProjectHealth(sandbox.projectPath);
    assert.equal(project.installState, "bootstrap_only");
    assert.deepEqual(project.contractIssues, []);

    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/memory/global/project-intent.md"), "utf8"));
    const promptEnhancer = await readFile(path.join(sandbox.projectPath, ".claude/agents/prompt-enhancer.md"), "utf8");
    assert.match(promptEnhancer, /Prompt Enhancer/i);
    const pipelineState = await readFile(path.join(sandbox.projectPath, ".dwemr/state/pipeline-state.md"), "utf8");
    assert.match(pipelineState, /current_owner: "none"/);
    assert.match(pipelineState, /return_owner: "none"/);
    assert.match(pipelineState, /stage_status: "idle"/);
    assert.match(pipelineState, /current_step_kind: "none"/);
    assert.match(pipelineState, /current_step_status: "none"/);
    assert.match(pipelineState, /current_step_id: ""/);
    assert.match(pipelineState, /active_guide_path: ""/);
    assert.match(pipelineState, /last_acknowledged_report_id: ""/);
    assert.match(pipelineState, /last_acknowledged_report_owner: "none"/);
    assert.match(pipelineState, /last_acknowledged_at: ""/);
    const executionState = await readFile(path.join(sandbox.projectPath, ".dwemr/state/execution-state.md"), "utf8");
    assert.match(executionState, /report_id: ""/);
    assert.match(executionState, /supersedes_report_id: ""/);
    assert.match(executionState, /scope_type: "none"/);
    assert.match(executionState, /scope_ref: ""/);
    assert.match(executionState, /report_owner: "none"/);
    assert.match(executionState, /report_status: "idle"/);
    assert.match(executionState, /outcome_summary: ""/);
    assert.match(executionState, /blocking_reason: ""/);
    const implementationState = await readFile(path.join(sandbox.projectPath, ".dwemr/state/implementation-state.md"), "utf8");
    assert.match(implementationState, /feature_id: "none"/);
    assert.match(implementationState, /guide: ""/);
    assert.match(implementationState, /phase: ""/);
    assert.match(implementationState, /task: ""/);
    assert.match(implementationState, /active_worker: "none"/);
    assert.match(implementationState, /worker_status: "idle"/);
    assert.match(implementationState, /attempt_id: ""/);
    assert.match(implementationState, /changed_files: \[\]/);
    assert.match(implementationState, /verification_commands: \[\]/);
    assert.match(implementationState, /verification_summary: ""/);
    assert.match(implementationState, /reviewer_verdict: ""/);
    assert.match(implementationState, /review_findings_ref: ""/);
    assert.match(implementationState, /updated_at: ""/);
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/state/release-state.md"), "utf8"));
    const implementationStateExample = await readFile(path.join(sandbox.projectPath, ".dwemr/state/implementation-state.example.md"), "utf8");
    assert.match(implementationStateExample, new RegExp(`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}`));
    assert.match(implementationStateExample, /feature_id: "none"/i);
    assert.match(implementationStateExample, /active_worker: "none"/i);
    assert.match(implementationStateExample, /worker_status: "idle"/i);
    assert.match(implementationStateExample, /attempt_id: ""/i);
    assert.match(implementationStateExample, /verification_commands: \[\]/i);
    assert.match(implementationStateExample, /review_findings_ref: ""/i);
    assert.match(implementationStateExample, /implementation-lane local task packet and worker-loop detail/i);
    assert.match(implementationStateExample, /manager-acknowledged task acceptance still belongs in `?pipeline-state\.md`?/i);
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/memory/global/active-feature.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/memory/global/checkpoints.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/memory/global/feature-registry.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/memory/global/latest-status.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/memory/global/test-results.md"), "utf8"));
    for (const relativePath of retiredTeamMemoryPaths) {
      await assert.rejects(() => readFile(path.join(sandbox.projectPath, relativePath), "utf8"));
    }
    const waveStateExample = await readFile(path.join(sandbox.projectPath, ".dwemr/state/wave-state.example.md"), "utf8");
    assert.match(waveStateExample, new RegExp(`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}`));
    assert.match(waveStateExample, /\.dwemr\/waves\/<wave-id>\/wave-state\.md/i);
    assert.match(waveStateExample, /implementation_guide_path/i);
    assert.match(waveStateExample, /`execution-state\.md`: global checkpoint and resume surface/i);
    assert.match(waveStateExample, /active_planning_worker: "none"/i);
    assert.match(waveStateExample, /planning_artifact_in_progress: "none"/i);
    assert.match(waveStateExample, /planning_worker_status: "idle"/i);
    assert.match(waveStateExample, /wave_doc_path: ""/i);
    assert.match(waveStateExample, /epic_doc_path: ""/i);
    assert.match(waveStateExample, /`implementation-state\.md`: implementation-lane local task packet and worker-loop detail/i);
    assert.match(waveStateExample, /`blocked_reason`:/i);
    assert.match(waveStateExample, /`updated_at`:/i);
    assert.match(waveStateExample, /Do not use this file as the global resumability checkpoint/i);
    assert.doesNotMatch(waveStateExample, /current_phase/i);
    assert.doesNotMatch(waveStateExample, /current_task/i);
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/memory/global/prompt.md"), "utf8"));
  } finally {
    await sandbox.cleanup();
  }
});

test("inspectProjectHealth flags missing or mismatched authoritative contract versions", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);

    const pipelineStatePath = path.join(sandbox.projectPath, ".dwemr/state/pipeline-state.md");
    const onboardingStatePath = path.join(sandbox.projectPath, ".dwemr/state/onboarding-state.md");
    const pipelineState = await readFile(pipelineStatePath, "utf8");
    const onboardingState = await readFile(onboardingStatePath, "utf8");

    await writeFile(pipelineStatePath, pipelineState.replace(/^dwemr_contract_version: \d+\n/m, ""), "utf8");
    await writeFile(
      onboardingStatePath,
      onboardingState.replace(/^dwemr_contract_version: \d+\n/m, "dwemr_contract_version: 1\n"),
      "utf8",
    );

    const project = await inspectProjectHealth(sandbox.projectPath);
    assert.equal(project.installState, "unsupported_contract");
    assert.ok(project.contractIssues.join("\n").includes(`.dwemr/state/pipeline-state.md: missing \`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}\``));
    assert.ok(project.contractIssues.join("\n").includes(`.dwemr/state/onboarding-state.md: found contract version 1, expected ${DWEMR_CONTRACT_VERSION}`));
  } finally {
    await sandbox.cleanup();
  }
});

test("inspectProjectHealth validates the active wave-state contract when pipeline-state points to one", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);

    const pipelineStatePath = path.join(sandbox.projectPath, ".dwemr/state/pipeline-state.md");
    const activeWaveStatePath = ".dwemr/waves/wave-1/wave-state.md";
    const pipelineState = await readFile(pipelineStatePath, "utf8");

    await writeFile(
      pipelineStatePath,
      pipelineState.replace(/^active_wave_state_path: ""$/m, `active_wave_state_path: "${activeWaveStatePath}"`),
      "utf8",
    );

    let project = await inspectProjectHealth(sandbox.projectPath);
    assert.equal(project.installState, "unsupported_contract");
    assert.ok(project.contractIssues.join("\n").includes(`${activeWaveStatePath}: missing authoritative active wave-state file`));

    const absoluteWaveStatePath = path.join(sandbox.projectPath, activeWaveStatePath);
    await mkdir(path.dirname(absoluteWaveStatePath), { recursive: true });
    await writeFile(absoluteWaveStatePath, "---\ndwemr_contract_version: 1\n---\n", "utf8");

    project = await inspectProjectHealth(sandbox.projectPath);
    assert.equal(project.installState, "unsupported_contract");
    assert.ok(
      project.contractIssues
        .join("\n")
        .includes(`${activeWaveStatePath}: found contract version 1, expected ${DWEMR_CONTRACT_VERSION}`),
    );
  } finally {
    await sandbox.cleanup();
  }
});

test("formatOverwriteConfirmation warns that overwrite recreates the target folder from scratch", () => {
  const text = formatOverwriteConfirmation("/tmp/dwemr-project");

  assert.match(text, /without explicit confirmation/);
  assert.match(text, /deletes the existing target project folder contents/i);
  assert.match(text, /--overwrite --confirm-overwrite/);
});

test("init overwrite recreates a brand-new bootstrap install", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);
    await writeOnboardingState(sandbox.projectPath, {
      status: "pending",
      selectedProfile: "minimal_tool",
      selectedPacks: ["profile-minimal-tool"],
      requiredArtifacts: ["implementation_guide"],
      installStage: "profile_installed",
    });
    await provisionProjectProfile(sandbox.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "start",
      requestContext: "Build a bounded internal tool.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "minimal_tool",
      planningMode: "implementation_guide_only",
      docsMode: "minimal",
      qaMode: "minimal",
      needsProductFraming: false,
      selectedPacks: ["profile-minimal-tool"],
      requiredArtifacts: ["implementation_guide"],
      installStage: "profile_installed",
      updatedAt: new Date().toISOString(),
    });

    const managedFilePath = path.join(sandbox.projectPath, ".claude/agents/implementation-manager.md");
    const customFilePath = path.join(sandbox.projectPath, "custom-user-file.txt");
    await writeFile(managedFilePath, "BROKEN\n", "utf8");
    await writeFile(customFilePath, "SHOULD_BE_REMOVED\n", "utf8");

    const summary = await initializeProject(sandbox.projectPath, true);
    const project = await inspectProjectHealth(sandbox.projectPath);
    const onboardingState = await readFile(path.join(sandbox.projectPath, ".dwemr/state/onboarding-state.md"), "utf8");

    assert.equal(project.installState, "bootstrap_only");
    assert.deepEqual(project.contractIssues, []);
    await assert.rejects(() => readFile(managedFilePath, "utf8"));
    await assert.rejects(() => readFile(customFilePath, "utf8"));
    assert.match(onboardingState, /status: "pending"/);
    assert.doesNotMatch(summary, /profile-minimal-tool/);
  } finally {
    await sandbox.cleanup();
  }
});

test("provisionProjectProfile uses canonical project.size for pack loading and syncs onboarding state", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);
    await updateProjectSize(sandbox.projectPath, "standard_app");

    const provisioned = await provisionProjectProfile(sandbox.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "start",
      requestContext: "Build a bounded internal tool.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "minimal_tool",
      planningMode: "implementation_guide_only",
      docsMode: "minimal",
      qaMode: "minimal",
      needsProductFraming: false,
      selectedPacks: [],
      requiredArtifacts: ["implementation_guide"],
      installStage: "provisioning_pending",
      updatedAt: new Date().toISOString(),
    });

    assert.deepEqual(provisioned.packNames, ["profile-minimal-tool", "profile-standard-app"]);

    const onboardingState = await readFile(path.join(sandbox.projectPath, ".dwemr/state/onboarding-state.md"), "utf8");
    assert.match(onboardingState, /selected_profile: "standard_app"/);

    const project = await inspectProjectHealth(sandbox.projectPath);
    assert.equal(project.canonicalProfile, "standard_app");
  } finally {
    await sandbox.cleanup();
  }
});

test("provisionProjectProfile creates release-state for git-enabled workflows only", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);

    const configPath = path.join(sandbox.projectPath, ".dwemr/project-config.yaml");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config
        .replace(/^  git_mode: unset$/m, "  git_mode: auto")
        .replace(/^  github: unset$/m, "  github: available")
        .replace(/^  remote_push: unset$/m, "  remote_push: enabled")
        .replace(/^  pull_requests: unset$/m, "  pull_requests: enabled")
        .replace(/^  ci: unset$/m, "  ci: disabled")
        .replace(/^  merge: unset$/m, "  merge: manual"),
      "utf8",
    );

    await provisionProjectProfile(sandbox.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "start",
      requestContext: "Build a bounded internal tool.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "minimal_tool",
      planningMode: "implementation_guide_only",
      docsMode: "minimal",
      qaMode: "minimal",
      needsProductFraming: false,
      selectedPacks: [],
      requiredArtifacts: ["implementation_guide"],
      installStage: "provisioning_pending",
      updatedAt: new Date().toISOString(),
    });

    const releaseState = await readFile(path.join(sandbox.projectPath, ".dwemr/state/release-state.md"), "utf8");
    assert.match(releaseState, new RegExp(`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}`));
    assert.match(releaseState, /feature_id: "none"/);
    assert.match(releaseState, /git_enabled: false/);
    assert.match(releaseState, /git_mode: "auto"/);
    assert.match(releaseState, /release_stage: "none"/);
    assert.match(releaseState, /last_release_action: ""/);
    assert.match(releaseState, /traceability-only/i);
    assert.match(releaseState, /does not affect pipeline routing, execution checkpoints, or resume decisions/i);
  } finally {
    await sandbox.cleanup();
  }
});

test("provisionProjectProfile does not create release-state for local-only workflows", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);

    const configPath = path.join(sandbox.projectPath, ".dwemr/project-config.yaml");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config
        .replace(/^  git_mode: unset$/m, "  git_mode: disabled")
        .replace(/^  github: unset$/m, "  github: not_available")
        .replace(/^  remote_push: unset$/m, "  remote_push: disabled")
        .replace(/^  pull_requests: unset$/m, "  pull_requests: disabled")
        .replace(/^  ci: unset$/m, "  ci: disabled")
        .replace(/^  merge: unset$/m, "  merge: disabled"),
      "utf8",
    );

    await provisionProjectProfile(sandbox.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "start",
      requestContext: "Build a bounded internal tool.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "minimal_tool",
      planningMode: "implementation_guide_only",
      docsMode: "minimal",
      qaMode: "minimal",
      needsProductFraming: false,
      selectedPacks: [],
      requiredArtifacts: ["implementation_guide"],
      installStage: "provisioning_pending",
      updatedAt: new Date().toISOString(),
    });

    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".dwemr/state/release-state.md"), "utf8"));
  } finally {
    await sandbox.cleanup();
  }
});

test("provisionProjectProfile installs standard-app manager prompt overrides onto canonical paths", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);

    await provisionProjectProfile(sandbox.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "start",
      requestContext: "Build a multi-step app with auth and backend phases.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "standard_app",
      planningMode: "full",
      docsMode: "standard",
      qaMode: "standard",
      needsProductFraming: true,
      selectedPacks: [],
      requiredArtifacts: ["implementation_guide"],
      installStage: "provisioning_pending",
      updatedAt: new Date().toISOString(),
    });

    const installedDeliveryManager = await readFile(
      path.join(sandbox.projectPath, ".claude/agents/delivery-manager.md"),
      "utf8",
    );
    const installedPlanningManager = await readFile(
      path.join(sandbox.projectPath, ".claude/agents/planning-manager.md"),
      "utf8",
    );
    const installedProductManager = await readFile(
      path.join(sandbox.projectPath, ".claude/agents/product-manager.md"),
      "utf8",
    );
    const installedWaveManager = await readFile(
      path.join(sandbox.projectPath, ".claude/agents/wave-manager.md"),
      "utf8",
    );
    const installedWavePlanner = await readFile(
      path.join(sandbox.projectPath, ".claude/agents/wave-planner.md"),
      "utf8",
    );
    const installedWaveCreator = await readFile(
      path.join(sandbox.projectPath, ".claude/agents/wave-creator.md"),
      "utf8",
    );
    const standardAppDeliveryManager = await readFile(
      path.join(templateRoot, ".claude/agents/delivery-manager-standard-app.md"),
      "utf8",
    );
    const standardAppPlanningManager = await readFile(
      path.join(templateRoot, ".claude/agents/planning-manager-standard-app.md"),
      "utf8",
    );
    const standardAppProductManager = await readFile(
      path.join(templateRoot, ".claude/agents/product-manager-standard-app.md"),
      "utf8",
    );
    const standardAppWaveManager = await readFile(
      path.join(templateRoot, ".claude/agents/wave-manager.md"),
      "utf8",
    );
    const standardAppWavePlanner = await readFile(
      path.join(templateRoot, ".claude/agents/wave-planner.md"),
      "utf8",
    );
    const standardAppWaveCreator = await readFile(
      path.join(templateRoot, ".claude/agents/wave-creator.md"),
      "utf8",
    );

    assert.equal(installedDeliveryManager, standardAppDeliveryManager);
    assert.equal(installedPlanningManager, standardAppPlanningManager);
    assert.equal(installedProductManager, standardAppProductManager);
    assert.equal(installedWaveManager, standardAppWaveManager);
    assert.equal(installedWavePlanner, standardAppWavePlanner);
    assert.equal(installedWaveCreator, standardAppWaveCreator);
  } finally {
    await sandbox.cleanup();
  }
});

test("standard-app-focused-planning remains provisionable without project-manager assets", async () => {
  const sandbox = await makeTempProject();
  try {
    await initializeProject(sandbox.projectPath, false);

    const provisioned = await provisionProjectProfile(sandbox.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "plan",
      requestContext: "Plan a multi-step app with a focused architecture pass.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "standard_app",
      planningMode: "full",
      docsMode: "standard",
      qaMode: "standard",
      needsProductFraming: true,
      selectedPacks: ["standard-app-focused-planning"],
      requiredArtifacts: ["implementation_guide"],
      installStage: "provisioning_pending",
      updatedAt: new Date().toISOString(),
    });

    assert.deepEqual(provisioned.packNames, [
      "profile-minimal-tool",
      "profile-standard-app",
      "standard-app-focused-planning",
    ]);

    for (const relativePath of retiredTeamMemoryPaths) {
      await assert.rejects(() => readFile(path.join(sandbox.projectPath, relativePath), "utf8"));
    }
    await assert.rejects(() => readFile(path.join(sandbox.projectPath, ".claude/agents/project-manager.md"), "utf8"));
  } finally {
    await sandbox.cleanup();
  }
});

test("minimal and standard profiles do not provision retired team memory or retired QA compatibility assets", async () => {
  const minimal = await makeTempProject();
  const standard = await makeTempProject();

  try {
    await initializeProject(minimal.projectPath, false);
    await provisionProjectProfile(minimal.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "start",
      requestContext: "Build a bounded internal tool.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "minimal_tool",
      planningMode: "implementation_guide_only",
      docsMode: "minimal",
      qaMode: "minimal",
      needsProductFraming: false,
      selectedPacks: [],
      requiredArtifacts: ["implementation_guide"],
      installStage: "provisioning_pending",
      updatedAt: new Date().toISOString(),
    });

    await assert.rejects(() => readFile(path.join(minimal.projectPath, ".claude/commands/delivery-qa.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(minimal.projectPath, ".claude/agents/qa-manager.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(minimal.projectPath, ".claude/agents/tester.md"), "utf8"));
    for (const relativePath of retiredTeamMemoryPaths) {
      await assert.rejects(() => readFile(path.join(minimal.projectPath, relativePath), "utf8"));
    }

    await initializeProject(standard.projectPath, false);
    await provisionProjectProfile(standard.projectPath, {
      contractVersion: DWEMR_CONTRACT_VERSION,
      status: "complete",
      entryAction: "start",
      requestContext: "Build a multi-step app with auth and backend phases.",
      clarificationSummary: "",
      clarificationQuestions: [],
      clarificationResponse: "",
      selectedProfile: "standard_app",
      planningMode: "full",
      docsMode: "standard",
      qaMode: "standard",
      needsProductFraming: true,
      selectedPacks: [],
      requiredArtifacts: ["implementation_guide"],
      installStage: "provisioning_pending",
      updatedAt: new Date().toISOString(),
    });

    await assert.rejects(() => readFile(path.join(standard.projectPath, ".claude/commands/delivery-qa.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(standard.projectPath, ".claude/agents/qa-manager.md"), "utf8"));
    await assert.rejects(() => readFile(path.join(standard.projectPath, ".claude/agents/tester.md"), "utf8"));
    for (const relativePath of retiredTeamMemoryPaths) {
      await assert.rejects(() => readFile(path.join(standard.projectPath, relativePath), "utf8"));
    }
  } finally {
    await minimal.cleanup();
    await standard.cleanup();
  }
});
