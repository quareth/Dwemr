# Phase 3 Implementation Plan: ACP-Native Run Path

## Intent

Introduce an OpenClaw-managed ACP execution backend that can run DWEMR workflow commands without DWEMR directly spawning host processes.

This is the phase where runtime ownership begins to move from the plugin to OpenClaw.

## Scope Guardrail

This phase is only about replacing the execution runtime path.

It is **not** allowed to:

- redesign the installed Claude workflow
- change the meaning of `/dwemr` commands
- alter DWEMR state semantics
- remove the legacy runtime path before ACP-native execution is proven

## Phase Objective

Deliver a working ACP-native backend that can execute DWEMR workflow commands while preserving the same operator-facing command model as closely as possible.

At the end of this phase:

- DWEMR should be able to run through OpenClaw-managed ACP sessions
- the old runtime adapter may still exist as a fallback or migration path
- command behavior should remain recognizable and stable for users

## Target Runtime Direction

The ACP-native backend should rely on OpenClaw-owned runtime/session capabilities rather than direct `acpx` command invocation.

The design should align with:

- ACP sessions as the execution substrate
- OpenClaw-managed session lifecycle
- host-owned runtime controls
- managed task/session tracking where appropriate
- DWEMR's existing state-first durability model, where `.dwemr/state/*` remains the canonical source for resume-after-interruption behavior

## Documented Runtime Surface Constraint

Phase 3 must use documented OpenClaw runtime seams as implementation anchors:

- OpenClaw-managed ACP session spawning/lifecycle controls for obtaining and managing child session identity
- a documented wait/result-delivery strategy that is available on the pinned minimum supported OpenClaw version of `2026.4.2`
- `api.runtime.tasks.flows` for orchestration ownership and ACP task ledger tracking on the raised DWEMR floor of OpenClaw `2026.4.2` or newer, with `api.runtime.taskFlow` treated only as a deprecated compatibility alias if required by implementation details

If any required ACP spawn/wait/cancel helper is missing from the `2026.4.2` platform contract in practice, treat it as a phase blocker and land the typed platform seam first. Do not fall back to plugin-owned shell spawning as a substitute.

## Workstreams

### 1. ACP Session Strategy

Choose the DWEMR execution strategy for ACP-native runs.

This phase plan should define:

- whether DWEMR uses one-shot ACP runs, persistent ACP sessions, or a hybrid model
- how session continuity maps to current DWEMR expectations
- how onboarding and routed commands attach to or resume the right execution context

This workstream must start from the following rule:

- persistent ACP session continuity is optional unless a command needs a live in-flight runtime handle; correctness for `/dwemr continue`, planning follow-ups, and interview answers may still come from restarting against saved DWEMR state

The strategy output must also define the canonical run identity payload for downstream phases, including:

- backend kind
- flow id
- task id
- child session key
- optional legacy PID compatibility fields during transition only

The strategy should also distinguish:

- durable workflow identity: project path + saved DWEMR checkpoint/state files
- live runtime identity: active ACP task/session ids used only while a command is currently executing

The chosen strategy must preserve the current user experience as closely as possible.

### 2. Result Delivery Strategy

Design how ACP-native runs deliver final results back to DWEMR command handlers.

This is the most behavior-sensitive part of the migration.

The plan must explicitly define:

- whether DWEMR waits for a final result synchronously
- whether DWEMR bridges through a managed background/task model and then formats results
- how it preserves current “final assistant message” behavior for routed commands

It must also define the terminal handoff rule for question-bearing turns:

- if a planning or interview step returns questions to the user, the ACP runtime may terminate after the final response as long as the pending question and resume checkpoint are already persisted in DWEMR state

Because ACP spawn behavior is non-blocking, this workstream must define a concrete bridge for command handlers:

1. start/attach ACP execution
2. register run ownership in task/flow state
3. wait/poll through host-owned task/session state until terminal outcome or cancellation
4. surface the same final-message style response DWEMR users expect today

After step 4, the plan must allow the active runtime handle to disappear when the command has completed normally and DWEMR has already written the saved state needed for later continuation.

### 3. Session Continuity Mapping

