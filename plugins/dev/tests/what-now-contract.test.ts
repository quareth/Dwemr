import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dwemr");

function readRelative(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

import { translateClaudeCommandSurface } from "../../dwemr/src/openclaw/backend/claude-output";

test("delivery-what-now documents checkpoint-driven reasoning and stable summary fields", () => {
  const text = readRelative("templates/.claude/commands/delivery-what-now.md");
  const driver = readRelative("templates/.dwemr/reference/delivery-driver.md");

  assert.match(text, /determine onboarding\/install gating first/i);
  assert.match(text, /read `?\.dwemr\/state\/pipeline-state\.md`? for the active wave pointer and top-level stage/i);
  assert.match(text, /compare canonical manager state with `?\.dwemr\/state\/execution-state\.md`?/i);
  assert.match(text, /freshest global checkpoint and the manager that should reconcile it/i);
  assert.match(text, /read `?\.dwemr\/state\/implementation-state\.md`? as implementation-lane local supporting detail/i);
  assert.match(text, /execution-state\.md/);
  assert.match(text, /release-state\.md/);
  assert.doesNotMatch(text, /latest-status\.md/);
  assert.doesNotMatch(text, /active-feature\.md/);
  assert.doesNotMatch(text, /checkpoints\.md/);
  assert.doesNotMatch(text, /feature-registry\.md/);
  assert.match(text, /active_wave_state_path/i);
  assert.match(text, /wave-state\.md/i);
  assert.match(text, /The public command recommendation must come from the inferred next step, not from a broad static stage-to-command lookup\./);
  assert.match(text, /only as optional release trace context/i);
  assert.match(text, /never let narrative memory override onboarding, pipeline, implementation, execution, or active wave-state truth/i);
  assert.match(text, /reconstruct current progress in this order: onboarding-state -> pipeline-state -> execution-state -> active wave-state -> implementation-state -> retained narrative memory/i);
  assert.match(text, /if `execution_mode` is `autonomous` and `milestone_state: waiting_for_continue`, treat it as stale checkpoint metadata/i);
  assert.match(text, /Freshest checkpoint source:/);
  assert.match(text, /Recommended command:/);
  assert.match(text, /Why this command:/);
  assert.match(text, /Confidence: high \| medium \| low/);
  assert.doesNotMatch(text, /Use these default command recommendations when state already makes the next step clear:/);

  assert.match(driver, /execution-state\.md/);
  assert.doesNotMatch(driver, /checkpoints\.md/);
  assert.doesNotMatch(driver, /active-feature\.md/);
  assert.doesNotMatch(driver, /latest-status\.md/);
  assert.doesNotMatch(driver, /feature-registry\.md/);
  assert.match(driver, /Reconstruct current progress in this order:/);
  assert.match(driver, /retained narrative memory: optional context only; never override canonical state/i);
  assert.match(driver, /Prefer `?\/dwemr continue`? for active resumable work unless a narrower re-entry command is clearly safer\./);
  assert.match(driver, /Freshest checkpoint source/);
  assert.match(driver, /Why this command/);
});

test("delivery-what-now stays guidance-only and does not dispatch interviewer", () => {
  const text = readRelative("templates/.claude/commands/delivery-what-now.md");

  assert.match(text, /ENTRY_AGENT=NONE/);
  assert.match(text, /guidance-only/i);
  assert.match(text, /Do not dispatch `interviewer` or any other subagent/);
  assert.match(text, /Never auto-run the next owner from this command/);
});

test("shared guides assign next-step navigation to what-now and keep interviewer clarification-only", () => {
  const guide = readRelative("templates/CLAUDE.md");
  const registry = readRelative("templates/.dwemr/reference/subagent-registry.md");

  assert.match(guide, /\/delivery-what-now/);
  assert.match(guide, /`\/dwemr what-now` is the user-facing next-step compass/i);
  assert.match(guide, /read-only status-aware compass/i);
  assert.match(guide, /act as the user-facing "what now\?" surface/);
  assert.match(guide, /user asks “what now\?” or wants next-step navigation -> `\/delivery-what-now`/);
  assert.match(registry, /Not for read-only next-step navigation; the dedicated what-now command owns that compass surface\./i);
});

test("interviewer flow-clarification mode stays internal and defers navigation to what-now", () => {
  const text = readRelative("templates/.claude/agents/interviewer.md");

  assert.match(text, /shared clarification specialist for onboarding, internal flow clarification, and planning-time feature definition/i);
  assert.match(text, /Do not use this mode as the read-only "what now\?" helper/i);
  assert.match(text, /execution-state\.md/);
  assert.match(text, /Last completed step:/);
  assert.match(text, /Clarification needed because:/);
  assert.match(text, /Clarified route:/);
  assert.doesNotMatch(text, /single user-facing clarification authority/i);
  assert.doesNotMatch(text, /Recommended user-facing command:/);
});

test("flow docs separate what-now navigation from interviewer clarification", () => {
  const entryFlowPath = path.join(projectRoot, "../dev/docs/flows/entry-routing-flow.mmd");
  const pipelineFlowPath = path.join(projectRoot, "../dev/docs/flows/delivery-pipeline-flow.mmd");

  if (!existsSync(entryFlowPath) || !existsSync(pipelineFlowPath)) {
    return;
  }

  const entryFlow = readFileSync(entryFlowPath, "utf8");
  const pipelineFlow = readFileSync(pipelineFlowPath, "utf8");

  assert.match(entryFlow, /what-now stays read-only/i);
  assert.match(entryFlow, /run \/delivery-what-now compass only/i);
  assert.match(entryFlow, /without starting a new interview/i);
  assert.match(entryFlow, /Clarification stays separate from navigation/i);
  assert.doesNotMatch(entryFlow, /start or plan or continue or auto or what-now --> pending/);

  assert.match(pipelineFlow, /\/dwemr what-now stays outside this flow/i);
  assert.match(pipelineFlow, /read-only compass with no subagent dispatch/i);
  assert.match(pipelineFlow, /interviewer is optional clarification only/i);
  assert.match(pipelineFlow, /used inside planning when missing detail changes the route/i);
  assert.match(pipelineFlow, /Optional focused path<br\/>clarification via interviewer only when needed/i);
  assert.match(pipelineFlow, /planPath -- minimal_tool --> guideOnly --> planning/);
  assert.match(pipelineFlow, /planPath -- standard_app --> focused --> planning/);
});

test("internal Claude command names are translated back to DWEMR public commands", () => {
  const translated = translateClaudeCommandSurface(
    "Use /delivery-what-now, then /delivery-start Build a calculator, then /delivery-plan Sketch architecture, then /delivery-pr.",
  );

  assert.doesNotMatch(translated, /\/delivery-/);
  assert.match(translated, /\/dwemr what-now/);
  assert.match(translated, /\/dwemr start Build a calculator/);
  assert.match(translated, /\/dwemr plan Sketch architecture/);
  assert.match(translated, /\/dwemr pr/);
});
