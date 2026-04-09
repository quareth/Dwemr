# Phase 2 Implementation Plan: Execution Seam Extraction

## Intent

Create a clean internal runtime seam so DWEMR can switch execution backends without rewriting its command-routing, onboarding, and project-state logic all at once.

This phase is about isolation, not about changing how DWEMR behaves for users.

## Scope Guardrail

This phase is only about extracting the execution backend boundary.

It is **not** allowed to:

- switch production behavior to ACP-native execution yet
- change public command semantics
- redesign onboarding or provisioning
- change the installed Claude workflow
- remove compatibility code prematurely

## Phase Objective

Refactor DWEMR so the rest of the plugin depends on an internal runtime interface rather than directly depending on `child_process`, local command paths, and PID ownership.

At the end of this phase:

- the old spawn-based runtime should still work
- the plugin should behave the same as before
- execution logic should be replaceable behind a stable internal contract

## Core Design Direction

Split the current runtime responsibilities into a dedicated execution backend layer with clearly separated concerns:

- runtime discovery and readiness
- command execution
- health probing
- run identity/tracking
- stop/cancel behavior

Command handlers should call that layer, not shell-specific helpers directly.

## Workstreams

### 1. Runtime Interface Definition

Define the internal backend interface DWEMR will use.

The interface should cover:

- resolve execution readiness
- run a DWEMR Claude command
- probe runtime health
- ensure or resolve any runtime continuity needed for active execution
- stop or cancel an active run
- describe active-run identity in a backend-neutral way
- distinguish durable workflow state from transient runtime ownership so callers do not accidentally treat live runtime ids as the only resumption mechanism

The interface should avoid assuming:

- local executable paths
- PIDs
- Unix signals
- shell-command probes as the only health mechanism
- persistent runtime session continuity as a correctness requirement for commands that already resume from saved DWEMR state

### 2. Spawn Runtime Adapter

Wrap the current implementation behind the new seam.

This means the existing behavior should become a legacy adapter rather than the default architecture for the rest of the codebase.

This adapter should preserve:

- current command output behavior
- current doctor expectations
- current stop behavior
- current model/effort injection behavior

### 3. Caller Decoupling

Update command handlers and supporting runtime callers so they depend on the new runtime seam instead of on direct spawn-oriented helpers.

This should include:

- routed command execution
- onboarding driver invocation
- doctor execution
- stop execution
- runtime-preflight entrypoints

### 4. Backend-Neutral Run Identity

Replace or generalize local PID assumptions in the internal data model.

This phase should not remove PID support yet, but it should create a backend-neutral identity shape that later ACP-native work can use.

Examples of future-proof fields:

- backend kind
- run id
- session id or session key
- optional PID for legacy adapter compatibility

This model should also make one boundary explicit:

- a missing live run handle after a completed command is normal if DWEMR already wrote the checkpoint needed for later `/dwemr continue` or answer-bearing follow-up commands

### 5. Test Restructuring

Update tests so they validate behavior through the new runtime seam where appropriate.

The goal is to make later backend replacement possible without rewriting the entire suite.

## Deliverables

- a new internal runtime backend interface
- a legacy spawn-based backend adapter
- callers moved onto the new seam
- backend-neutral active-run identity model
- tests updated to target the seam where it matters

## Related Official Docs

- Plugin runtime helpers: <https://docs.openclaw.ai/plugins/sdk-runtime>
- Plugin authoring/building model: <https://docs.openclaw.ai/plugins/building-plugins>
- ACP harness runtime model: <https://docs.openclaw.ai/tools/acp-agents>

## Validation Requirements

- current install-time behavior is unchanged except for internal structure
- existing tests continue to pass
- no user-visible command output regressions
- doctor and stop still behave exactly as they did before this phase

## Risks To Manage

- leaking shell/PID assumptions into the new interface and making ACP-native migration harder
- making the seam too narrow and forcing later phases to reopen it
- making the seam too broad and bloating the refactor unnecessarily

## Exit Criteria

This phase is complete when:

- command handlers no longer rely on direct process-launch helpers
- the spawn-based runtime is isolated behind an adapter
- active-run tracking can represent more than just local processes
- the plugin still behaves the same in real use

## Handoff To Phase 3

Phase 3 should start with a stable seam already in place, so the ACP-native path can be added as a new backend instead of replacing behavior inline across the whole plugin.

## Implementation Output

Phase 2 deliverables are captured in:

- [phase-2-execution-seam-spec.md](./phase-2-execution-seam-spec.md)
