import { DWEMR_CONTRACT_VERSION } from "./state-contract";

export const bootstrapStateSeeds: Record<string, string> = {
  ".dwemr/state/pipeline-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: "none"
feature_title: "none"
feature_fingerprint: "none"
feature_status: "idle"
run_mode: "exclusive"
resume_token: ""
feature_request: ""
git_enabled: false
git_state: ""
git_mode: "disabled"
git_base_branch: "main"
git_feature_branch: ""
git_remote: "origin"
pr_number: ""
pr_head_sha: ""
pr_base_branch: "main"
pr_status: "not_applicable"
ci_status: "not_applicable"
merge_status: "not_applicable"
release_stage: "none"
release_lock: false
release_lock_reason: ""
release_owner_feature_id: ""
release_resume_required: false
approval_mode: "auto"
execution_mode: "autonomous"
current_owner: "none"
return_owner: "none"
stage_status: "idle"
current_step_kind: "none"
current_step_status: "none"
current_step_id: ""
active_wave_id: ""
active_wave_title: ""
active_wave_state_path: ""
wave_roadmap_path: ""
epic_doc_path: ""
completed_wave_ids: []
remaining_wave_outline: []
milestone_state: "none"
milestone_kind: "none"
milestone_owner: "none"
milestone_summary: ""
milestone_next_step: ""
milestone_updated_at: ""
status: "idle"
current_stage: "planning"
active_guide_path: ""
plan_path: ""
current_phase: ""
current_task: ""
next_agent: "none"
review_loop_count: 0
completed_tasks: []
last_handoff: ""
last_acknowledged_report_id: ""
last_acknowledged_report_owner: "none"
last_acknowledged_at: ""
blocked_reason: ""
updated_at: ""
---

Authoritative macro workflow state for managed delivery.

- The YAML frontmatter above is authoritative.
- Use this file for manager-owned routing, acknowledged stage/task state, blockers, milestones, release-lane truth, and the latest acknowledged worker report.
`,
  ".dwemr/state/execution-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
report_id: ""
supersedes_report_id: ""
feature_id: "none"
feature_fingerprint: "none"
scope_type: "none"
scope_ref: ""
report_owner: "none"
report_status: "idle"
stage: ""
guide: ""
phase: ""
task: ""
checkpoint_owner: "none"
checkpoint_kind: "none"
current_intent: ""
last_completed_step: ""
current_status: "idle"
pending_return_to: "none"
next_resume_owner: "none"
changed_files: []
verification_summary: ""
outcome_summary: ""
reviewer_verdict: ""
blocking_reason: ""
updated_at: ""
---

Authoritative live checkpoint file.

- The YAML frontmatter above is authoritative.
- Prefer \`report_id\`, \`report_owner\`, \`report_status\`, \`scope_type\`, and \`scope_ref\` when present.
- Keep legacy \`checkpoint_*\`, \`current_status\`, and \`next_resume_owner\` fields readable for compatibility during the transition.
- Every active agent should refresh this file on start and before any stop, pause, or handoff.
`,
  ".dwemr/state/implementation-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: "none"
guide: ""
phase: ""
task: ""
intent_summary: ""
ownership_checklist: []
active_worker: "none"
worker_status: "idle"
attempt_id: ""
changed_files: []
verification_commands: []
verification_summary: ""
reviewer_verdict: ""
review_findings_ref: ""
updated_at: ""
---

Authoritative implementation-lane local task packet and worker-loop detail.

- The YAML frontmatter above is authoritative.
- Keep this file structured and concise; do not use prose here for runtime truth.
- \`pipeline-state.md\` remains the manager-owned routing ledger and the place where task acceptance is acknowledged.
`,
  ".dwemr/state/onboarding-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
status: "pending"
entry_action: ""
request_context: ""
clarification_summary: ""
clarification_questions: []
clarification_response: ""
selected_profile: ""
planning_mode: ""
docs_mode: ""
qa_mode: ""
needs_product_framing: false
selected_packs: []
required_artifacts: []
install_stage: "bootstrap_only"
updated_at: ""
---

# Onboarding state

Onboarding has not been completed yet.
`,
};

export const standardAppStateSeeds: Record<string, string> = {
  ".dwemr/state/e2e-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: "none"
guide: ""
phase: ""
task: ""
test_type: "none"
test_suite_path: ""
test_command: ""
last_run_result: "none"
last_run_summary: ""
tests_created: []
failures: []
env_blocker: ""
updated_at: ""
---

E2E testing traceability state.

- The YAML frontmatter above is authoritative.
- Updated by \`e2e-tester\` on every run.
- This file is for traceability only. It does not affect pipeline routing or execution state.
`,
};

export function createReleaseStateSeed(options: {
  featureId?: string;
  phase?: string;
  gitEnabled?: boolean;
  gitMode?: string;
  gitBaseBranch?: string;
  gitFeatureBranch?: string;
  gitRemote?: string;
  releaseStage?: string;
  releaseLock?: boolean;
  releaseOwnerFeatureId?: string;
  prNumber?: string;
  prStatus?: string;
  ciStatus?: string;
  mergeStatus?: string;
  lastReleaseAction?: string;
  lastReleaseSummary?: string;
  blockingReason?: string;
  updatedAt?: string;
} = {}) {
  return `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: ${JSON.stringify(options.featureId ?? "none")}
phase: ${JSON.stringify(options.phase ?? "")}
git_enabled: ${options.gitEnabled === true ? "true" : "false"}
git_mode: ${JSON.stringify(options.gitMode ?? "disabled")}
git_base_branch: ${JSON.stringify(options.gitBaseBranch ?? "main")}
git_feature_branch: ${JSON.stringify(options.gitFeatureBranch ?? "")}
git_remote: ${JSON.stringify(options.gitRemote ?? "origin")}
release_stage: ${JSON.stringify(options.releaseStage ?? "none")}
release_lock: ${options.releaseLock === true ? "true" : "false"}
release_owner_feature_id: ${JSON.stringify(options.releaseOwnerFeatureId ?? "")}
pr_number: ${JSON.stringify(options.prNumber ?? "")}
pr_status: ${JSON.stringify(options.prStatus ?? "not_applicable")}
ci_status: ${JSON.stringify(options.ciStatus ?? "not_applicable")}
merge_status: ${JSON.stringify(options.mergeStatus ?? "not_applicable")}
last_release_action: ${JSON.stringify(options.lastReleaseAction ?? "")}
last_release_summary: ${JSON.stringify(options.lastReleaseSummary ?? "")}
blocking_reason: ${JSON.stringify(options.blockingReason ?? "")}
updated_at: ${JSON.stringify(options.updatedAt ?? "")}
---

Release traceability state.

- The YAML frontmatter above is traceability-only.
- Updated by \`release-manager\` for git/release visibility.
- This file does not affect pipeline routing, execution checkpoints, or resume decisions.
`;
}

export const bootstrapGlobalMemorySeeds: Record<string, string> = {
  ".dwemr/memory/global/decision-log.md": `# Decision log

Append notable product or technical decisions here when they affect delivery behavior.
`,
  ".dwemr/memory/global/last-implementation.md": `# Last implementation

Record the last accepted implementation handoff here when useful for resume context.

Narrative only. The active implementation task still comes from \`.dwemr/state/implementation-state.md\`.
`,
  ".dwemr/memory/global/user-profile.md": `# User profile

Durable onboarding snapshot for how DWEMR should collaborate with the user.

## Current

- Technical level:
- Preferred guidance depth:
- Tolerance for process/docs:
- Desired involvement level:
- Collaboration style:
- Last updated:
`,
};
