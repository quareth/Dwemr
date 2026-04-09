# Phase 3 ACP-Native Run Path Spec (Implemented)

## Goal Achieved

DWEMR now has a working ACP-native runtime backend that can execute real `/dwemr`
routed workflow commands through OpenClaw-managed ACP session controls, while
keeping the legacy spawn backend available as a compatibility path.

## Implemented Artifacts

## 1. ACP-native backend implementation

Implemented in:

- `plugins/dwemr/src/openclaw/runtime-backend.ts`

Added backend:

- `kind: "acp-native"`
- runtime readiness inspection tied to OpenClaw ACP runtime availability
- ACP command execution via `getAcpSessionManager()`:
  - `initializeSession(...)`
  - `updateSessionRuntimeOptions(...)`
  - `runTurn(...)`
- ACP-native doctor probe path that runs a health-check prompt through ACP

No plugin-owned `child_process` seam is used in this backend.

## 2. Backend selection and rollout strategy

Implemented in:

- `plugins/dwemr/src/openclaw/runtime-backend.ts`
- `plugins/dwemr/src/openclaw/action-handlers.ts`

Behavior:

- backend can still be explicitly overridden (`spawn` or `acp-native`)
- when no explicit backend is selected, DWEMR auto-selects ACP-native if runtime
  context exposes the required OpenClaw seams
- otherwise DWEMR falls back to `spawn`

This keeps rollout incremental while making ACP-native execution usable now.

## 3. ACP-native run/result delivery contract

Implemented in:

- `plugins/dwemr/src/openclaw/runtime-backend.ts`

Behavior:

- routed command turns run as ACP prompt turns
- final assistant output is reconstructed from ACP `text_delta` output stream
- DWEMR still returns final-message style command output through existing
  `formatRunnerResult(...)` surfaces
- timed-out ACP turns are surfaced as timed-out DWEMR command failures

## 4. Session continuity model

Implemented in:

- `plugins/dwemr/src/openclaw/runtime-backend.ts`

Behavior:

- ACP-native routed commands now run as one-shot ACP sessions with
  command-scoped child session keys.
- command turns use request-scoped run ids (`dwemr-<uuid>`).
- continuity remains state-first in `.dwemr/state/*`; repeated `/dwemr` usage
  does not depend on reusing one durable live ACP session id.

## 5. Runtime option mapping

Implemented in:

- `plugins/dwemr/src/openclaw/runtime-backend.ts`

Current ACP-native mapping:

- `model` -> ACP runtime option `model` (preserved)
- `timeoutMs` -> ACP runtime option `timeoutSeconds` (translated; `null` keeps ACP timeout unset)
- working directory -> ACP runtime `cwd` (preserved)
- `subagentModel` and `effortLevel` -> currently not hard-mapped to a guaranteed
  ACP-native control key (supported with caveat)

## 6. Canonical run identity shape

Implemented in active run records for ACP-native turns:

- `backendKind: "acp-native"`
- `runId` (request-scoped run id)
- `flowId` (when TaskFlow ledger creation succeeds)
- `taskId` (when TaskFlow child task creation succeeds)
- `childSessionKey` (ACP session key)

Code path:

- `plugins/dwemr/src/openclaw/runtime-backend.ts`
- persisted through `plugins/dwemr/src/openclaw/active-runs.ts`

## 7. Task/flow orchestration seam usage

Implemented in:

- `plugins/dwemr/src/openclaw/runtime-backend.ts`

Behavior:

- `api.runtime.tasks.flows` is required and used as the primary flow-view seam
- `api.runtime.taskFlow` is optional and used only as a compatibility mutation
  seam for best-effort managed flow/task creation/completion during migration

## Exit Criteria Mapping

Phase 3 exit criteria status:

- [x] ACP-native execution can run real DWEMR workflow commands.
- [x] DWEMR preserves recognizable operator-facing final-output behavior.
- [x] Runtime/session identity is persisted in backend-neutral active-run shape.
- [x] ACP-native run path is operational and ready for Phase 4 stop/status/doctor migration expansion.

## Notes for Phase 4

Phase 4 should now migrate operator surfaces fully around ACP-native runtime
ownership, including richer status introspection and doctor output tuned for ACP
controls rather than spawn/runtime bootstrap assumptions.
