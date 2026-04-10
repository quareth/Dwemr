# runtime-backend.ts — Extraction Points (COMPLETED)

Module extraction plan for `plugins/dwemr/src/openclaw/backend/runtime-backend.ts` (1331 lines → 53 lines). All phases complete. Zero behavior change — only file boundaries moved.

**Status:** All 6 extractions completed. Residual `runtime-backend.ts` is 53 lines.

**Implementation notes:**
- Flow-related types (`FlowRevision`, `BoundFlowViews`, `BoundTaskFlow`, etc.) were placed in E1 (`runtime-backend-types.ts`) instead of E3 to avoid circular type dependencies between E1 and E3.
- `reconcileTrackedAcpRun` (E4) calls `clearActiveRun` from `./active-runs` directly instead of using `clearAcpActiveRun` (E6), avoiding a circular dependency between E4 and E6.

Original file: `plugins/dwemr/src/openclaw/backend/runtime-backend.ts`
Final size: 53 lines (registry + re-exports)

---

## E1. `runtime-backend-types.ts` — Type Definitions

**What moves:**
- `RuntimeTasksFlowsApi` (lines 123-125)
- `RuntimeTaskFlowApi` (lines 127-129)
- `RuntimeApiLike` (lines 131-137)
- `AcpRuntimeSummary` (lines 139-144)
- `DwemrRuntimeToolContext` (lines 146-149)
- `DwemrRuntimeContext` (lines 151-154)
- `DwemrRuntimeState` (lines 156-162)
- `DwemrRunCommandRequest` (lines 164-170)
- `DwemrRuntimeProbeRequest` (lines 172-177)
- `DwemrStopResult` (lines 179-183)
- `DwemrSessionInfo` (lines 185-198)
- `DwemrRuntimeBackend` (lines 200-211)
- `RuntimeBackendFactory` (line 213)

**Lines saved:** ~90
**Risk:** None — pure type extraction, no runtime change.
**Dependencies:** Imports from `./active-runs`, `./claude-runner`, `./runtime`, `../control-plane/project-assets`.

**Phase:** 1 (do first — unblocks all other extractions)

---

## E2. `acp-config.ts` — ACP Configuration Resolution

**What moves:**
- `ACP_NATIVE_BACKEND_KIND` constant (line 28)
- `ACP_DEFAULT_AGENT` constant (line 29)
- `asRuntimeApi()` (lines 291-300)
- `normalizeOptionalString()` (lines 302-308)
- `normalizeAcpAgentId()` (lines 310-314)
- `resolveOpenClawConfig()` (lines 316-318)
- `resolveAcpConfig()` (lines 320-334)
- `resolveAcpBackendId()` (lines 336-339)
- `resolveAcpAgentId()` (lines 341-346)
- `resolveRuntimeTasksFlows()` (lines 348-350)
- `resolveLegacyTaskFlow()` (lines 352-354)
- `buildAcpRuntimeSummary()` (lines 356-363)
- `buildAcpSessionScopeKey()` (lines 365-375)
- `buildCommandScopedAcpSessionKey()` (lines 377-386)
- `buildOnboardingPersistentSessionKey()` (lines 388-393)
- `resolveRuntimeTimeoutSeconds()` (lines 413-421)
- `collectAcpRuntimeOptionCaveatNotes()` (lines 423-438)
- `buildAcpRuntimeOptionPatch()` (lines 440-450)
- `resolveOwnerSessionKey()` (lines 452-454)
- `collectAcpRuntimeOutput()` (lines 456-472)
- `formatAcpLifecycleError()` (lines 474-476)

**Lines saved:** ~185
**Risk:** Low — pure functions with no side effects.
**Dependencies:** Imports `RuntimeApiLike`, `AcpRuntimeSummary` from types file. Imports `getAcpRuntimeBackend`, `isAcpRuntimeError` from SDK.

**Phase:** 2

---

## E3. `acp-flow-tracking.ts` — Flow/Task Ledger Integration

**What moves:**
- `FlowRevision` (line 41)
- `BoundFlowViews` (lines 43-49)
- `CreateManagedFlowParams` (lines 51-62)
- `RunTaskParams` (lines 64-79)
- `RunTaskResult` (lines 81-87)
- `FinishFlowParams` (lines 89-95)
- `FailFlowParams` (lines 97-105)
- `RequestCancelParams` (lines 107-111)
- `BoundTaskFlow` (lines 113-121)
- `AcpFlowTracking` type (lines 625-630)
- `NOOP_FLOW_TRACKING` constant (line 632)
- `createAcpFlowTracking()` (lines 634-747)

**Lines saved:** ~155
**Risk:** Low — self-contained ledger integration. Best-effort by design (all catches are intentional no-ops). The flow-related types (`FlowRevision`, `BoundFlowViews`, `BoundTaskFlow`, and associated param/result types) are only consumed within this module.
**Dependencies:** Imports config resolvers (`resolveRuntimeTasksFlows`, `resolveLegacyTaskFlow`) from `acp-config.ts`, `RuntimeTasksFlowsApi`/`RuntimeTaskFlowApi` from types file.

**Phase:** 3

---

## E4. `acp-session-lifecycle.ts` — Session Management Helpers

**What moves:**
- `ACP_LIFECYCLE_REASONS` constant (lines 33-39)
- `discoverAcpAgentPid()` (lines 395-411)
- `closeAcpSession()` (lines 478-493)
- `closeAcpCommandSession()` (lines 495-540)
- `reconcileTrackedAcpRun()` (lines 542-577)
- `isAcpRuntimeReady()` (lines 579-623)

