# Phase 4 Stop/Status/Doctor Migration Spec (Implemented)

## Goal Achieved

DWEMR operator runtime controls now run on ACP-native runtime ownership semantics
instead of PID-first process semantics for normal control flows.

Phase 4 keeps legacy spawn compatibility, but the default operational path is now
runtime-owner based (`acp-native`) for stop/status/doctor behavior.

## Implemented Artifacts

## 1. Runtime-owner stop semantics

Implemented in:

- `plugins/dwemr/src/openclaw/backend/runtime-backend.ts`
- `plugins/dwemr/src/openclaw/cli/action-handlers.ts`

Behavior:

- ACP-native stop resolves active run identity via backend-neutral run records
- cancellation order is explicit:
  1. attempt `taskFlow.cancel` when `flowId` + owner session are available
  2. fallback to ACP `cancelSession` when needed
- active-run records are cleared on successful stop paths
- stop results are reported in runtime-owner language (`runtime_cancel` mechanism)

## 2. Active run identity for control surfaces

Implemented in:

- `plugins/dwemr/src/openclaw/state/active-runs.ts`
- `plugins/dwemr/src/openclaw/backend/runtime-backend.ts`

Behavior:

- active run identity now carries ACP control linkage used by Phase 4 surfaces:
  - `backendKind`
  - `runId`
  - `flowId` (best-effort)
  - `taskId` (best-effort)
  - `childSessionKey`
  - `ownerSessionKey`
- compatibility spawn identity remains supported during transition

## 3. Status surface migration

Implemented in:

- `plugins/dwemr/src/openclaw/cli/action-handlers.ts`
- `plugins/dwemr/src/control-plane/pipeline-state.ts`

Behavior:

- status output now reports `Runtime owner` instead of process/PID-first status
- status explicitly distinguishes:
  - active runtime owner in flight
  - no owner because waiting on saved user input checkpoint
  - no owner in flight (idle)
- bootstrap and profile-installed status views share runtime-owner language

## 4. Doctor surface migration

Implemented in:

- `plugins/dwemr/src/openclaw/diagnostics/doctor.ts`

Behavior:

- doctor runtime section is ACP-first:
  - runtime backend and readiness
  - ACP seam availability (`tasks.flows` required, `taskFlow` compatibility)
- shell/ACPX checks are demoted to `Legacy ACPX compatibility diagnostics`
- doctor includes `Runtime ledger` notes to describe:
  - expected no-owner states (for saved user-input waits)
  - active owner linkage
  - degraded identity edge cases

## 5. Compatibility messaging updates

Implemented in:

- `plugins/dwemr/README.md`
- `plugins/dwemr/src/openclaw/cli/action-handlers.ts`

Behavior:

- stop/status/doctor guidance now uses runtime-owner terminology for normal flows
- legacy spawn details remain available as compatibility metadata where needed

## 6. Test coverage for Phase 4 behavior

Implemented in:

- `plugins/dev/tests/runtime-backend.test.ts`
- `plugins/dev/tests/action-handlers.test.ts`
- `plugins/dev/tests/onboarding.test.ts`

Coverage includes:

- stop cancellation order (`taskFlow.cancel` before session fallback)
- flow-cancel failure fallback to ACP session cancel
- status runtime-owner wording
- doctor runtime-ledger rendering and ACP-first runtime section expectations

## User-Visible Migration Checklist

- [x] `/dwemr stop` keeps operator intent but no longer depends on signal-only wording.
- [x] `/dwemr status` surfaces runtime-owner state and waiting-on-user-input idle states.
- [x] `/dwemr doctor` reports ACP-native runtime truth first.
- [x] Legacy ACPX shell diagnostics are compatibility-only, not primary runtime truth.

## Validation Results

Validated in `plugins/dwemr`:

- `npm run typecheck` (pass)
- `npm test -- --runInBand --reporter=dot` (pass; 110/110)

## Exit Criteria Mapping

Phase 4 exit criteria status:

- [x] stop/status/doctor work against the ACP-native runtime path.
- [x] users can operate DWEMR without relying on the old process model.
- [x] legacy runtime code is no longer needed for normal control flows (spawn remains compatibility fallback).

## Notes for Phase 5

Phase 5 can now focus on cleanup/deprecation:

- remove or further isolate legacy spawn/PID assumptions
- tighten config surface around ACP-native defaults
- simplify operator docs once compatibility overlap is reduced
