# runtime-backend.ts — Extraction Points

Module extraction plan for `plugins/dwemr/src/openclaw/runtime-backend.ts` (1328 lines). Each extraction is independently shippable. Zero behavior change — only file boundaries move.

Current file: `plugins/dwemr/src/openclaw/runtime-backend.ts`
Target: ~50-70 lines (registry + re-exports)

---

## E1. `runtime-backend-types.ts` — Type Definitions

**What moves:**
- `RuntimeTasksFlowsApi` (lines 33-41)
- `RuntimeTaskFlowApi` (lines 43-103)
- `RuntimeApiLike` (lines 105-113)
- `AcpRuntimeSummary` (lines 115-120)
- `DwemrRuntimeToolContext` (lines 122-125)
- `DwemrRuntimeContext` (lines 127-131)
- `DwemrRuntimeState` (lines 132-138)
- `DwemrRunCommandRequest` (lines 140-146)
- `DwemrRuntimeProbeRequest` (lines 148-153)
- `DwemrStopResult` (lines 155-159)
- `DwemrSessionInfo` (lines 161-174)
- `DwemrRuntimeBackend` (lines 176-187)
- `RuntimeBackendFactory` (line 189)
- `AcpFlowTracking` (lines 597-602)

**Lines saved:** ~155
**Risk:** None — pure type extraction, no runtime change.
**Dependencies:** Imports from `./active-runs`, `./claude-runner`, `./runtime`, `../control-plane/project-assets`.

**Phase:** 1 (do first — unblocks all other extractions)

---

## E2. `acp-config.ts` — ACP Configuration Resolution

**What moves:**
- `ACP_NATIVE_BACKEND_KIND` constant (line 28)
- `ACP_DEFAULT_AGENT` constant (line 29)
- `asRuntimeApi()` (lines 267-276)
- `normalizeOptionalString()` (lines 278-283)
- `normalizeAcpAgentId()` (lines 286-290)
- `resolveOpenClawConfig()` (lines 292-294)
- `resolveAcpConfig()` (lines 296-310)
- `resolveAcpBackendId()` (lines 312-315)
- `resolveAcpAgentId()` (lines 317-322)
- `resolveRuntimeTasksFlows()` (lines 324-326)
- `resolveLegacyTaskFlow()` (lines 328-330)
- `buildAcpRuntimeSummary()` (lines 332-339)
- `buildAcpSessionScopeKey()` (lines 341-351)
- `buildCommandScopedAcpSessionKey()` (lines 353-362)
- `buildOnboardingPersistentSessionKey()` (lines 364-372)
- `resolveRuntimeTimeoutSeconds()` (lines 392-400)
- `collectAcpRuntimeOptionCaveatNotes()` (lines 402-417)
- `buildAcpRuntimeOptionPatch()` (lines 419-429)
- `resolveOwnerSessionKey()` (lines 431-433)
- `collectAcpRuntimeOutput()` (lines 435-451)
- `formatAcpLifecycleError()` (lines 453-455)

**Lines saved:** ~170
**Risk:** Low — pure functions with no side effects.
**Dependencies:** Imports `RuntimeApiLike`, `AcpRuntimeSummary` from types file. Imports `getAcpRuntimeBackend`, `isAcpRuntimeError` from SDK.

**Phase:** 2

---

## E3. `acp-flow-tracking.ts` — Flow/Task Ledger Integration

**What moves:**
- `createAcpFlowTracking()` (lines 604-725)

**Lines saved:** ~125
**Risk:** Low — self-contained ledger integration. Best-effort by design (all catches are intentional no-ops).
**Dependencies:** Imports config resolvers from `acp-config.ts`, types from types file.

**Phase:** 3

---

## E4. `acp-session-lifecycle.ts` — Session Management Helpers

**What moves:**
- `closeAcpCommandSession()` (lines 457-509)
- `reconcileTrackedAcpRun()` (lines 511-549)
- `isAcpRuntimeReady()` (lines 551-595)
- `discoverAcpAgentPid()` (lines 374-390)

**Lines saved:** ~150
**Risk:** Medium — these functions interact with the ACP session manager and active run store. Must preserve exact error handling and return shapes.
**Dependencies:** Imports from `acp-config.ts`, types file, `active-runs`, SDK.

**Phase:** 4

---

## E5. `spawn-backend.ts` — Spawn Backend Implementation

**What moves:**
- `toSpawnRuntimeState()` (lines 193-199)
- `resolveReadyCommandPath()` (lines 201-206)
- `mapSpawnStopResult()` (lines 208-220)
- `createSpawnRuntimeBackend()` (lines 222-265)

**Lines saved:** ~75
**Risk:** Low — self-contained, delegates to `claude-runner` and `active-runs`.
**Dependencies:** Imports from `./runtime`, `./claude-runner`, `./active-runs`, types file.

**Phase:** 5

---

## E6. `acp-native-backend.ts` — ACP Native Backend Implementation

**What moves:**
- `createAcpNativeRuntimeBackend()` (lines 727-1295)

After E1-E4 are extracted, this factory becomes much smaller because it only contains the method implementations that compose the extracted helpers. The methods that remain:
- `inspectRuntime` — delegates to `isAcpRuntimeReady`
- `ensureRuntime` — delegates to `isAcpRuntimeReady`
- `runClaudeCommand` — orchestrates session init, flow tracking, turn execution, cleanup
- `probeClaudeRuntime` — orchestrates session init, doctor prompt, cleanup
- `findActiveRun` — delegates to store + reconciliation
- `stopActiveRun` — escalation chain (should be refactored per quality doc Q1)
- `closeStatefulSession` — single close call
- `listSessions` — run enumeration + enrichment
- `clearSessions` — batch cleanup

**Lines saved:** ~300 (after E1-E4 already extracted their pieces)
**Risk:** Medium-High — this is where most logic lives. Must preserve exact runtime behavior.
**Dependencies:** Imports from all extracted modules + SDK.

**Phase:** 6 (do last)

---

## Post-Extraction: `runtime-backend.ts` Residual

After all extractions, the file retains only:

```ts
// Re-exports for public API surface
export type { DwemrRuntimeBackend, DwemrRuntimeState, ... } from "./runtime-backend-types";
export { buildOnboardingPersistentSessionKey } from "./acp-config";

// Registry
const runtimeBackendRegistry = new Map<string, RuntimeBackendFactory>();
runtimeBackendRegistry.set("spawn", createSpawnRuntimeBackend);
runtimeBackendRegistry.set("acp-native", createAcpNativeRuntimeBackend);

let runtimeBackendOverride: string | undefined;

export function registerRuntimeBackend(kind, factory) { ... }
export function setRuntimeBackendOverride(kind) { ... }
export function getDefaultRuntimeBackend(options) { ... }
```

**Estimated size:** ~50-70 lines.

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
| 1 | `runtime-backend-types.ts` | ~155 | None | — |
| 2 | `acp-config.ts` | ~170 | Low | Phase 1 |
| 3 | `acp-flow-tracking.ts` | ~125 | Low | Phase 1-2 |
| 4 | `acp-session-lifecycle.ts` | ~150 | Medium | Phase 1-2 |
| 5 | `spawn-backend.ts` | ~75 | Low | Phase 1 |
| 6 | `acp-native-backend.ts` | ~300 | Medium-High | Phase 1-4 |
| **Total** | | **~975 lines extracted** | | |

Final `runtime-backend.ts`: **~50-70 lines** (down from 1328).
