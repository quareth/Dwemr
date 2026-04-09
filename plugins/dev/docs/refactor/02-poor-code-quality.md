# runtime-backend.ts — Poor Code Quality

Issues in `plugins/dwemr/src/openclaw/runtime-backend.ts` where the code is correct but hard to read, maintain, or extend. Zero behavior change — only shape.

---

## Q1. `stopActiveRun` is a 120-line deeply nested try/catch maze

**Location:** Lines 1012-1131

The method implements a three-tier escalation strategy:
1. Try `taskFlow.cancel` (flow-level)
2. Try `acp.cancelSession` (session-level)
3. Try `killProcessWithEscalation` (OS-level)

Each tier has its own try/catch, its own `clearActiveRun` call, and its own return shape. The result is 4 levels of nesting with interleaved error tracking (`flowCancelError`, `sessionCancelError`).

**Current structure (simplified):**
```ts
async stopActiveRun(stateDir, projectPath) {
  const run = await findStoredActiveRun(...);
  if (!run) return not_found;

  let flowCancelError;
  if (cfg && flowId && ownerSessionKey) {
    // ... bind task flow
    if (boundTaskFlow?.cancel) {
      try {
        await boundTaskFlow.cancel(...);
        await clearActiveRun(...);        // duplicate #1
        return stopped;
      } catch (error) {
        flowCancelError = ...;            // manual format #1
      }
    }
  }

  if (!cfg || !sessionKey) {
    await clearActiveRun(...);            // duplicate #2
    return failed;
  }

  try {
    await manager.cancelSession(...);
    try {
      await manager.closeSession(...);    // nested try inside try
    } catch { }
    await clearActiveRun(...);            // duplicate #3
    return stopped;
  } catch (error) {
    // OS-level fallback
    const pid = ...;
    if (pid && isProcessRunning(pid)) {
      const killResult = await killProcessWithEscalation(pid);
      if (killResult.status === "killed" || ...) {
        await clearActiveRun(...);        // duplicate #4
        return stopped;
      }
    }
    return failed;
  }
}
```

**Recommended approach:** Rewrite as a linear escalation chain using early returns or a step-based pattern:
```ts
async stopActiveRun(stateDir, projectPath) {
  const run = await findStoredActiveRun(...);
  if (!run) return { status: "not_found", projectPath };

  const errors: string[] = [];

  // Step 1: Try flow cancel
  const flowResult = await tryFlowCancel(...);
  if (flowResult.stopped) { await clearAcpRun(...); return stopped("runtime_cancel", "taskFlow.cancel"); }
  if (flowResult.error) errors.push(flowResult.error);

  // Step 2: Try session cancel
  const sessionResult = await trySessionCancel(...);
  if (sessionResult.stopped) { await clearAcpRun(...); return stopped("runtime_cancel", "acp.cancelSession"); }
  if (sessionResult.error) errors.push(sessionResult.error);

  // Step 3: Try OS kill
  const killResult = await tryOsKill(...);
  if (killResult.stopped) { await clearAcpRun(...); return stopped("signal", killResult.detail); }

  return { status: "failed", run, error: errors.join(" ") };
}
```

---

## Q2. Inline type definitions are verbose and ad-hoc (lines 33-113)

~80 lines of deeply nested inline types:

```ts
type RuntimeTasksFlowsApi = {
  bindSession: (params: { sessionKey: string; requesterOrigin?: unknown }) => {
    get: (flowId: string) => unknown;
    list: () => unknown[];
    findLatest: () => unknown | undefined;
    resolve: (token: string) => unknown | undefined;
    getTaskSummary: (flowId: string) => unknown;
  };
};

type RuntimeTaskFlowApi = {
  bindSession: (params: { sessionKey: string; requesterOrigin?: unknown }) => {
    createManaged?: (params: { ... 10 fields ... }) => { ... } | undefined;
    get?: (flowId: string) => { ... } | undefined;
    runTask?: (params: { ... 14 fields ... }) => { ... };
    finish?: (params: { ... }) => unknown;
    fail?: (params: { ... }) => unknown;
    requestCancel?: (params: { ... }) => unknown;
    cancel?: (params: { ... }) => Promise<unknown>;
  };
};
```

**Problems:**
- These are SDK-facing contracts embedded inline in an implementation file
- Heavy use of `unknown` everywhere — provides no type safety while adding visual noise
- The bound session return types are anonymous, so they can't be referenced or tested independently

