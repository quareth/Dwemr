import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dwemr");

function readRelative(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function listRelativeFiles(relativePath: string): string[] {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return [];
  }
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const childRelativePath = path.posix.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(childRelativePath));
    } else {
      files.push(childRelativePath);
    }
  }

  return files;
}

test("shared guides define the state layers, resume trace order, and narrative-only memory", () => {
  const templateGuide = readRelative("templates/CLAUDE.md");
  const driver = readRelative("templates/.dwemr/reference/delivery-driver.md");

  for (const text of [templateGuide]) {
    assert.match(text, /onboarding-state\.md/i);
    assert.match(text, /authoritative for onboarding\/provisioning state/i);
    assert.match(text, /onboarding-state\.md.*gate first/i);
    assert.match(text, /pipeline-state\.md/i);
    assert.match(text, /execution-state\.md/i);
    assert.match(text, /implementation-state\.md/i);
    assert.match(text, /authoritative runtime core/i);
    assert.match(text, /\.dwemr\/waves\/<wave-id>\/wave-state\.md/i);
    assert.match(text, /active_wave_state_path/i);
    assert.match(text, /global resumability\/checkpoint surface/i);
    assert.match(text, /minimal global checkpoint surface during the transition/i);
    assert.match(text, /does not need to encode detailed wave phase or document progress/i);
    assert.match(text, /status and resume tracing/i);
    assert.match(text, /after that gate clears, follow this order/i);
    assert.match(text, /pipeline-state\.md` -> `.dwemr\/state\/execution-state\.md` -> active/i);
    assert.match(text, /memory\/\*\*.*never override canonical state/i);
    assert.match(text, /memory\/global\/prompt\.md/i);
    assert.match(text, /autonomous.*full delivery pipeline/i);
    assert.match(text, /do not create milestone waits/i);
    assert.match(text, /only in `?checkpointed`? mode/i);
    assert.match(text, /Wave-planning specialists use active `?wave-state\.md`? for wave-local planning progress/i);
    assert.match(text, /implementation-state\.md` is implementation-lane local supporting detail/i);
    assert.match(text, /Retained narrative memory is optional context only and must never override canonical state/i);
  }

  assert.match(driver, /onboarding-state\.md/i);
  assert.match(driver, /pipeline-state\.md/i);
  assert.match(driver, /execution-state\.md/i);
  assert.match(driver, /implementation-state\.md/i);
  assert.match(driver, /global routing pointer/i);
  assert.match(driver, /global checkpoint and resume surface/i);
  assert.match(driver, /active `?wave-state\.md`?: authoritative internal wave-flow state/i);
  assert.match(driver, /implementation-lane local task packet and loop detail/i);
  assert.match(driver, /Reconstruct current progress in this order:/i);
  assert.match(driver, /retained narrative memory: optional context only; never override canonical state/i);
});

