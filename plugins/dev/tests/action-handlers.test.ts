import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  handleEmptyCommand,
  handleHelp,
  handleProjects,
  handleUse,
  handleStop,
  handleInit,
  handleDoctor,
  handleGit,
  handleMode,
  handleModelConfig,
  handleGenericRouted,
  formatStopResult,
} from "../../dwemr/src/openclaw/action-handlers";
import { initializeProject, provisionProjectProfile } from "../../dwemr/src/control-plane/project-assets";
import { updateProjectExecutionMode } from "../../dwemr/src/control-plane/project-config";
import { writeOnboardingState } from "../../dwemr/src/control-plane/onboarding-state";
import { DWEMR_CONTRACT_VERSION } from "../../dwemr/src/control-plane/state-contract";
import { makeFakeApiContext, type FakeApiContext } from "./fixtures/fake-api";

async function makeTempProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dwemr-action-handler-"));
  const projectPath = path.join(root, "project");
  await initializeProject(projectPath, false);
  return {
    root,
    projectPath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function makeProvisionedProject() {
  const sandbox = await makeTempProject();
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
    installStage: "provisioning_pending",
    updatedAt: new Date().toISOString(),
  });
  return sandbox;
}

function getText(result: { content: [{ type: "text"; text: string }] }) {
  return result.content[0].text;
}

// ── Simple handlers ────────────────────────────────────────────────────

test("handleEmptyCommand returns runner help", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleEmptyCommand(ctx);
    const text = getText(result);
    assert.match(text, /DWEMR commands:/);
    assert.match(text, /\/dwemr help/);
  } finally {
    await ctx.cleanup();
  }
});

test("handleHelp returns formatted help text", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleHelp(ctx);
    const text = getText(result);
    assert.match(text, /DWEMR commands:/);
    assert.match(text, /doctor.*inspect the managed DWEMR runtime/);
    assert.match(text, /init.*install the DWEMR bootstrap kit/);
  } finally {
    await ctx.cleanup();
  }
});

test("handleHelp includes active project path when set", async () => {
  const ctx = await makeFakeApiContext({ defaultProjectPath: "/tmp/test-project" });
  try {
    const result = await handleHelp(ctx);
    const text = getText(result);
    assert.match(text, /Active DWEMR project: \/tmp\/test-project/);
  } finally {
    await ctx.cleanup();
  }
});

test("handleProjects returns project list", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleProjects(ctx);
    const text = getText(result);
    assert.match(text, /DWEMR remembered projects:/);
  } finally {
    await ctx.cleanup();
  }
});

// ── handleUse ──────────────────────────────────────────────────────────

test("handleUse with valid initialized path remembers the project", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleUse(ctx, ["use", sandbox.projectPath]);
    const text = getText(result);
    assert.match(text, /Active DWEMR project set to/);
    assert.ok(text.includes(sandbox.projectPath));
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleUse with nonexistent path returns error", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleUse(ctx, ["use", "/tmp/does-not-exist-dwemr-test"]);
    const text = getText(result);
    assert.match(text, /Project path does not exist/);
  } finally {
    await ctx.cleanup();
  }
});

test("handleUse with no path shows help", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleUse(ctx, ["use"]);
    const text = getText(result);
    assert.match(text, /Usage: \/dwemr use <path>/);
  } finally {
    await ctx.cleanup();
  }
});

// ── handleStop ─────────────────────────────────────────────────────────

test("handleStop with no active run returns not_found message", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleStop(ctx, ["stop"]);
    const text = getText(result);
    assert.match(text, /No active OpenClaw-managed DWEMR run is currently registered/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleStop with no project path returns error", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleStop(ctx, ["stop"]);
    const text = getText(result);
    assert.match(text, /Project path is required/);
  } finally {
    await ctx.cleanup();
  }
});

// ── handleInit ─────────────────────────────────────────────────────────

test("handleInit creates a new project", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dwemr-init-handler-"));
  const targetPath = path.join(root, "new-project");
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleInit(ctx, ["init", targetPath]);
    const text = getText(result);
    assert.match(text, /Initialized DWEMR bootstrap assets/);
    assert.match(text, /Remembered .* as the active DWEMR project/);
  } finally {
    await ctx.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});

test("handleInit with overwrite but no confirm returns warning", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleInit(ctx, ["init", sandbox.projectPath, "--overwrite"]);
    const text = getText(result);
    assert.match(text, /without explicit confirmation/);
    assert.match(text, /--confirm-overwrite/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleInit with no path and no default shows help", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleInit(ctx, ["init"]);
    const text = getText(result);
    assert.match(text, /Usage: \/dwemr init <path>/);
  } finally {
    await ctx.cleanup();
  }
});

// ── handleDoctor ───────────────────────────────────────────────────────

test("handleDoctor returns diagnostic report", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleDoctor(ctx, ["doctor"]);
    const text = getText(result);
    assert.match(text, /DWEMR doctor/);
    assert.match(text, /Runtime:/);
    assert.match(text, /Runtime ledger:/);
    assert.match(text, /Project:/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

// ── handleGit ──────────────────────────────────────────────────────────

test("handleGit disable on initialized project disables git", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleGit(ctx, ["git", "disable"]);
    const text = getText(result);
    assert.match(text, /Git has been disabled/);
    assert.ok(text.includes(sandbox.projectPath));

    const config = await readFile(path.join(sandbox.projectPath, ".dwemr/project-config.yaml"), "utf8");
    assert.match(config, /git_mode: disabled/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleGit without subcommand shows usage", async () => {
  const ctx = await makeFakeApiContext({ defaultProjectPath: "/tmp/whatever" });
  try {
    const result = await handleGit(ctx, ["git"]);
    const text = getText(result);
    assert.match(text, /Usage: \/dwemr git disable/);
  } finally {
    await ctx.cleanup();
  }
});

test("handleGit with no active project returns error", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleGit(ctx, ["git", "disable"]);
    const text = getText(result);
    assert.match(text, /No active project/);
  } finally {
    await ctx.cleanup();
  }
});

