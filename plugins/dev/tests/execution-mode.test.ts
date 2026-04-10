import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeProject } from "../../dwemr/src/control-plane/project-assets";
import {
  normalizeExecutionModeInput,
  normalizeProjectSizeInput,
  parseProjectExecutionMode,
  parseProjectSize,
  setProjectSize,
  setProjectExecutionMode,
  updateProjectSize,
  updateProjectExecutionMode,
} from "../../dwemr/src/control-plane/project-config";
import { syncPipelineExecutionMode } from "../../dwemr/src/control-plane/pipeline-state";

async function makeTempProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dwemr-execution-mode-"));
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

test("normalizeExecutionModeInput accepts CLI shorthand and canonical values", () => {
  assert.equal(normalizeExecutionModeInput("auto"), "autonomous");
  assert.equal(normalizeExecutionModeInput("autonomous"), "autonomous");
  assert.equal(normalizeExecutionModeInput("checkpointed"), "checkpointed");
  assert.equal(normalizeExecutionModeInput("unset"), undefined);
  assert.equal(normalizeExecutionModeInput("something-else"), undefined);
});

test("project size helpers accept supported profile values and ignore unset", () => {
  assert.equal(normalizeProjectSizeInput("minimal_tool"), "minimal_tool");
  assert.equal(normalizeProjectSizeInput("standard_app"), "standard_app");
  assert.equal(normalizeProjectSizeInput("unset"), undefined);
  assert.equal(normalizeProjectSizeInput("something-else"), undefined);
});

test("bootstrap config starts with reduced onboarding-owned unset fields", async () => {
  const sandbox = await makeTempProject();
  try {
    const configPath = path.join(sandbox.projectPath, ".dwemr/project-config.yaml");
    const original = await readFile(configPath, "utf8");

    assert.match(original, /^project:\s*$/m);
    assert.match(original, /^\s{2}size: unset$/m);
    assert.doesNotMatch(original, /^\s{2}planning_depth:/m);
    assert.doesNotMatch(original, /^\s{2}docs_level:/m);
    assert.doesNotMatch(original, /^\s{2}qa_level:/m);
    assert.match(original, /execution_mode: unset/);
    assert.match(original, /git_mode: unset/);
    assert.match(original, /github: unset/);
    assert.match(original, /remote_push: unset/);
    assert.match(original, /pull_requests: unset/);
    assert.match(original, /ci: disabled/);
    assert.match(original, /merge: unset/);
  } finally {
    await sandbox.cleanup();
  }
});

test("project config execution mode helpers read and write the delivery.execution_mode field", async () => {
  const sandbox = await makeTempProject();
  try {
    const configPath = path.join(sandbox.projectPath, ".dwemr/project-config.yaml");
    const original = await readFile(configPath, "utf8");

    assert.equal(parseProjectExecutionMode(original), "autonomous");

    const updated = setProjectExecutionMode(original, "checkpointed");
    assert.match(updated, /execution_mode: checkpointed/);

    await updateProjectExecutionMode(sandbox.projectPath, "checkpointed");
    const persisted = await readFile(configPath, "utf8");
    assert.equal(parseProjectExecutionMode(persisted), "checkpointed");

    assert.equal(parseProjectExecutionMode(persisted.replace("execution_mode: checkpointed", 'execution_mode: "autonomous"')), "autonomous");
  } finally {
    await sandbox.cleanup();
  }
});

test("project config size helpers read and write the canonical project.size field", async () => {
  const sandbox = await makeTempProject();
  try {
    const configPath = path.join(sandbox.projectPath, ".dwemr/project-config.yaml");
    const original = await readFile(configPath, "utf8");

    assert.equal(parseProjectSize(original), undefined);

    const updated = setProjectSize(original, "minimal_tool");
    assert.match(updated, /size: minimal_tool/);

    await updateProjectSize(sandbox.projectPath, "standard_app");
    const persisted = await readFile(configPath, "utf8");
    assert.equal(parseProjectSize(persisted), "standard_app");
  } finally {
    await sandbox.cleanup();
  }
});

test("syncPipelineExecutionMode rewrites canonical pipeline execution mode", async () => {
  const sandbox = await makeTempProject();
  try {
    const pipelinePath = path.join(sandbox.projectPath, ".dwemr/state/pipeline-state.md");
    await syncPipelineExecutionMode(sandbox.projectPath, "checkpointed");

    const pipeline = await readFile(pipelinePath, "utf8");
    assert.match(pipeline, /execution_mode: "checkpointed"/);

    await writeFile(pipelinePath, pipeline.replace(/execution_mode: "checkpointed"/, 'execution_mode: "autonomous"'), "utf8");
    await syncPipelineExecutionMode(sandbox.projectPath, "checkpointed");
    const refreshed = await readFile(pipelinePath, "utf8");
    assert.match(refreshed, /execution_mode: "checkpointed"/);
  } finally {
    await sandbox.cleanup();
  }
});
