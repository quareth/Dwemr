# Subagent Registry

Use this reference when a `/delivery-*` command needs exact routing.

## Top-level agents

### `interviewer`
- Use for: onboarding classification, internal clarification when another owner cannot safely choose the next route, or when planning needs a Feature Definition Brief before architecture/design. Not for read-only next-step navigation; the dedicated what-now command owns that compass surface.
- Reads: onboarding mode reads `.dwemr/state/onboarding-state.md`, `.dwemr/project-config.yaml`, and `.dwemr/memory/global/user-profile.md`; flow-clarification mode reads `.dwemr/state/pipeline-state.md`, `.dwemr/state/implementation-state.md`, and `.dwemr/state/execution-state.md` first, then may consult `.dwemr/state/release-state.md` only as optional release trace context; definition mode reads the current planning/request context
- Returns to: main agent, then stop in onboarding mode, then back to the requesting owner or stop in flow-clarification mode, or back to `planning-manager` in definition mode

### `prompt-enhancer`
- Use for: writing `.dwemr/memory/global/prompt.md` after onboarding completes from a real clarification-response pass, so the original request plus onboarding Q&A become a stronger planning prompt without changing product intent
- Reads: only the invocation payload from `/delivery-driver onboarding`; do not rely on repo reads to infer extra scope
- Returns to: main agent, then stop back into `/delivery-driver onboarding`

### `product-manager`
- Use for: broad app/product bootstrap requests and, in `standard_app`, app-wide wave-decision ownership
- Reads/writes: app framing context, decision-log context, `docs/waves/wave-roadmap.md` in `standard_app`, and high-level handoff
- Returns to: main agent, then back into `product-manager` after `epic`, or onward to `delivery-manager`

### `delivery-manager`
- Use for: delivery-pipeline stage routing; in `standard_app`, execution of the active selected wave
- Reads/writes: `.dwemr/state/pipeline-state.md`, `.dwemr/state/implementation-state.md`, `.dwemr/state/execution-state.md`, and retained narrative memory only when relevant
- Sub-agents: `planning-manager`, `implementation-manager`, `release-manager` (when git enabled)
- Returns to: main agent, then to the stage manager it names

### `release-manager`
- Use for: post-implementation git operations (commit/push/PR/merge) after phase review and tests pass
- Reads/writes: `.dwemr/state/pipeline-state.md` (git/release fields), `.dwemr/state/release-state.md`
- Called by: `delivery-manager` when git is enabled after implementation phase completes
- Returns to: `delivery-manager`

## Stage managers

### `planning-manager`
- Use for: planning path selection and guide/task readiness, constrained by onboarding-state; in `standard_app`, entry/exit around the active-wave planning system
- May route to: `interviewer`, `wave-manager`, and legacy planning specialists where the installed profile still allows them
- Returns to: main agent, then back to `planning-manager` until planning is complete, then to `delivery-manager`

### `wave-manager`
- Use for: active-wave planning lifecycle orchestration under `planning-manager`
- May route to: `wave-planner`, `architect`, `tech-spec`, `implementation-guide-creator`, `orchestrator`
- Returns to: main agent, then back to `wave-manager` until active-wave planning is complete, then to `planning-manager`

### `implementation-manager`
- Use for: task-by-task implementation with phase-boundary review/fix loop. In `standard_app`, adds e2e testing phase gate after review COMPLETE.
- May route to: `feature-implementer`, `implementation-reviewer`, `e2e-tester` (standard_app only), `implementation-fixer`, `orchestrator`
- Returns to: main agent, then back to `implementation-manager` until the current task is accepted or blocked, then to `delivery-manager`

## Worker agents

### `wave-planner`
- Use for: active-wave preparation management under `wave-manager`
- May route to: `wave-creator`, `orchestrator`
- Returns to: main agent, then back to `wave-planner` until the wave-definition packet is complete, then to `wave-manager`

### `feature-implementer`
- Use for: implementing the current task only
- Reads: `.dwemr/state/implementation-state.md`, active guide
- Returns to: main agent, then back to `implementation-manager`

### `implementation-reviewer`
- Use for: readonly completeness review of the current phase at the phase boundary
- Returns to: main agent, then back to `implementation-manager`

### `implementation-fixer`
- Use for: scoped remediation from phase-boundary reviewer or e2e-tester findings
- Returns to: main agent, then back to `implementation-manager`

### `e2e-tester`
- Use for: phase-scoped e2e test creation and execution in `standard_app` after phase-boundary review COMPLETE
- Returns to: main agent, then back to `implementation-manager`

### `epic`
- Use for: expanding the product-manager-owned `docs/waves/wave-roadmap.md` into an app-wide wave design document
- Returns to: main agent, then back to `product-manager`

### `wave-creator`
- Use for: durable selected-wave doc creation when called from the wave-definition loop
- Returns to: main agent, then back to `wave-planner`

### `architect`, `tech-spec`, `implementation-guide-creator`
- Use for: downstream planning artifacts for the active selected wave when called from `wave-manager`
- Returns to: main agent, then back to `wave-manager` in wave-based planning or to `planning-manager` in legacy planning

### `tester` and retired QA auditors
- Use for: direct-tool quality work when explicitly invoked outside the main routed delivery flow
- Returns to: the direct caller only; active workflow should not route here

## Return-path rules

- In wave-based planning, `wave-manager` owns the active-wave planning loop.
- `wave-planner` always returns to `wave-manager`, never directly to `planning-manager` or implementation.
- `epic` returns to `product-manager` for app-level wave design continuation.
- `wave-creator` returns to `wave-planner` when called from the wave-definition loop.
- `architect`, `tech-spec`, and `implementation-guide-creator` return to `wave-manager` when called from the wave-planning loop.
- Outside the wave system, legacy planning specialists return to `planning-manager`.
- Implementation workers always return to `implementation-manager`, never directly to delivery-manager stage advancement.
- Only `delivery-manager` may advance runtime stage from planning -> implementation -> next task, release handoff, or done.
- Only `release-manager` may advance release-lane state.