**Lines saved:** ~165
**Risk:** Medium — these functions interact with the ACP session manager and active run store. Must preserve exact error handling and return shapes.
**Dependencies:** Imports from `acp-config.ts`, types file, `active-runs`, SDK (`getAcpSessionManager`, `readAcpSessionEntry`, `isAcpRuntimeError`).

**Phase:** 4

---

## E5. `spawn-backend.ts` — Spawn Backend Implementation

**What moves:**
- `toSpawnRuntimeState()` (lines 217-223)
- `resolveReadyCommandPath()` (lines 225-230)
- `mapSpawnStopResult()` (lines 232-244)
- `createSpawnRuntimeBackend()` (lines 246-289)

**Lines saved:** ~75
**Risk:** Low — self-contained, delegates to `claude-runner` and `active-runs`.
**Dependencies:** Imports from `./runtime`, `./claude-runner`, `./active-runs`, types file.

**Phase:** 5

---

## E6. `acp-native-backend.ts` — ACP Native Backend Implementation

**What moves:**
- `ACP_NATIVE_DOCTOR_PROMPT_TEXT` constant (line 30)
- `ACP_NATIVE_DOCTOR_PROMPT_EXPECTED` constant (line 31)
- `createAcpEventCollector()` (lines 749-759)
- `initAcpOneshotSession()` (lines 761-784)
- `applySessionMeta()` (lines 786-797)
- `resolveRunPid()` (lines 799-801)
- `findAcpActiveRun()` (lines 803-805)
- `loadAcpActiveRuns()` (lines 807-809)
- `clearAcpActiveRun()` (lines 811-813)
- `buildTurnEventHandler()` (lines 815-855)
- `buildSuccessResult()` (lines 857-865)
- `buildErrorResult()` (lines 867-875)
- `StopAttemptResult` type (lines 877-880)
- `attemptFlowCancel()` (lines 882-903)
- `attemptSessionCancel()` (lines 905-928)
- `attemptOsKill()` (lines 930-945)
- `createAcpNativeRuntimeBackend()` (lines 947-1298)

The factory's method implementations compose the extracted helpers:
- `inspectRuntime` / `ensureRuntime` — delegate to `isAcpRuntimeReady` (from E4)
- `runClaudeCommand` — orchestrates session init, flow tracking, turn execution, cleanup
- `probeClaudeRuntime` — orchestrates session init, doctor prompt, cleanup
- `findActiveRun` — delegates to store + reconciliation (from E4)
- `stopActiveRun` — escalation chain (flow cancel → session cancel → OS kill)
- `closeStatefulSession` — single close call
- `listSessions` — run enumeration + enrichment
- `clearSessions` — batch cleanup

**Lines saved:** ~550
**Risk:** Medium-High — this is where most logic lives. Must preserve exact runtime behavior.
**Dependencies:** Imports from all extracted modules + SDK + `active-runs`.

**Phase:** 6 (do last)

---

## Post-Extraction: `runtime-backend.ts` Residual

After all extractions, the file retains only:

```ts
// Re-exports for public API surface
export type { DwemrRuntimeBackend, DwemrRuntimeState, ... } from "./runtime-backend-types";
export { buildOnboardingPersistentSessionKey, buildAcpRuntimeOptionPatch } from "./acp-config";

// Registry
import { createSpawnRuntimeBackend } from "./spawn-backend";
import { createAcpNativeRuntimeBackend } from "./acp-native-backend";

const runtimeBackendRegistry = new Map<string, RuntimeBackendFactory>();
runtimeBackendRegistry.set("spawn", createSpawnRuntimeBackend);
runtimeBackendRegistry.set("acp-native", createAcpNativeRuntimeBackend);

let runtimeBackendOverride: string | undefined;

export function registerRuntimeBackend(kind, factory) { ... }
export function setRuntimeBackendOverride(kind) { ... }

function shouldAutoUseAcpNative(context?, runtimeConfig?) { ... }
export function getDefaultRuntimeBackend(options) { ... }
```

**Estimated size:** ~60-80 lines.

---

## Dependency Graph (Post-Extraction)

```
runtime-backend.ts  (registry + public API)
  ├── spawn-backend.ts
  │     ├── runtime-backend-types.ts
  │     ├── ./runtime
  │     ├── ./claude-runner
  │     └── ./active-runs
  └── acp-native-backend.ts
        ├── runtime-backend-types.ts
        ├── acp-config.ts
        │     └── runtime-backend-types.ts
        ├── acp-flow-tracking.ts
        │     ├── runtime-backend-types.ts
        │     └── acp-config.ts
        ├── acp-session-lifecycle.ts
        │     ├── runtime-backend-types.ts
        │     ├── acp-config.ts
        │     └── ./active-runs
        └── ./active-runs
```

---

## Phase Summary

| Phase | Module | Lines Moved | Risk | Depends On |
|---|---|---|---|---|
| 1 | `runtime-backend-types.ts` | ~90 | None | — |
| 2 | `acp-config.ts` | ~185 | Low | Phase 1 |
| 3 | `acp-flow-tracking.ts` | ~155 | Low | Phase 1-2 |
| 4 | `acp-session-lifecycle.ts` | ~165 | Medium | Phase 1-2 |
| 5 | `spawn-backend.ts` | ~75 | Low | Phase 1 |
| 6 | `acp-native-backend.ts` | ~550 | Medium-High | Phase 1-4 |
| **Total** | | **~1220 lines extracted** | | |

Final `runtime-backend.ts`: **~60-80 lines** (down from 1331).