test("delivery commands are canonical-first and treat narrative memory as optional context", () => {
  const status = readRelative("templates/.claude/commands/delivery-status.md");
  const cont = readRelative("templates/.claude/commands/delivery-continue.md");
  const whatNow = readRelative("templates/.claude/commands/delivery-what-now.md");
  const start = readRelative("templates/.claude/commands/delivery-start.md");
  const pr = readRelative("templates/.claude/commands/delivery-pr.md");
  const release = readRelative("templates/.claude/commands/delivery-release.md");

  assert.match(status, /Read .*pipeline-state\.md`,? and `?\.dwemr\/state\/execution-state\.md`? first/i);
  assert.match(status, /active_wave_state_path/i);
  assert.match(status, /wave-state\.md/i);
  assert.match(status, /optional release trace context/i);
  assert.match(status, /Narrative memory must never override canonical state/i);
  assert.match(status, /trace source order used for the answer/i);
  assert.match(status, /global checkpoint\/resume surface/i);
  assert.match(status, /implementation-lane local detail/i);
  assert.match(status, /last_acknowledged_report_id/i);
  assert.match(status, /pending_return_to/i);

  assert.match(cont, /Read .*pipeline-state\.md`,? and `?\.dwemr\/state\/execution-state\.md`? first/i);
  assert.match(cont, /active_wave_state_path/i);
  assert.match(cont, /wave-state\.md/i);
  assert.match(cont, /optional narrative context/i);
  assert.match(cont, /reconstruct current progress in this order/i);
  assert.match(cont, /Do not treat `?execution-state\.md`? as the detailed wave-planning ledger/i);
  assert.match(cont, /trust onboarding\/pipeline\/execution state first/i);
  assert.match(cont, /in `autonomous` mode, treat the pending milestone wait as stale checkpoint metadata/i);
  assert.match(cont, /implementation-lane local supporting detail/i);
  assert.match(cont, /report_id/i);
  assert.match(cont, /last_acknowledged_report_id/i);
  assert.match(cont, /pending_return_to/i);
  assert.match(cont, /do not shortcut into `?\/delivery-implement`?/i);

  assert.match(whatNow, /Read .*pipeline-state\.md`,? and `?\.dwemr\/state\/execution-state\.md`? first/i);
  assert.match(whatNow, /active_wave_state_path/i);
  assert.match(whatNow, /wave-state\.md/i);
  assert.match(whatNow, /only as optional release trace context/i);
  assert.match(whatNow, /freshest global checkpoint and the manager that should reconcile it/i);
  assert.match(whatNow, /implementation-lane local supporting detail/i);
  assert.match(whatNow, /reconstruct current progress in this order: onboarding-state -> pipeline-state -> execution-state -> active wave-state -> implementation-state -> retained narrative memory/i);
  assert.match(whatNow, /report_id/i);
  assert.match(whatNow, /last_acknowledged_report_id/i);
  assert.match(whatNow, /never let narrative memory override onboarding, pipeline, implementation, execution, or active wave-state truth/i);
  assert.match(whatNow, /if `execution_mode` is `autonomous` and `milestone_state: waiting_for_continue`, treat it as stale checkpoint metadata/i);

  assert.match(start, /Read .*onboarding-state\.md.*, .*pipeline-state\.md.*, and .*execution-state\.md.*first/i);
  assert.match(start, /active_wave_state_path/i);
  assert.match(start, /wave-state\.md/i);
  assert.match(start, /implementation-lane local supporting detail/i);
  assert.match(start, /optional narrative context/i);
  assert.match(start, /execution_mode/i);
  assert.match(start, /do not stop at `implementation_ready`, `phase_complete`, `feature_complete`, or `release_checkpoint`/);

  assert.match(pr, /onboarding-state\.md/i);
  assert.match(pr, /pipeline-state\.md/i);
  assert.match(pr, /execution-state\.md/i);
  assert.match(pr, /release-state\.md.*optional release trace context/i);
  assert.match(pr, /release-manager/i);
  assert.match(pr, /In autonomous mode, continue the PR lane through remediation routing and merge progression when allowed\./);

  assert.match(release, /onboarding-state\.md/i);
  assert.match(release, /pipeline-state\.md/i);
  assert.match(release, /execution-state\.md/i);
  assert.match(release, /release-state\.md.*optional release trace context/i);
  assert.match(release, /In `autonomous` mode, expect `release-manager` to continue through commit, push, PR, and merge progression/i);
});

test("active workflow references keep QA out of the routed command surface", () => {
  const templateGuide = readRelative("templates/CLAUDE.md");
  const driver = readRelative("templates/.dwemr/reference/delivery-driver.md");
  const suite = readRelative("templates/.dwemr/reference/delivery-suite.md");
  const suiteReference = readRelative("templates/.dwemr/reference/delivery-suite-reference.md");
  const registry = readRelative("templates/.dwemr/reference/subagent-registry.md");
  const policy = readRelative("templates/.dwemr/state/pipeline-policy.md");
  const memoryReadme = readRelative("templates/.dwemr/memory/README.md");
  for (const text of [templateGuide]) {
    assert.doesNotMatch(text, /stage routing across planning -> implementation -> QA/i);
    assert.doesNotMatch(text, /ongoing planning, implementation, QA, or release execution/i);
    assert.doesNotMatch(text, /declare release or QA acceptance/i);
    assert.doesNotMatch(text, /minimal corrective fixes from reviewer or QA findings/i);
    assert.doesNotMatch(text, /implementation\/review\/QA needs a scoped clarification/i);
  }

  assert.doesNotMatch(driver, /delivery-qa/i);
  assert.doesNotMatch(driver, /then to `qa-manager`/i);
  assert.doesNotMatch(driver, /QA specialists chosen by `qa-manager`/i);
  assert.doesNotMatch(driver, /Repeat until `ready_for_qa`/i);
  assert.doesNotMatch(driver, /Next QA agent for main agent/i);

  assert.doesNotMatch(suite, /QA\/remediation loop/i);
  assert.doesNotMatch(suite, /route implementation and QA/i);
  assert.doesNotMatch(suite, /review\/QA flow/i);
  assert.doesNotMatch(suite, /Treat `planning-manager`, `implementation-manager`, and `qa-manager` as stage workers/i);
  assert.doesNotMatch(suite, /delivery-qa/i);
  assert.doesNotMatch(suite, /qa-manager/i);

  assert.doesNotMatch(suiteReference, /\| QA\/audit\/cleanup only \| `qa-manager` \|/i);
  assert.doesNotMatch(suiteReference, /delivery-qa/i);
  assert.doesNotMatch(suiteReference, /continue through implementation and QA/i);

  assert.doesNotMatch(registry, /### `qa-manager`/i);
  assert.doesNotMatch(registry, /until task is ready for QA/i);
  assert.doesNotMatch(registry, /planning -> implementation -> QA -> next task \/ done/i);

  assert.doesNotMatch(policy, /delivery-manager`, `implementation-manager`, and `qa-manager`/i);
  assert.doesNotMatch(policy, /Mandatory QA gate/i);
  assert.doesNotMatch(policy, /Max QA recheck loops per task/i);
  assert.doesNotMatch(policy, /`qa-manager` must return `blocked_loop_limit`/i);
  assert.match(policy, /Do not assume a separate routed QA stage is active in the default delivery flow/i);

  assert.doesNotMatch(memoryReadme, /test-results\.md/i);
  assert.doesNotMatch(memoryReadme, /active-feature\.md/i);
  assert.doesNotMatch(memoryReadme, /feature-registry\.md/i);
  assert.doesNotMatch(memoryReadme, /latest-status\.md/i);
  assert.doesNotMatch(memoryReadme, /checkpoints\.md/i);
  assert.doesNotMatch(memoryReadme, /teams\//i);
  assert.doesNotMatch(memoryReadme, /agenda\.md/i);
  assert.doesNotMatch(memoryReadme, /journal\.md/i);
});

test("key agent prompts enforce execution checkpoints and restrict shared summary ownership", () => {
  const delivery = readRelative("templates/.claude/agents/delivery-manager.md");
  const deliveryStandard = readRelative("templates/.claude/agents/delivery-manager-standard-app.md");
  const implementationManager = readRelative("templates/.claude/agents/implementation-manager.md");
  const policy = readRelative("templates/.dwemr/state/pipeline-policy.md");
  const planningManager = readRelative("templates/.claude/agents/planning-manager.md");
  const planningManagerStandard = readRelative("templates/.claude/agents/planning-manager-standard-app.md");
  const guideCreator = readRelative("templates/.claude/agents/implementation-guide-creator.md");
  const implementer = readRelative("templates/.claude/agents/feature-implementer.md");
  const reviewer = readRelative("templates/.claude/agents/implementation-reviewer.md");
  const fixer = readRelative("templates/.claude/agents/implementation-fixer.md");
  const implementationStateExample = readRelative("templates/.dwemr/state/implementation-state.example.md");
  const productManager = readRelative("templates/.claude/agents/product-manager-standard-app.md");
  const release = readRelative("templates/.claude/agents/release-manager.md");

  assert.match(delivery, /Before any routing work begins and again before any stop or handoff, write `.dwemr\/state\/execution-state\.md`/);
  assert.match(delivery, /minimal global checkpoint and resume surface stays fresh during the transition/i);
  assert.match(delivery, /Do not depend on retired delivery summary files for routing, resume, or status reconstruction/i);
  assert.match(delivery, /Canonical delivery truth comes from onboarding, pipeline, execution, implementation, and active wave state/i);
  assert.doesNotMatch(delivery, /active-feature\.md/i);
  assert.doesNotMatch(delivery, /feature-registry\.md/i);
  assert.doesNotMatch(delivery, /latest-status\.md/i);
  assert.doesNotMatch(delivery, /checkpoints\.md/i);
  assert.doesNotMatch(delivery, /test-results\.md/i);
  assert.match(deliveryStandard, /Do not depend on retired delivery summary files for routing, resume, or status reconstruction/i);
  assert.match(deliveryStandard, /Canonical delivery truth comes from onboarding, pipeline, execution, implementation, and active wave state/i);
  assert.doesNotMatch(deliveryStandard, /active-feature\.md/i);
  assert.doesNotMatch(deliveryStandard, /feature-registry\.md/i);
  assert.doesNotMatch(deliveryStandard, /latest-status\.md/i);
  assert.doesNotMatch(deliveryStandard, /checkpoints\.md/i);
  assert.doesNotMatch(deliveryStandard, /test-results\.md/i);
  assert.match(deliveryStandard, /minimal global checkpoint and resume surface stays fresh during the transition/i);
  assert.match(
    deliveryStandard,
    /sole control-plane owner that decides whether the next lane is planning, implementation, or release/i,
  );
  assert.match(delivery, /primary manager-owned routing ledger/i);
  assert.match(delivery, /`current_owner`, `return_owner`, `current_stage`, `stage_status`, `current_step_kind`, `current_step_status`, `current_step_id`, and `next_agent`/i);
  assert.match(delivery, /`current_phase` and `current_task` .* last manager-acknowledged implementation cursor/i);
  assert.match(delivery, /workers and planning specialists may update lane-local state, but they do not advance `?\.dwemr\/state\/pipeline-state\.md`?/i);
  assert.match(delivery, /if implementation reports `task_accepted`/i);
  assert.match(delivery, /direct task acceptance or phase-boundary-reviewed acceptance/i);
  assert.match(delivery, /repair canonical state before any worker dispatch/i);
  assert.doesNotMatch(delivery, /QA group manager/i);
  assert.doesNotMatch(delivery, /ready_for_qa/);
  assert.match(delivery, /Autonomous continuation policy/i);
  assert.match(delivery, /do not stop at `implementation_ready`, `phase_complete`, `feature_complete`, or `release_checkpoint` boundaries/i);
  assert.match(delivery, /Milestone policy/i);
  assert.match(delivery, /implementation_ready/);
  assert.match(delivery, /phase_complete/);
  assert.match(delivery, /feature_complete/);

  assert.match(productManager, /in `autonomous` mode, hand off directly/i);
  assert.match(productManager, /in `checkpointed` mode, emit the `implementation_ready` milestone/i);
  assert.match(release, /When `execution_mode` is `autonomous`:/);
  assert.match(release, /do not emit `release_checkpoint` for `pushed`, `pr_open`, or `ready_to_merge`/i);
  assert.match(release, /release-state\.md/i);
  assert.match(release, /optional traceability state only/i);
  assert.match(release, /do not use it as a routing input/i);

  assert.match(planningManager, /`\.dwemr\/memory\/global\/prompt\.md` when present/i);
  assert.match(planningManager, /primary build prompt artifact from onboarding/i);
  assert.match(planningManager, /do not silently narrow planning back down to the shorter raw request/i);
  assert.match(planningManagerStandard, /none beyond the canonical state and wave artifacts already listed above/i);
  assert.match(planningManagerStandard, /Do not depend on retired team agenda\/journal memory for routing or resume behavior/i);
  assert.match(
    planningManagerStandard,
    /reconcile `current_owner`, `return_owner`, `current_stage`, `stage_status`, `current_step_kind`, `current_step_status`, `current_step_id`, and `next_agent` into `?\.dwemr\/state\/pipeline-state\.md`?/i,
  );
  assert.match(guideCreator, /`\.dwemr\/memory\/global\/prompt\.md` when present/i);
  assert.match(guideCreator, /primary build prompt artifact from onboarding/i);
  assert.match(guideCreator, /do not collapse the guide back to the shorter raw request/i);

  assert.match(policy, /before leaving the current phase or completing the feature/i);
  assert.match(policy, /every task requires task-scoped implementation-worker verification evidence/i);
  assert.match(policy, /the task that closes a phase must also receive an acceptable `?implementation-reviewer`? verdict/i);
  assert.match(policy, /Max reviewer\/fixer loops per phase-boundary review cycle/i);

  assert.match(implementationManager, /do not update delivery-manager-owned summary memory/i);
  assert.match(implementationManager, /Optional supporting context only when it helps explain recent implementation context/i);
  assert.match(implementationManager, /update `?\.dwemr\/memory\/global\/last-implementation\.md`?/i);
  assert.match(implementationManager, /return `task_accepted` so `delivery-manager` can reconcile canonical state/i);
  assert.match(implementationManager, /Determine whether the current task is the phase-final task by reading the active implementation guide/i);
  assert.match(implementationManager, /If implementer output exists and the current task is not phase-final, return `task_accepted` directly to `delivery-manager`/i);
  assert.match(implementationManager, /If implementer output exists and the current task is phase-final and review has not been run yet, return `implementation-reviewer`/i);
  assert.match(implementationManager, /Only the task that closes the current phase must pass the reviewer\/fixer loop/i);
  assert.match(implementationManager, /Treat `?\.dwemr\/state\/pipeline-state\.md`? as the primary manager-owned routing ledger/i);
  assert.match(implementationManager, /`current_owner`, `return_owner`, `current_stage`, `stage_status`, `current_step_kind`, `current_step_status`, `current_step_id`, and `next_agent`/i);
  assert.match(implementationManager, /`current_phase` and `current_task` as the last manager-acknowledged implementation cursor/i);
  assert.match(implementationManager, /Treat `?\.dwemr\/state\/implementation-state\.md`? as the implementation-lane local task packet and worker-loop detail/i);
  assert.match(implementationManager, /`feature_id`, `guide`, `phase`, `task`, `intent_summary`, and `ownership_checklist`/i);
  assert.match(implementationManager, /`active_worker`, `worker_status`, `attempt_id`, `changed_files`, `verification_commands`, `verification_summary`, `reviewer_verdict`, `review_findings_ref`, and `updated_at`/i);
  assert.match(implementationManager, /do not let workers advance `?\.dwemr\/state\/pipeline-state\.md`?/i);
  assert.match(implementationManager, /prefer `report_id`, `report_owner`, `report_status`, `scope_type`, and `scope_ref` when present/i);
  assert.match(implementationManager, /fall back to `checkpoint_owner`, `checkpoint_kind`, `current_status`, and `next_resume_owner` only for legacy checkpoints/i);
  assert.match(
    implementationManager,
    /freshest minimal global checkpoint and resume surface during the transition for the active implementation loop/i,
  );
  assert.match(implementationManager, /do not treat `?\.dwemr\/state\/implementation-state\.md`? as the canonical next-dispatch source/i);
  assert.match(implementationManager, /task acceptance still lands in `?\.dwemr\/state\/pipeline-state\.md`?/i);
  assert.match(implementationManager, /copy it into `?\.dwemr\/state\/pipeline-state\.md`? as `last_acknowledged_report_id`/i);
  assert.match(implementationManager, /Phase-boundary review: required \| not_required \| ambiguous_fallback_to_review/i);
  assert.match(implementationManager, /reconstructed from `implementation-state\.md`, `execution-state\.md`, and the active implementation guide/i);
  assert.match(implementationManager, /do not depend on a large implementer prose recap/i);
  assert.doesNotMatch(implementationManager, /ready_for_qa/);
  assert.doesNotMatch(implementationManager, /QA Fix Packet/);
  assert.doesNotMatch(implementationManager, /agenda\.md/i);
  assert.doesNotMatch(implementationManager, /journal\.md/i);

  assert.match(implementer, /Fields: `guide`, `phase`, `task`, `intent_summary`, `ownership_checklist`, `feature_id`, `active_worker`, `worker_status`, `attempt_id`/i);
  assert.match(implementer, /active implementation task packet and worker-loop detail/i);
  assert.match(implementer, /`active_worker: "feature-implementer"`/i);
  assert.match(implementer, /`worker_status: "implementing"`/i);
  assert.match(implementer, /`attempt_id`/i);
  assert.match(implementer, /`verification_commands`/i);
  assert.match(implementer, /report_owner: feature-implementer/);
  assert.match(implementer, /scope_type: implementation_task/);
  assert.match(implementer, /report_status: started/);
  assert.match(implementer, /report_status: finished/);
  assert.match(implementer, /checkpoint_kind: implementation_started/);
  assert.match(implementer, /checkpoint_kind: implementation_finished/);
  assert.match(implementer, /do not write narrative memory yourself/i);
  assert.match(implementer, /Keep the handoff thin/i);
  assert.match(implementer, /Do not restate the task checklist, acceptance criteria, scope boundaries, or large diff\/test output blocks in the handoff/i);
  assert.match(implementer, /if the current task closes the phase, implementation-manager may dispatch `implementation-reviewer`, otherwise it may return `task_accepted` directly to delivery-manager/i);
  assert.doesNotMatch(implementer, /the next expected worker is `implementation-reviewer`/i);
  assert.doesNotMatch(implementer, /latest-status\.md/);
  assert.doesNotMatch(implementer, /agenda\.md/i);
  assert.doesNotMatch(implementer, /journal\.md/i);

  assert.match(reviewer, /Update `.dwemr\/state\/implementation-state\.md` as the local implementation review packet when review begins and before handoff/i);
  assert.match(reviewer, /`active_worker: "implementation-reviewer"`/i);
  assert.match(reviewer, /`worker_status: "under_review"`/i);
  assert.match(reviewer, /`reviewer_verdict`/i);
  assert.match(reviewer, /Update `.dwemr\/state\/execution-state\.md` when review begins and again before any summary or handoff/i);
  assert.match(reviewer, /report_owner: implementation-reviewer/);
  assert.match(reviewer, /scope_type: implementation_review/);
  assert.match(reviewer, /scope_ref: <guide>\/<phase>/i);
  assert.match(reviewer, /report_status: started/);
  assert.match(reviewer, /Current phase plan \(phase goal, deliverables, and task checklist\)/i);
  assert.match(reviewer, /task-to-evidence matrix for the current phase/i);
  assert.match(reviewer, /phase-boundary completeness/i);
  assert.match(reviewer, /Task\/Deliverable 1/i);
  assert.match(reviewer, /Do not update narrative memory yourself/);
  assert.doesNotMatch(reviewer, /ready_for_qa/);
  assert.doesNotMatch(reviewer, /latest-status\.md/);
  assert.doesNotMatch(reviewer, /agenda\.md/i);
  assert.doesNotMatch(reviewer, /journal\.md/i);

  assert.match(fixer, /Update `.dwemr\/state\/implementation-state\.md` as the local implementation-fix packet before applying fixes and before handoff/i);
  assert.match(fixer, /`active_worker: "implementation-fixer"`/i);
  assert.match(fixer, /`worker_status: "fixing"`/i);
  assert.match(fixer, /`attempt_id`/i);
  assert.match(fixer, /`verification_commands`/i);
  assert.match(fixer, /phase-boundary findings packet/i);
  assert.match(fixer, /same phase boundary/i);
  assert.match(fixer, /do not write narrative memory yourself/i);
  assert.doesNotMatch(fixer, /agenda\.md/i);
  assert.doesNotMatch(fixer, /journal\.md/i);

  assert.match(implementationStateExample, /dwemr_contract_version: 3/i);
  assert.match(implementationStateExample, /feature_id: "none"/i);
  assert.match(implementationStateExample, /active_worker: "none"/i);
  assert.match(implementationStateExample, /worker_status: "idle"/i);
  assert.match(implementationStateExample, /attempt_id: ""/i);
  assert.match(implementationStateExample, /verification_commands: \[\]/i);
  assert.match(implementationStateExample, /review_findings_ref: ""/i);
  assert.match(implementationStateExample, /implementation-lane local task packet and worker-loop detail/i);
  assert.match(implementationStateExample, /manager-acknowledged task acceptance still belongs in `?pipeline-state\.md`?/i);
});

test("planning creators read the active quality runbook and keep wave-local state ownership scoped", () => {
  const productManager = readRelative("templates/.claude/agents/product-manager-standard-app.md");
  const epic = readRelative("templates/.claude/agents/epic.md");
  const planningManagerStandard = readRelative("templates/.claude/agents/planning-manager-standard-app.md");
  const waveManager = readRelative("templates/.claude/agents/wave-manager.md");
  const wavePlanner = readRelative("templates/.claude/agents/wave-planner.md");
  const waveCreator = readRelative("templates/.claude/agents/wave-creator.md");
  const architect = readRelative("templates/.claude/agents/architect.md");
  const techSpec = readRelative("templates/.claude/agents/tech-spec.md");
  const guideCreator = readRelative("templates/.claude/agents/implementation-guide-creator.md");
  const implementationManager = readRelative("templates/.claude/agents/implementation-manager.md");
  const implementer = readRelative("templates/.claude/agents/feature-implementer.md");
  const planTemplate = readRelative("docs/PLAN_TEMPLATE.md");
  const installPacks = readRelative("install-packs.ts");
  const waveStateExample = readRelative("templates/.dwemr/state/wave-state.example.md");

  assert.match(installPacks, /ACTIVE_QUALITY_RUNBOOK_PATH = "docs\/runbooks\/active-quality-runbook\.md"/);
  assert.match(installPacks, /case "minimal_tool":[\s\S]*simple-quality-runbook\.md/);
  assert.match(installPacks, /case "standard_app":[\s\S]*quality-runbook\.md/);
  assert.match(installPacks, /targetPath: ACTIVE_QUALITY_RUNBOOK_PATH/);

  assert.match(productManager, /`docs\/runbooks\/active-quality-runbook\.md` when present/i);
  assert.match(productManager, /let it influence wave boundaries, acceptance shape, and sequencing/i);
  assert.match(productManager, /Use `?\.dwemr\/state\/execution-state\.md`? only as the global product-manager checkpoint surface/i);
  assert.match(productManager, /hand control back to `delivery-manager`, which owns the next delivery-lane decision after product framing/i);
  assert.match(productManager, /persist `active_wave_id`, `active_wave_title`, `active_wave_state_path`, `wave_roadmap_path`, and `epic_doc_path` into `pipeline-state\.md` as manager-owned routing state/i);
  assert.match(productManager, /active_wave_state_path/i);
  assert.match(productManager, /wave-state\.md/i);
  assert.match(productManager, /exact frontmatter field set documented in `?\.dwemr\/state\/wave-state\.example\.md`?/i);
  assert.match(productManager, /`wave_id`, `wave_title`, `wave_goal`, `why_now`, `dependencies`/i);
  assert.match(productManager, /`active_planning_worker: "none"`, `planning_artifact_in_progress: "none"`, `planning_worker_status: "idle"`, and `blocked_reason: ""`/i);
  assert.match(productManager, /legacy `wave_status`, `planning_status`, and `implementation_status` remain read-only compatibility fields/i);
  assert.match(productManager, /`blocked_reason: ""`/i);
  assert.match(productManager, /`wave_doc_path`, `architecture_doc_path`, `tech_spec_path`, and `implementation_guide_path`/i);
  assert.match(productManager, /`updated_at`/i);
  assert.match(productManager, /Next owner: epic \| delivery-manager \| stop/i);
  assert.doesNotMatch(productManager, /Next owner: epic \| release-manager \| delivery-manager \| stop/i);
  assert.doesNotMatch(productManager, /run release-manager only when git\/release capability is explicitly enabled and already usable/i);

  assert.match(epic, /`docs\/runbooks\/active-quality-runbook\.md` when present/i);
  assert.match(epic, /let it influence wave shaping, dependency notes, and cross-wave constraints/i);
  assert.match(epic, /global checkpoint state .* `?product-manager`?/i);
  assert.match(epic, /do not update `?\.dwemr\/state\/pipeline-state\.md`? directly/i);
  assert.match(epic, /active wave-state\.md/i);
  assert.match(epic, /refresh `updated_at`/i);

  assert.match(waveManager, /active_wave_state_path/i);
  assert.match(waveManager, /wave-state\.md/i);
  assert.match(waveManager, /minimal global planning-manager-visible checkpoint and resume surface during the transition/i);
  assert.match(waveManager, /Suggested implementation entrypoint/i);
  assert.match(waveManager, /not durable state in wave-state or implementation-state/i);
  assert.match(waveManager, /durable selected-wave local context/i);
  assert.match(waveManager, /none beyond the canonical state and active-wave artifacts already listed above/i);
  assert.match(waveManager, /Treat `?\.dwemr\/state\/wave-state\.example\.md`? as the schema contract for live `?wave-state\.md`? files/i);
  assert.match(waveManager, /Do not add new keys to `?wave-state\.md`?/i);
  assert.match(
    waveManager,
    /reconcile `current_owner`, `return_owner`, `current_stage`, `stage_status`, `current_step_kind`, `current_step_status`, `current_step_id`, and `next_agent` into `?\.dwemr\/state\/pipeline-state\.md`?/i,
  );

  assert.match(wavePlanner, /wave-state\.md/i);
  assert.match(wavePlanner, /minimal global checkpoint and resume surface during the transition for this wave-definition loop/i);
  assert.match(wavePlanner, /wave_doc_path/i);
  assert.match(wavePlanner, /`active_planning_worker: "wave-planner"`/i);
  assert.match(wavePlanner, /`planning_artifact_in_progress: "wave_doc"`/i);
  assert.match(wavePlanner, /`planning_worker_status: "in_progress"`/i);
  assert.match(wavePlanner, /`planning_worker_status: "blocked"`/i);
  assert.match(wavePlanner, /`blocked_reason`/i);
  assert.match(wavePlanner, /`updated_at`/i);
  assert.match(wavePlanner, /Treat `?\.dwemr\/state\/wave-state\.example\.md`? as the schema contract for live `?wave-state\.md`? files/i);
  assert.match(wavePlanner, /Do not add new keys/i);
  assert.match(wavePlanner, /Never write .*phase\/task cursor/i);
  assert.doesNotMatch(wavePlanner, /agenda\.md/i);
  assert.doesNotMatch(wavePlanner, /journal\.md/i);
  assert.doesNotMatch(planningManagerStandard, /agenda\.md/i);
  assert.doesNotMatch(planningManagerStandard, /journal\.md/i);

  assert.match(waveCreator, /`docs\/runbooks\/active-quality-runbook\.md` when present/i);
  assert.match(waveCreator, /Quality focus:/);
  assert.match(waveCreator, /\.dwemr\/waves\/<wave-id>\/wave-doc\.md/i);
  assert.match(waveCreator, /own the wave document content and the allowed `?wave-state\.md`? fields/i);
  assert.match(waveCreator, /update the active `\.dwemr\/waves\/<wave-id>\/wave-state\.md`/i);
  assert.match(waveCreator, /use only the exact schema documented in `?\.dwemr\/state\/wave-state\.example\.md`?/i);
  assert.match(waveCreator, /must not be used for implementation task progress/i);
  assert.match(waveCreator, /`active_planning_worker: "wave-creator"`/i);
  assert.match(waveCreator, /`planning_artifact_in_progress: "wave_doc"`/i);
  assert.match(waveCreator, /`planning_worker_status`/i);
  assert.match(waveCreator, /`blocked_reason` is cleared/i);
  assert.match(waveCreator, /`updated_at` is refreshed/i);
  assert.match(waveCreator, /legacy `wave_status`, `planning_status`, and `implementation_status` remain untouched compatibility fields/i);

  assert.match(architect, /`docs\/runbooks\/active-quality-runbook\.md` when present/i);
  assert.match(architect, /Quality shaping notes:/);
  assert.match(architect, /\.dwemr\/waves\/<wave-id>\/architecture\.md/i);
  assert.match(architect, /Global checkpoint state stays with the requesting planning manager/i);
  assert.match(architect, /update `architecture_doc_path`/i);
  assert.match(architect, /do not add any other keys beyond the schema documented in `?\.dwemr\/state\/wave-state\.example\.md`?/i);
  assert.match(architect, /`blocked_reason`/i);
  assert.match(architect, /`updated_at`/i);
  assert.doesNotMatch(architect, /Feature Definition Brief/i);
  assert.doesNotMatch(architect, /Epic subagent/i);

  assert.match(techSpec, /`docs\/runbooks\/active-quality-runbook\.md` when present/i);
  assert.match(techSpec, /runbook-driven quality constraints/i);
  assert.match(techSpec, /\.dwemr\/waves\/<wave-id>\/tech-spec\.md/i);
  assert.match(techSpec, /Global checkpoint state stays with the requesting planning manager/i);
  assert.match(techSpec, /update `tech_spec_path`/i);
  assert.match(techSpec, /do not add any other keys beyond the schema documented in `?\.dwemr\/state\/wave-state\.example\.md`?/i);
  assert.match(techSpec, /`blocked_reason`/i);
  assert.match(techSpec, /`updated_at`/i);
  assert.doesNotMatch(techSpec, /Feature Definition Brief/i);

  assert.match(guideCreator, /`docs\/runbooks\/active-quality-runbook\.md` when present/i);
  assert.match(guideCreator, /`Quality rules to follow` section/i);
  assert.match(guideCreator, /do not paste or restate the whole runbook/i);
  assert.match(guideCreator, /Every guide must include a short `Environment \/ Verification` section/i);
  assert.match(guideCreator, /do not assume Python, Node, or any other runtime without evidence from the project/i);
  assert.match(guideCreator, /for Python work, always prefer the project-local `?\.venv`?/i);
  assert.match(guideCreator, /report that as `?unverified`? or `?blocked_by_environment`? evidence instead of claiming success/i);
  assert.match(guideCreator, /\.dwemr\/waves\/<wave-id>\/implementation-guide\.md/i);
  assert.match(guideCreator, /Global checkpoint state remains with the requesting planning manager/i);
  assert.match(guideCreator, /update the active `\.dwemr\/waves\/<wave-id>\/wave-state\.md`/i);
  assert.match(guideCreator, /use only the exact schema documented in `?\.dwemr\/state\/wave-state\.example\.md`?/i);
  assert.match(guideCreator, /must not be used for implementation task progress/i);
  assert.match(guideCreator, /`active_planning_worker: "implementation-guide-creator"`/i);
  assert.match(guideCreator, /`planning_artifact_in_progress: "implementation_guide"`/i);
  assert.match(guideCreator, /`planning_worker_status`/i);
  assert.match(guideCreator, /`blocked_reason` is cleared/i);
  assert.match(guideCreator, /`updated_at` is refreshed/i);
  assert.match(guideCreator, /legacy `wave_status`, `planning_status`, and `implementation_status` remain untouched compatibility fields/i);

  assert.match(implementationManager, /may be under `\.dwemr\/guides\/` or `\.dwemr\/waves\/<wave-id>\/implementation-guide\.md`/i);
  assert.match(implementationManager, /minimal global checkpoint and resume surface during the transition for the active implementation loop/i);
  assert.match(implementationManager, /`?implementation-state\.md`? keeps the active local task packet and worker-loop detail/i);

  assert.match(waveStateExample, /dwemr_contract_version: 3/i);
  assert.match(waveStateExample, /Treat this example as the exact frontmatter schema/i);
  assert.match(waveStateExample, /Do not add ad hoc implementation-progress, task-tracking, checklist, or extra summary fields/i);
  assert.match(waveStateExample, /`pipeline-state\.md`: global routing pointer that selects the active wave/i);
  assert.match(waveStateExample, /`execution-state\.md`: global checkpoint and resume surface/i);
  assert.match(waveStateExample, /Treat this file as wave-internal flow state only/i);
  assert.match(waveStateExample, /active_planning_worker: "none"/i);
  assert.match(waveStateExample, /planning_artifact_in_progress: "none"/i);
  assert.match(waveStateExample, /planning_worker_status: "idle"/i);
  assert.match(waveStateExample, /wave_doc_path: ""/i);
  assert.match(waveStateExample, /epic_doc_path: ""/i);
  assert.match(waveStateExample, /`planning_artifact_in_progress` allowed values:/i);
  assert.match(waveStateExample, /`planning_worker_status` allowed values:/i);
  assert.match(waveStateExample, /legacy `wave_status`, `planning_status`, and `implementation_status` may still appear/i);
  assert.match(waveStateExample, /`blocked_reason`: wave-planning-only blocker summary/i);
  assert.match(waveStateExample, /`updated_at`: refresh whenever a prompt legitimately mutates `wave-state\.md`/i);
  assert.match(waveStateExample, /Implementation workers do not write `wave-state\.md` directly/i);
  assert.match(waveStateExample, /Do not use this file as the global resumability checkpoint/i);

  assert.match(planTemplate, /## Code Quality Standards/);
  assert.match(planTemplate, /### Quality Rules To Follow/);
  assert.match(planTemplate, /## Environment and Verification/);
  assert.match(planTemplate, /Prefer project-local environments and executables over global installs/i);
  assert.match(planTemplate, /### Required Environment/);
  assert.match(planTemplate, /### Setup Commands/);
  assert.match(planTemplate, /### Verification Commands/);
  assert.match(planTemplate, /### If Setup or Verification Is Blocked/);

  assert.doesNotMatch(implementer, /quality-runbook\.md/i);
  assert.doesNotMatch(implementer, /active-quality-runbook\.md/i);
});

test("runtime-shipped assets and docs do not reference removed structured workflow terms", () => {
  const bannedTerms = [
    ["structured", "product"].join("_"),
    ["profile", "structured", "product"].join("-"),
    ["project", "manager"].join("-"),
    ["pha", "sing"].join(""),
    ["full", "path"].join("_"),
    ["needs", "project", "docs"].join("_"),
    ["project", "docs"].join("_"),
  ];
  const fileTargets = [
    "install-packs.ts",
    "README.md",
    ...listRelativeFiles("src/control-plane"),
    ...listRelativeFiles("templates"),
    ...listRelativeFiles("../dev/docs"),
  ];

  for (const relativePath of fileTargets) {
    const text = readRelative(relativePath);
    for (const bannedTerm of bannedTerms) {
      assert.equal(
        text.includes(bannedTerm),
        false,
        `${relativePath} still references removed workflow term ${bannedTerm}.`,
      );
    }
  }
});

test("removed delivery summary files are absent from active contract surfaces", () => {
  const removedPatterns = [
    /active-feature\.md/i,
    /feature-registry\.md/i,
    /latest-status\.md/i,
    /checkpoints\.md/i,
    /test-results\.md/i,
  ];
  const fileTargets = [
    "templates/CLAUDE.md",
    "templates/.dwemr/state/pipeline-policy.md",
    "templates/.dwemr/memory/README.md",
    "templates/.dwemr/reference/delivery-driver.md",
    "templates/.dwemr/reference/delivery-suite-reference.md",
    "templates/.dwemr/reference/subagent-registry.md",
    ...listRelativeFiles("templates/.claude/agents"),
    ...listRelativeFiles("templates/.claude/commands"),
  ];

  for (const relativePath of fileTargets) {
    const text = readRelative(relativePath);
    for (const pattern of removedPatterns) {
      assert.doesNotMatch(text, pattern, `${relativePath} still references retired delivery summary memory.`);
    }
  }
});

test("agenda and journal files are absent from active runtime and bootstrap surfaces", () => {
  const removedPatterns = [/agenda\.md/i, /journal\.md/i];
  const fileTargets = [
    "install-packs.ts",
    "src/control-plane/seed-data.ts",
    "templates/CLAUDE.md",
    "templates/.dwemr/state/pipeline-policy.md",
    "templates/.dwemr/memory/README.md",
    "templates/.dwemr/reference/delivery-driver.md",
    "templates/.dwemr/reference/subagent-registry.md",
    ...listRelativeFiles("templates/.claude/agents"),
    ...listRelativeFiles("templates/.claude/commands"),
  ];

  for (const relativePath of fileTargets) {
    const text = readRelative(relativePath);
    for (const pattern of removedPatterns) {
      assert.doesNotMatch(text, pattern, `${relativePath} still references retired agenda/journal memory.`);
    }
  }
});

test("stale release trace fixture conflicts with canonical release state and release contracts prefer canonical state", () => {
  const releasePipeline = readRelative("../dev/tests/fixtures/state-drift/release-pipeline-state.md");
  const releaseExecution = readRelative("../dev/tests/fixtures/state-drift/release-execution-state.md");
  const releaseState = readRelative("../dev/tests/fixtures/state-drift/release-state.md");
  const pr = readRelative("templates/.claude/commands/delivery-pr.md");
  const release = readRelative("templates/.claude/commands/delivery-release.md");
  const driver = readRelative("templates/.dwemr/reference/delivery-driver.md");

  assert.match(releasePipeline, /release_stage: "pr_open"/);
  assert.match(releasePipeline, /release_lock: true/);
  assert.match(releasePipeline, /next_agent: "release-manager"/);
  assert.match(releaseExecution, /report_owner: "release-manager"/);
  assert.match(releaseExecution, /stage: "release"/);
  assert.match(releaseExecution, /checkpoint_kind: "pr_open"/);
  assert.match(releaseState, /release_stage: "merged"/i);
  assert.match(releaseState, /last_release_summary: "PR merged to main\."/i);

  assert.match(pr, /execution-state\.md/i);
  assert.match(pr, /release-state\.md.*optional release trace context/i);
  assert.match(release, /execution-state\.md/i);
  assert.match(release, /release-state\.md.*optional release trace context/i);
  assert.match(driver, /release-state\.md`? only as optional human-readable context, never as routing truth/i);
});
