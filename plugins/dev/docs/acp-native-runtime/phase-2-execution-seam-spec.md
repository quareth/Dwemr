# Phase 2 Execution Seam Spec (Implemented)

## Goal Achieved

DWEMR now has an internal runtime backend seam so command handlers and doctor flows no longer depend directly on spawn/PID helper modules.

Current behavior is preserved through a legacy spawn adapter.

## Implemented Artifacts

## 1. Runtime backend interface

Implemented in:

- `plugins/dwemr/src/openclaw/backend/runtime-backend.ts`

This introduces `DwemrRuntimeBackend` with backend-neutral operations for:

- runtime readiness inspection/bootstrap with backend-neutral `DwemrRuntimeState`
- runtime-ready evaluation through `DwemrRuntimeState.ready` without requiring executable-path assumptions in callers
- Claude command execution via request objects (no `commandPath` parameter in caller-facing contract)
- Claude runtime probing via request objects (no `commandPath` parameter in caller-facing contract)
- active run lookup
- active run stop/cancel

## 2. Legacy spawn adapter

Implemented in:

- `plugins/dwemr/src/openclaw/backend/runtime-backend.ts`

`getDefaultRuntimeBackend()` returns the current spawn-based adapter (`kind: "spawn"`), wrapping:

- `runtime.ts` runtime discovery/bootstrap
- `claude-runner.ts` process execution/probe
- `active-runs.ts` PID tracking and stop behavior

This preserves current behavior while making backend replacement additive for Phase 3.

## 3. Caller decoupling completed

### Action handlers decoupled

Updated:

- `plugins/dwemr/src/openclaw/cli/action-handlers.ts`

Changes:

- removed direct runtime dependency on `active-runs.ts` and `runClaudeCommand`
- all run/stop/find calls now go through `runtimeBackend`
- preflight returns backend-neutral runtime state instead of command paths and handlers pass runtime state through backend requests
- runtime backend is resolved per-handler call (`ctx.runtimeBackend` override or default) instead of a module-captured singleton
- stop result surface is backend-neutral (`mechanism`) instead of Unix-signal-only typing

### Doctor flow decoupled

Updated:

- `plugins/dwemr/src/openclaw/diagnostics/doctor.ts`

Changes:

- `runDwemrDoctor(...)` now accepts optional runtime backend (defaulted to seam)
- `preflightExecution(...)` now accepts optional runtime backend (defaulted to seam)
- runtime inspect/bootstrap/probe operations use backend interface, not direct module coupling

## 4. Backend-neutral run identity model

Updated:

- `plugins/dwemr/src/openclaw/state/active-runs.ts`

Added:

- `DwemrRunIdentity` with backend-neutral fields:
  - `backendKind`
  - `runId`
  - `flowId` (optional)
  - `taskId` (optional)
  - `childSessionKey` (optional)
  - `pid` (optional compatibility field)

Compatibility behavior:

- existing PID-first entries remain valid
- normalization auto-generates a legacy spawn identity when old entries have no `identity`
- non-spawn run records can be stored without PID/session/claude-command fields
- stale pruning applies only to spawn-backed PID runs; non-spawn records are preserved

## 5. Preserved behavior statement

No user-facing command intent changes were introduced in this phase.

Specifically preserved:

- routed command output formatting
- doctor output model
- stop behavior semantics/messages
- active run status usage in status surfaces

## Exit Criteria Mapping

Phase 2 exit criteria status:

- [x] Command handlers no longer rely on direct process-launch helpers.
- [x] Spawn runtime isolated behind adapter seam.
- [x] Active-run model can represent non-PID backends (identity shape added).
- [x] Existing behavior preserved by default legacy backend.

## Notes for Phase 3

Phase 3 can add an ACP-native backend implementing `DwemrRuntimeBackend` without rewriting action handlers/doctor surfaces again.
