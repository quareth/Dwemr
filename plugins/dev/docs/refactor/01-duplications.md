# runtime-backend.ts — Duplications

Catalog of duplicated code in `plugins/dwemr/src/openclaw/runtime-backend.ts` that should be consolidated during refactor. Zero behavior change — only shape.

---

## D1. `formatAcpLifecycleError` exists but isn't used everywhere

**The helper (line 453):**
```ts
function formatAcpLifecycleError(error: unknown) {
  return isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
}
```

**Manual duplications instead of calling it:**
- Line 1050 (`stopActiveRun`, flow cancel catch):
  ```ts
  const flowCancelError = isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
  ```
- Line 1100 (`stopActiveRun`, session cancel catch):
  ```ts
  const sessionCancelError = isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
  ```

**Fix:** Replace both with `formatAcpLifecycleError(error)`.

---

## D2. `asRuntimeApi(context?.api)` re-resolved redundantly

Line 728 captures `runtimeApi` in closure scope at the top of `createAcpNativeRuntimeBackend`:
```ts
const runtimeApi = asRuntimeApi(context?.api);
```

But three methods re-resolve it from scratch instead of using the closure variable:
- Line 1134 (`closeStatefulSession`): `const runtimeApi = asRuntimeApi(context?.api);`
- Line 1153 (`listSessions`): `const runtimeApi = asRuntimeApi(context?.api);`
- Line 1229 (`clearSessions`): `const runtimeApi = asRuntimeApi(context?.api);`

**Fix:** Remove the local re-declarations; use the closure-scoped `runtimeApi` directly.

---

## D3. `clearActiveRun` boilerplate repeated 5+ times

Every call site constructs the same options shape:
```ts
await clearActiveRun(stateDir, projectPath, {
  runId: run.identity.runId,
  backendKind: ACP_NATIVE_BACKEND_KIND,
});
```

**Occurrences:**
| Location | Line | Context |
|---|---|---|
| `runClaudeCommand` finally block | 902 | Cleanup after command completes |
| `stopActiveRun` — flow cancel success | 1037 | After taskFlow.cancel succeeded |
| `stopActiveRun` — no session context | 1056 | Fallback when cfg/sessionKey missing |
| `stopActiveRun` — session cancel success | 1087 | After acp.cancelSession succeeded |
| `stopActiveRun` — OS kill fallback | 1107 | After killProcessWithEscalation |
| `clearSessions` loop | 1280 | Batch cleanup |

**Fix:** Extract a small helper:
```ts
function clearAcpActiveRun(stateDir: string, projectPath: string, runId: string) {
  return clearActiveRun(stateDir, projectPath, {
    runId,
    backendKind: ACP_NATIVE_BACKEND_KIND,
  });
}
```

---

## D4. Session initialization sequence duplicated

Both `runClaudeCommand` and `probeClaudeRuntime` perform the same two-step init:

**`runClaudeCommand` (lines 769-782):**
```ts
await manager.initializeSession({
  cfg, sessionKey, agent: agentId, mode: "oneshot", cwd: request.targetPath,
  ...(backendId ? { backendId } : {}),
});
await manager.updateSessionRuntimeOptions({
  cfg, sessionKey,
  patch: buildAcpRuntimeOptionPatch(request.targetPath, request.runtimeConfig, timeoutSeconds),
});
```

**`probeClaudeRuntime` (lines 946-958):**
```ts
await manager.initializeSession({
  cfg, sessionKey, agent: agentId, mode: "oneshot", cwd: request.targetPath,
  ...(backendId ? { backendId } : {}),
});
await manager.updateSessionRuntimeOptions({
  cfg, sessionKey,
  patch: buildAcpRuntimeOptionPatch(request.targetPath, request.runtimeConfig, 60),
});
```

**Fix:** Extract:
```ts
async function initAcpOneshotSession(params: {
  manager: ReturnType<typeof getAcpSessionManager>;
  cfg: Record<string, unknown>;
  sessionKey: string;
  agentId: string;
  backendId: string | undefined;
  targetPath: string;
  runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined;
  timeoutSeconds: number | undefined;
}) { ... }
```

---

## D5. Event collector callback duplicated

Both `runClaudeCommand` and `probeClaudeRuntime` push events with the same shape:

**`runClaudeCommand` (lines 827-853):** Full callback with diagnostics tracking.
**`probeClaudeRuntime` (lines 965-972):** Minimal version of the same pattern.

Both build `events: Array<{ type: string; text?: string; stream?: string }>` and push:
```ts
events.push({
  type: event.type,
  text: "text" in event ? event.text : undefined,
  stream: event.type === "text_delta" ? event.stream : undefined,
});
```

**Fix:** Extract a reusable event collector:
```ts
function createAcpEventCollector() {
  const events: Array<{ type: string; text?: string; stream?: string }> = [];
  return {
    events,
    handler(event: { type: string; [k: string]: unknown }) {
      events.push({
        type: event.type,
        text: "text" in event ? event.text : undefined,
        stream: event.type === "text_delta" ? event.stream : undefined,
      });
    },
  };
}
```
The diagnostics tracking in `runClaudeCommand` can wrap this base collector.

---

## D6. `getAcpSessionManager()` called fresh 7 times, never cached

Each method in the ACP backend calls `getAcpSessionManager()` independently:
- Line 749 (`runClaudeCommand`)
- Line 938 (`probeClaudeRuntime`)
- Line 1071 (`stopActiveRun`)
- Line 1077 (`stopActiveRun` — second call in same method)
- Line 1140 (`closeStatefulSession`)
- Line 1155 (`listSessions`)
- Line 1231 (`clearSessions`)

**Fix:** Cache it once in the factory closure alongside `runtimeApi`:
```ts
function createAcpNativeRuntimeBackend(context?: DwemrRuntimeContext): DwemrRuntimeBackend {
  const runtimeApi = asRuntimeApi(context?.api);
  const manager = getAcpSessionManager();
  // ... all methods use `manager` from closure
}
```

---

## Summary

| ID | Duplication | Occurrences | Effort |
|---|---|---|---|
| D1 | `formatAcpLifecycleError` not used | 2 manual copies | Trivial |
| D2 | `asRuntimeApi` re-resolved | 3 redundant calls | Trivial |
| D3 | `clearActiveRun` boilerplate | 5-6 call sites | Small helper |
| D4 | Session init sequence | 2 methods | Small helper |
| D5 | Event collector callback | 2 methods | Small helper |
| D6 | `getAcpSessionManager()` uncached | 7 calls | Trivial |
