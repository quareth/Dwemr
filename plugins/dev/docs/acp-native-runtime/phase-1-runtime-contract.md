# Phase 1 Implementation Plan: Runtime Contract Definition

## Intent

Define the exact runtime contract DWEMR must preserve while moving execution ownership from plugin-launched host processes to OpenClaw-managed ACP runtime controls.

This phase exists to prevent the refactor from accidentally changing product behavior while chasing install-safety improvements.

## Scope Guardrail

This phase is only about defining the execution-runtime contract.

It is **not** allowed to:

- redesign the DWEMR workflow
- change public `/dwemr` command intent
- change project-state semantics
- change provisioning packs or onboarding logic
- rewrite the underlying Claude workflow that runs inside initialized projects

## Phase Objective

Produce a stable, explicit contract that separates:

- behavior DWEMR must keep
- runtime mechanisms that are allowed to change
- legacy runtime features that may be kept temporarily, deprecated later, or removed after migration

Without this phase, later implementation work risks turning a runtime refactor into a product redesign.

## What Must Stay Unchanged

The following should be treated as contract-level behavior unless a later decision explicitly changes them:

- the public `/dwemr` command surface
- the meaning of `start`, `plan`, `continue`, `status`, `what-now`, `doctor`, and `stop`
- the project-local DWEMR bootstrap and provisioning model
- the Claude-native workflow installed into target projects
- the state-first control-plane model in `.dwemr/state/*`
- the rule that durable workflow resumption depends on saved DWEMR state, not on a still-live ACP session or task
- the expectation that DWEMR returns coherent operator-facing output for each command

## What Is Allowed To Change

The following are implementation details and may change during the refactor:

- whether DWEMR spawns `acpx` or `claude` directly
- how Claude sessions are created and resumed
- how active runs are tracked internally
- whether stop uses local process signals or ACP-native cancellation
- how doctor validates runtime readiness
- whether ACPX bootstrap/path ownership remains a first-class runtime concern

## Key Questions To Resolve

- Which current runtime behaviors are user-visible guarantees versus local implementation details?
- Can command execution remain effectively synchronous from the user perspective while using ACP-native orchestration under the hood?
- What is the canonical runtime API call graph from a `/dwemr` tool invocation to an ACP-backed run result?
- Which user journeys require live runtime continuity, and which are correctly modeled as a fresh run from saved DWEMR state?
- How should DWEMR represent the split between durable workflow continuity and transient runtime/session continuity?
- Which runtime configuration keys remain supported during migration?
- What is the compatibility policy for `model`, `subagentModel`, and `effortLevel` under ACP-native execution?
- What is the compatibility position for legacy installs that still rely on `acpxPath` or managed runtime bootstrap?
- What is the minimum acceptable behavior for `/dwemr stop`, `/dwemr doctor`, and `/dwemr status` after migration?

## Workstreams

### 1. Current Runtime Inventory

Document the current runtime responsibilities:

- command execution
- session creation
- health probing
- run tracking
- stop behavior
- runtime discovery/bootstrap
- model/effort injection

This inventory should identify both the current code locations and the user-facing effect of each behavior.

### 2. Contract Boundary Definition

Write down the user-visible guarantees that later phases are not allowed to break.

This should include:

- public command expectations
- expected success/failure output patterns
- onboarding/provisioning sequencing requirements
- stop/resume expectations
- minimum runtime diagnostics expectations
- the canonical truth order: `.dwemr/state/*` for workflow progress first, runtime task/session state only for active in-flight execution

### 3. Legacy Feature Classification

Classify current runtime features into:

- required for compatibility
- temporary compatibility shims
- legacy features to deprecate later

This classification should cover:

- `acpxPath`
- managed runtime bootstrap
- PID-based run tracking
- shell-based doctor probes
- path-discovery logic

### 4. Acceptance Contract

Define a refactor acceptance contract that later phases can test against.

This contract should answer:

- what “same behavior” means in practice
- which differences are acceptable if the user workflow remains the same
- what must be proven before the old runtime path can be removed
- when it is acceptable for `/dwemr continue` or a reply-bearing follow-up to create a new ACP run from saved state instead of resuming an older live runtime session

### 5. Runtime API Contract And Prerequisites

Define the exact OpenClaw runtime surfaces DWEMR is allowed to rely on for ACP-native execution.

This workstream should produce:

- a canonical runtime API map for the pinned platform floor of OpenClaw `2026.4.2`, with `api.runtime.tasks.flows` treated as the primary required runtime seam and `api.runtime.taskFlow` documented only as a deprecated alias if needed
- a decision on the session/task wait strategy required to preserve current final-message command behavior
- a continuity contract that distinguishes workflow durability from runtime ownership, including which commands may safely complete, return control, and later restart from saved state
- a platform-floor decision record that freezes DWEMR on the raised OpenClaw floor of `2026.4.2` for ACP-native implementation work
- an explicit list of required platform capabilities that are currently missing and must land before legacy runtime removal
- a strict rule that normal execution cannot depend on plugin-owned `child_process` seams after migration

## Deliverables

- a runtime contract document
- a current-vs-target runtime responsibility map
- a preserved-behavior checklist for later phases
- a legacy-runtime classification table
- a runtime API mapping table (current seam vs ACP-native seam)
- a minimum-supported-OpenClaw capability matrix centered on the raised floor of `2026.4.2`
- a command-completion contract (synchronous expectations, acceptable async behavior, timeout/cancel outcomes)
- a runtime-option compatibility matrix (`model`, `subagentModel`, `effortLevel`, legacy ACPX keys)
- a continuity matrix (durable workflow checkpoint vs active runtime handle, per command family)
- a migration acceptance checklist

## Related Official Docs

- Plugin install and dangerous-install bypass: <https://docs.openclaw.ai/cli/plugins>
- Plugin security/code-safety findings model: <https://docs.openclaw.ai/gateway/security>
- Plugin runtime helpers: <https://docs.openclaw.ai/plugins/sdk-runtime>
- ACP harness runtime model: <https://docs.openclaw.ai/tools/acp-agents>
- Session spawn behavior and non-blocking semantics: <https://docs.openclaw.ai/tools/subagents>
- Task lifecycle and cancellation model: <https://docs.openclaw.ai/automation/tasks>

## Risks To Manage

- treating implementation details as public contract and locking the refactor unnecessarily
- treating user-visible behavior as incidental and breaking command UX
- underestimating how much of doctor/stop/status is coupled to the current process model

## Exit Criteria

This phase is complete when:

- there is a written runtime contract future phases can follow
- preserved user-facing behaviors are explicit
- allowed runtime changes are explicit
- legacy runtime concerns are classified
- later phases can implement against the contract without revisiting scope every time

## Handoff To Phase 2

Phase 2 should begin only after this phase makes one thing clear:

which runtime responsibilities need to move behind a backend seam, and which caller behaviors must remain stable while that seam is introduced.

## Implementation Output

Phase 1 deliverables are captured in:

- [phase-1-runtime-contract-spec.md](./phase-1-runtime-contract-spec.md)