Map current DWEMR session concepts onto ACP-native session concepts.

This includes:

- preserving stable DWEMR workflow continuity whether or not the exact same ACP session is reused
- preserving session continuity for repeated workflow turns
- deciding how command-scoped runs relate to durable ACP session identifiers

This section should explicitly classify continuity modes:

- required live continuity: long-running active commands that still need stop/status/cancel targeting
- optional live continuity: repeated ACP interaction where host/runtime support makes reuse beneficial
- no live continuity required: completed turns that returned a question or handoff and can later restart from saved DWEMR state

### 4. Runtime Option Mapping

Translate current runtime options onto ACP-native controls.

This includes:

- model selection
- subagent model overrides
- effort level
- working directory rules
- runtime health expectations

This workstream should also document whether a fresh ACP run created from saved DWEMR state can apply the same effective runtime options as the interrupted run, even when it does not reuse the exact same live ACP session.

This workstream must output an explicit compatibility decision table:

- preserved as-is
- translated to ACP-native equivalent
- supported with caveats
- deprecated/removed with migration messaging

The output of this workstream should clearly identify which current runtime knobs remain directly meaningful in an ACP-native world.

### 5. Incremental Rollout Strategy

Plan how ACP-native execution becomes available safely.

Possible strategies include:

- internal feature flag
- dual backend selection
- explicit migration toggle during development

The key rule is that ACP-native execution must be provable before any legacy removal happens.

This rollout plan must also preserve the platform contract gate:

- OpenClaw `2026.4.2` must be the declared minimum version before any code depends on `api.runtime.tasks.flows` or the deprecated alias `api.runtime.taskFlow`
- any later reduction of the minimum floor requires an explicit redesign of the runtime plan rather than an undocumented compatibility hope

## Deliverables

- an ACP-native execution backend
- a run/result strategy that preserves operator-facing command behavior
- a session continuity model for DWEMR under ACP-native execution
- runtime option mapping from current config to ACP-native controls
- canonical ACP-native run identity shape (`flowId`, `taskId`, `childSessionKey`, backend kind)
- a rollout strategy for testing and comparison against the legacy adapter

## Related Official Docs

- ACP agents and `runtime: "acp"`: <https://docs.openclaw.ai/tools/acp-agents>
- Session spawn behavior and non-blocking model: <https://docs.openclaw.ai/tools/subagents>
- Plugin runtime helpers: <https://docs.openclaw.ai/plugins/sdk-runtime>
- Task Flow as managed orchestration substrate: <https://docs.openclaw.ai/automation/tasks>

## Validation Requirements

- `/dwemr start`, `/dwemr plan`, `/dwemr continue`, and routed actions still produce coherent final output
- onboarding driver invocation still behaves correctly
- ACP-native runs can maintain continuity across repeated DWEMR usage
- model/effort settings still apply in a predictable way
- no workflow/state behavior changes are introduced by the runtime swap
- no routed command regresses into raw run-id/task-id output where DWEMR previously returned a final assistant response

## Risks To Manage

- ACP-native execution may be more asynchronous than the current local process path
- result delivery may not naturally match the current synchronous formatting model
- session identity and lifecycle may not map cleanly onto current command-scoped assumptions
- over-emphasizing live ACP session continuity could accidentally fight DWEMR's existing state-first resume model
- docs/runtime-surface drift across OpenClaw versions could make a seemingly documented helper unavailable on DWEMR's declared minimum version
- required ACP helper seams may be incomplete in current plugin runtime helper surfaces

## Exit Criteria

This phase is complete when:

- ACP-native execution can run real DWEMR workflow commands
- DWEMR can preserve recognizable operator-facing behavior on top of it
- runtime/session identity is stable enough for stop/status/doctor migration
- the ACP-native path is ready for operational surfaces to migrate in the next phase

## Handoff To Phase 4

Phase 4 should begin only once ACP-native execution is real and testable, because stop, status, and doctor must be built around actual session/task ownership instead of hypothetical future runtime behavior.

## Implementation Output

Phase 3 deliverables are captured in:

- [phase-3-acp-native-run-path-spec.md](./phase-3-acp-native-run-path-spec.md)