**Fix:** Move to `runtime-backend-types.ts`. Consider naming the bound session types:
```ts
type BoundFlowView = { get: ...; list: ...; findLatest: ...; ... };
type BoundTaskFlow = { createManaged?: ...; runTask?: ...; finish?: ...; ... };
```

---

## Q3. `runClaudeCommand` mixes execution, diagnostics, and bookkeeping

**Location:** Lines 738-913 (~175 lines)

This single method handles:
1. Runtime readiness check
2. Session key generation
3. ACP session initialization
4. PID discovery
5. Flow tracking creation
6. Active run registration
7. Turn execution with event collection
8. Diagnostics summary construction
9. Flow tracking finalization
10. Output collection
11. Session cleanup
12. Active run cleanup

**The try/catch/finally block alone is ~130 lines.** The diagnostic summary construction (lines 856-864) is inline noise that obscures the actual execution flow.

**Fix:** Break into focused steps:
- Session setup (init + options + PID discovery)
- Bookkeeping (register active run + flow tracking)
- Turn execution (runTurn + event collection)
- Result construction (output + diagnostics)
- Cleanup (session close + active run clear)

---

## Q4. `listSessions` enrichment logic is verbose and repetitive

**Location:** Lines 1152-1226 (~75 lines)

The session info enrichment follows a two-pass pattern:
1. Try `manager.resolveSession` — copy fields from `resolution.meta`
2. If state is still "none", try `readAcpSessionEntry` — copy the same fields from `storeEntry.acp`

Both passes copy the exact same 7 fields (`state`, `mode`, `agent`, `backend`, `cwd`, `lastActivityAt`, `lastError`):

```ts
// Pass 1 (lines 1189-1196)
info.state = resolution.meta.state;
info.mode = resolution.meta.mode;
info.agent = resolution.meta.agent;
info.backend = resolution.meta.backend;
info.cwd = resolution.meta.cwd;
info.lastActivityAt = resolution.meta.lastActivityAt;
info.lastError = resolution.meta.lastError;

// Pass 2 (lines 1203-1211) — same fields from different source
info.state = storeEntry.acp.state;
info.mode = storeEntry.acp.mode;
// ... etc
```

**Fix:** Extract a small helper that applies session metadata from either source:
```ts
function applySessionMeta(info: DwemrSessionInfo, meta: { state; mode; agent; backend; cwd; lastActivityAt; lastError }) {
  Object.assign(info, { state: meta.state, mode: meta.mode, ... });
}
```

---

## Q5. `clearSessions` duplicates the cancel+close+kill escalation from `stopActiveRun`

**Location:** Lines 1228-1293

This method implements a simplified version of the same three-tier stop logic that `stopActiveRun` uses:
1. Try `manager.cancelSession`
2. Try `manager.closeSession`
3. Try OS kill via `killProcessWithEscalation`

But it's written independently with different error handling and no shared code with `stopActiveRun`.

**Fix:** After `stopActiveRun` is refactored into step functions (see Q1), `clearSessions` can reuse the same escalation steps rather than reimplementing them.

---

## Q6. Magic strings scattered throughout

Several string literals appear in multiple places without constants:

| String | Occurrences | Context |
|---|---|---|
| `"dwemr-stop"` | Lines 1073, 1075 | Cancel/close reason |
| `"dwemr-stop-cleanup"` | Line 1080 | Close reason |
| `"dwemr-sessions-clear"` | Lines 1246, 1253 | Cancel/close reason |
| `"dwemr-command-cleanup"` | Line 484 | Close reason |
| `"dwemr-onboarding-complete"` | Line 1143 | Close reason |
| `"dwemr/acp-native"` | Line 645 | Controller ID |
| `"oneshot"` | Lines 773, 950 | Session mode |

**Fix:** Define named constants for lifecycle reasons at least, similar to `ACP_NATIVE_BACKEND_KIND`.

---

## Summary

| ID | Issue | Severity | Lines Affected |
|---|---|---|---|
| Q1 | `stopActiveRun` nested try/catch maze | High | ~120 lines |
| Q2 | Inline types are verbose/ad-hoc | Medium | ~80 lines |
| Q3 | `runClaudeCommand` does too many things | High | ~175 lines |
| Q4 | `listSessions` repetitive field copying | Low | ~75 lines |
| Q5 | `clearSessions` reimplements stop logic | Medium | ~65 lines |
| Q6 | Magic strings without constants | Low | Scattered |
