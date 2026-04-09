# Phase 4 Implementation Plan: Stop, Status, and Doctor Migration

Implemented closure spec: [phase-4-stop-status-doctor-migration-spec.md](./phase-4-stop-status-doctor-migration-spec.md)

## Intent

Move DWEMR's operator-facing runtime controls from a process-oriented model to an ACP-native runtime/session model.

This phase is where users should stop feeling the old process-launch architecture even if some legacy compatibility code still exists.

## Scope Guardrail

This phase is only about runtime control surfaces.

It is **not** allowed to:

- redesign DWEMR workflow behavior
- change state-file semantics
- change onboarding or delivery routing logic
- remove remaining legacy runtime compatibility before replacements are proven

## Phase Objective

Replace the parts of DWEMR that currently assume:

- local shell commands
- local process IDs
- signal-based stop behavior
- shell-based runtime probing

with ACP-native equivalents that fit OpenClaw's runtime model.

## Workstreams

### 1. Active Run Model Migration

Move active-run tracking from PID-first assumptions to backend-neutral run/session ownership.

By the end of this workstream, DWEMR should be able to answer:

- what is currently running for this project
- which ACP session or task owns that run
- whether it can be cancelled, resumed, or inspected

It should also make a negative case explicit:

- when there is no active runtime owner because the last command already completed and handed control back through saved DWEMR state

The migrated live-run identity should capture both task and session linkage, for example:

- flow id
- task id
- child session key
- backend kind
- optional legacy PID during compatibility overlap only

### 2. Stop Semantics Migration

Redefine `/dwemr stop` in runtime-native terms while preserving the same user intent.

The user intent to preserve is:

- stop the active DWEMR run for the selected project
- keep the project state intact
- allow later continuation from saved checkpoints when appropriate

This means `/dwemr stop` should only target active in-flight runtime ownership.

It should not imply that completed planning/interview turns must still have a live ACP session available in order for later continuation to work.

The implementation is allowed to change from signal-killing to ACP-native cancellation or closure.

Stop behavior should define cancellation order explicitly:

1. cancel the active ACP-backed task/flow owner
2. if still running and supported, request ACP session cancel/close
3. report terminal stop outcome in DWEMR language without exposing process-signal internals

### 3. Status Surface Migration

Update runtime-facing status reporting to reflect ACP-native reality.

This should include:

- current run ownership
- runtime readiness
- active session/task state where relevant
- removal of process-centric assumptions from user-facing status text
- clear distinction between “running task”, “waiting for input”, “cancelled”, and “failed” outcomes

It should also distinguish between:

- no active runtime handle, but workflow is waiting on the user from saved DWEMR state
- no active runtime handle because nothing is currently in progress

### 4. Doctor Surface Migration

Rewrite runtime health validation so doctor checks the execution runtime OpenClaw actually owns.

This should cover:

- ACP runtime availability
- session/runtime capability health
- actionable recovery guidance aligned with ACP-native behavior
- removal or demotion of shell/path checks that are no longer primary runtime truth
- task/flow ledger health (for example missing or stale run ownership metadata)

Doctor should remain careful not to treat the absence of a currently running ACP task/session as corruption when DWEMR is simply paused at a saved question or checkpoint.

### 5. Compatibility Messaging

Preserve stable operator-facing command guidance wherever possible.

If any runtime-control behavior must change visibly, the migration plan should define:

- the new operator explanation
- any temporary compatibility messaging
- any release-note or README updates needed later

## Deliverables

- ACP-native active-run identity and tracking
- ACP-native `/dwemr stop`
- updated runtime-facing status behavior
- updated doctor behavior and recovery messaging
- runtime-owned stop/status model with task/session linkage
- compatibility messaging for any unavoidable user-visible runtime differences

## Related Official Docs

- ACP runtime controls such as cancel, close, status, and doctor: <https://docs.openclaw.ai/tools/acp-agents>
- Session status concepts: <https://docs.openclaw.ai/concepts/session-tool>
- Background tasks and child-session tracking: <https://docs.openclaw.ai/automation/tasks>
- Session spawning behavior: <https://docs.openclaw.ai/tools/subagents>

## Validation Requirements

- `/dwemr stop` still fulfills the same operator intent
- doctor reports ACP-native runtime truth clearly
- status no longer depends on local PID/process assumptions
- failure and recovery guidance remains actionable for users
- stop resolves through task/session cancellation semantics rather than process signals

## Risks To Manage

- ACP-native cancel behavior may not map perfectly to local process-kill timing
- session/task visibility may be richer but less immediate than PID ownership
- doctor messaging may become confusing if legacy and ACP-native runtime concepts overlap too long

## Exit Criteria

This phase is complete when:

- stop/status/doctor work against the ACP-native runtime path
- users can operate DWEMR without relying on the old process model
- remaining legacy runtime code is no longer needed for normal control flows

## Handoff To Phase 5

Phase 5 should begin with ACP-native runtime controls already proven, so cleanup can remove obsolete concepts instead of carrying dual ownership indefinitely.
