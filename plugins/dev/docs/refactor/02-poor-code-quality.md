# runtime-backend.ts — Poor Code Quality

Issues from the original `plugins/dwemr/src/openclaw/runtime-backend.ts` that were addressed during the module extraction refactor. All items resolved — code now lives in focused modules per `03-extraction-points.md`.

---

## Q1. `stopActiveRun` has a three-tier try/catch with repeated cleanup

**Location:** Lines 1048-1148 (~100 lines)

The method implements a three-tier escalation strategy (flow cancel → session cancel → OS kill). Each tier has its own try/catch and its own `clearAcpActiveRun` call (3 occurrences). The nesting reaches 3 levels deep in the OS-kill fallback path. The `flowCancelError` variable is threaded across tiers to build composite error messages.

**Current structure (simplified):**
```ts
async stopActiveRun(stateDir, projectPath) {
  const run = await findAcpActiveRun(...);
  if (!run) return not_found;

  let flowCancelError;
  if (cfg && flowId && ownerSessionKey) {
    if (boundTaskFlow?.cancel) {
      try {
        await boundTaskFlow.cancel(...);
        await clearAcpActiveRun(...);     // cleanup #1
        return stopped;
      } catch (error) {
        flowCancelError = ...;
      }
    }
  }

  if (!cfg || !sessionKey) {
    await clearAcpActiveRun(...);         // cleanup #2
    return failed;
  }

  try {
    await manager.cancelSession(...);
    try { await closeAcpSession(...); } catch { }
    await clearAcpActiveRun(...);         // cleanup #3
    return stopped;
  } catch (error) {
    const pid = resolveRunPid(run);
    if (pid && isProcessRunning(pid)) {
      const killResult = await killProcessWithEscalation(pid);
      if (killResult.status === "killed" || ...) {
        await clearAcpActiveRun(...);     // cleanup #4 (inside catch)
        return stopped;
      }
    }
    return failed;
  }
}
```

**Recommended approach:** Extract each escalation tier into a helper that returns a uniform result, then compose them linearly with early returns. The `clearAcpActiveRun` call can be consolidated to a single site after any successful stop.

---

## Q2. Inline type definitions are verbose and ad-hoc (lines 33-113)

~80 lines of deeply nested inline types (`RuntimeTasksFlowsApi`, `RuntimeTaskFlowApi`, `RuntimeApiLike`) with heavy use of `unknown` and anonymous return types from `bindSession`.

**Problems:**
- SDK-facing contracts embedded inline in an implementation file
- Heavy use of `unknown` — provides no type safety while adding visual noise
- The bound session return types are anonymous, so they can't be referenced or tested independently

**Fix:** Move to a dedicated types file. Name the bound session types (`BoundFlowView`, `BoundTaskFlow`) so they can be referenced independently.

---

## Q3. `runClaudeCommand` mixes execution, diagnostics, and bookkeeping

**Location:** Lines 803-930+ (~130 lines)

This single method handles: runtime readiness check, session key generation, ACP session initialization, PID discovery, flow tracking creation, active run registration, turn execution with event collection, diagnostics summary construction, flow tracking finalization, output collection, session cleanup, and active run cleanup.

The try block alone is ~100 lines. The inline diagnostics construction (turn event filtering, duration formatting, JSON serialization of diag events) obscures the actual execution flow.

Note: Session initialization has already been extracted into `initAcpOneshotSession` (line 737), so some decomposition has started.

**Fix:** Continue decomposing — extract bookkeeping (active run registration), diagnostics construction, and result assembly into focused helpers.

---

## ~~Q4. `listSessions` enrichment logic is verbose and repetitive~~ — RESOLVED

Already fixed. The `applySessionMeta` helper (line 762) now handles field copying from both sources. The two-pass pattern in `listSessions` calls `applySessionMeta` at lines 1198 and 1206.

---

## Q5. `clearSessions` duplicates the cancel+close+kill escalation from `stopActiveRun`

**Location:** Lines 1224-1277

Both `clearSessions` and `stopActiveRun` implement the same cancel → close → OS kill escalation, but independently. However, the two methods have different semantics: `clearSessions` operates in a batch loop with simple success/fail counting, while `stopActiveRun` returns detailed per-run diagnostics with mechanism metadata.

**Severity: Low-Medium.** The duplication is real but the divergent return shapes mean sharing code requires a common escalation helper that both callers wrap differently. Worth doing if Q1 is refactored, but not high-impact on its own.

---

## Q6. Magic strings scattered throughout

Lifecycle reason strings are used inline:

| String | Occurrences | Context |
|---|---|---|
| `"dwemr-stop"` | Line 1103 | Cancel reason |
| `"dwemr-stop-cleanup"` | Line 1106 | Close reason |
| `"dwemr-sessions-clear"` | Lines 1240, 1246 | Cancel/close reason |
| `"dwemr-command-cleanup"` | Line 492 | Close reason |
| `"dwemr-onboarding-complete"` | Line 1156 | Close reason |
| `"dwemr/acp-native"` | Line 643 | Controller ID |
| `"oneshot"` | Lines 164 (type), 751 | Session mode |

Most of these are single-use strings. `"dwemr-sessions-clear"` appears twice (cancel + close in the same block). The controller ID `"dwemr/acp-native"` is semantically distinct from the backend kind constant.

**Severity: Low.** Extracting constants for single-use strings adds indirection without safety benefit. Only worth doing for strings that appear in 3+ locations or are likely to be checked against elsewhere.

---

## Summary

| ID | Issue | Severity | Status |
|---|---|---|---|
| Q1 | `stopActiveRun` repeated cleanup across try/catch tiers | Medium | **Resolved** — linear escalation via helpers in `acp-native-backend.ts` |
| Q2 | Inline types are verbose/ad-hoc | Medium | **Resolved** — named types in `runtime-backend-types.ts` |
| Q3 | `runClaudeCommand` does too many things | Medium-High | **Resolved** — helpers extracted to `acp-native-backend.ts` |
| Q4 | `listSessions` repetitive field copying | — | **Resolved** (`applySessionMeta` in `acp-native-backend.ts`) |
| Q5 | `clearSessions` reimplements stop logic | Low-Medium | **Resolved** — reuses `attemptOsKill` in `acp-native-backend.ts` |
| Q6 | Magic strings without constants | Low | **Resolved** — `ACP_LIFECYCLE_REASONS` in `acp-session-lifecycle.ts` |