// ── handleMode ─────────────────────────────────────────────────────────

test("handleMode sets autonomous mode", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleMode(ctx, ["mode", "auto"]);
    const text = getText(result);
    assert.match(text, /execution mode .* is now `autonomous`/);
    assert.match(text, /CLI shorthand `auto` maps to the stored mode `autonomous`/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleMode sets checkpointed mode", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleMode(ctx, ["mode", "checkpointed"]);
    const text = getText(result);
    assert.match(text, /execution mode .* is now `checkpointed`/);
    assert.match(text, /stop and report before waiting/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleMode with invalid mode returns error", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleMode(ctx, ["mode", "turbo"]);
    const text = getText(result);
    assert.match(text, /Unknown execution mode: turbo/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleMode with no active project returns error", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleMode(ctx, ["mode", "auto"]);
    const text = getText(result);
    assert.match(text, /no active project/);
  } finally {
    await ctx.cleanup();
  }
});

test("handleMode with no arguments shows help", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleMode(ctx, ["mode"]);
    const text = getText(result);
    assert.match(text, /Usage: \/dwemr mode <auto\|checkpointed>/);
  } finally {
    await ctx.cleanup();
  }
});

// ── handleModelConfig ──────────────────────────────────────────────────

test("handleModelConfig lists models when no selection given", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleModelConfig(ctx, ["model"]);
    const text = getText(result);
    assert.match(text, /DWEMR main model for/);
    assert.match(text, /Claude Haiku 4\.5/);
    assert.match(text, /Claude Sonnet 4\.6/);
    assert.match(text, /Claude Opus 4\.6/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleModelConfig selects model by number", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleModelConfig(ctx, ["model", "2"]);
    const text = getText(result);
    assert.match(text, /main model .* is now `Claude Sonnet 4\.6/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleModelConfig unsets model", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleModelConfig(ctx, ["model", "unset"]);
    const text = getText(result);
    assert.match(text, /Cleared main model/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleModelConfig with invalid number returns error", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleModelConfig(ctx, ["model", "99"]);
    const text = getText(result);
    assert.match(text, /Invalid selection/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleModelConfig lists effort levels", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleModelConfig(ctx, ["effort"]);
    const text = getText(result);
    assert.match(text, /DWEMR effort level for/);
    assert.match(text, /auto/);
    assert.match(text, /high/);
    assert.match(text, /max/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleModelConfig with no active project returns error", async () => {
  const ctx = await makeFakeApiContext();
  try {
    const result = await handleModelConfig(ctx, ["model"]);
    const text = getText(result);
    assert.match(text, /No active project/);
  } finally {
    await ctx.cleanup();
  }
});

// ── handleGenericRouted early-return paths ──────────────────────────────

test("handleGenericRouted returns error for unknown action", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleGenericRouted(ctx, ["bogus"]);
    const text = getText(result);
    assert.match(text, /Unknown DWEMR action: bogus/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleGenericRouted blocks implement before onboarding", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleGenericRouted(ctx, ["implement"]);
    const text = getText(result);
    assert.match(text, /cannot run `implement`.*before onboarding is complete/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleGenericRouted blocks release before onboarding", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleGenericRouted(ctx, ["release"]);
    const text = getText(result);
    assert.match(text, /cannot run `release`.*before onboarding is complete/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleGenericRouted returns bootstrap pending status for status action", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleGenericRouted(ctx, ["status"]);
    const text = getText(result);
    assert.match(text, /DWEMR status for/);
    assert.match(text, /Install state: bootstrap_only/);
    assert.match(text, /Active runtime owner:/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleGenericRouted surfaces pending onboarding for continue", async () => {
  const sandbox = await makeTempProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleGenericRouted(ctx, ["continue"]);
    const text = getText(result);
    assert.match(text, /cannot use `continue` as the first onboarding step/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

test("handleGenericRouted blocks release when git disabled on provisioned project", async () => {
  const sandbox = await makeProvisionedProject();
  const ctx = await makeFakeApiContext({ defaultProjectPath: sandbox.projectPath });
  try {
    const result = await handleGenericRouted(ctx, ["release"]);
    const text = getText(result);
    assert.match(text, /Git is not enabled/);
    assert.match(text, /`release` command requires git to be enabled/);
  } finally {
    await ctx.cleanup();
    await sandbox.cleanup();
  }
});

// ── formatStopResult ───────────────────────────────────────────────────

test("formatStopResult handles not_found status", () => {
  const text = formatStopResult({ status: "not_found", projectPath: "/tmp/test" });
  assert.match(text, /No active OpenClaw-managed DWEMR run/);
});

test("formatStopResult handles already_exited status", () => {
  const text = formatStopResult({
    status: "already_exited",
    run: {
      projectPath: "/tmp/test",
      pid: 12345,
      startedAt: new Date().toISOString(),
      action: "continue",
      claudeCommand: "/delivery-continue",
      sessionName: "dwemr-test",
      identity: {
        backendKind: "spawn",
        runId: "spawn:/tmp/test:12345:test",
        pid: 12345,
      },
    },
  });
  assert.match(text, /No active DWEMR runtime owner was still in flight/);
  assert.match(text, /Cleared the stale active-run record/);
});
