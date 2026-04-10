# ACP Backend — Post-Refactor Quality Review

Review of `plugins/dwemr/src/openclaw/` after the runtime-backend module extraction. Scope is the new ACP-native backend and its supporting modules. Goal: identify cleanup items before public release. The codebase is in publishable shape today; items below are improvements, not blockers.

**Files reviewed:**

| File | Lines | Role |
|---|---|---|
| `runtime-backend.ts` | 52 | Registry/dispatcher |
| `runtime-backend-types.ts` | 177 | Shared type definitions |
| `acp-config.ts` | 170 | Config resolution + key/output helpers |
| `acp-flow-tracking.ts` | 126 | Flow tracking factory |
| `acp-session-lifecycle.ts` | 193 | Session close/reconcile/readiness |
| `acp-native-backend.ts` | 596 | Main ACP-native backend |
| `spawn-backend.ts` | 85 | Spawn adapter (currently disabled) |
| `claude-runner.ts` | 132 | Spawn surface (disabled) |
| `active-runs.ts` | 379 | Persistent active-run registry, kill helpers |

---

## What's working well

- **Entry seam is tiny.** `runtime-backend.ts` is now 52 lines: registry, override, dispatch, fallback. Easy first read.
- **Backend abstraction is real.** `DwemrRuntimeBackend` (`runtime-backend-types.ts:165`) is well-defined; spawn and ACP-native both implement it through factories registered at module load.
- **Tiered stop is now linear.** `attemptFlowCancel` → `attemptSessionCancel` → `attemptOsKill` (`acp-native-backend.ts:183-246`) each return a `StopAttemptResult` discriminated union. The main `stopActiveRun` reads as prose. This addresses Q1 from `02-poor-code-quality.md`.
- **Types module has no logic.** `runtime-backend-types.ts` is types-only — the right discipline.
- **Untrusted JSON is normalized at the seam.** `active-runs.ts:49-148` carefully validates before trusting parsed records.
- **Empty catches mostly explain themselves.** Comments like `// Best-effort task flow tracking; run execution should proceed even if ledger writes fail` (`acp-flow-tracking.ts:64`) document intent — the right style for shipped code.
- **Spawn adapter is a real adapter.** `spawn-backend.ts` (85 lines) doesn't pollute the ACP path.

---

## Q1. `acp-native-backend.ts` is still 596 lines

**Location:** entire file

The factory `createAcpNativeRuntimeBackend` returns a ~350-line object literal. The file mixes three distinct responsibility groups:

1. **Event collection / result building** — `createAcpEventCollector`, `buildTurnEventHandler`, `buildSuccessResult`, `buildErrorResult`, `applySessionMeta` (`acp-native-backend.ts:50-176`)
2. **Stop tier helpers** — `attemptFlowCancel`, `attemptSessionCancel`, `attemptOsKill` plus `StopAttemptResult` type (`acp-native-backend.ts:178-246`)
3. **The factory itself** — backend method implementations (`acp-native-backend.ts:248-596`)

The 45-line import block at the top is a symptom — the file pulls from too many siblings to be a focused module.

**Fix:** Extract:

- `acp-event-collector.ts` — event collector + turn handler + result builders
- `acp-stop.ts` — the three `attempt*` helpers + `StopAttemptResult`
- `acp-native-backend.ts` — just the factory (target ~250 lines)

---

## Q2. `runClaudeCommand` is ~80 lines of orchestration

**Location:** `acp-native-backend.ts:260-341`

The method does: readiness check, key generation, child PID snapshot, session init, PID discovery, flow tracking creation, active-run registration, turn execution, flow finalize, result build, cleanup. Eleven distinct phases inside one method body.

This is a softer version of the original Q3 — it's smaller than before, but the body is still long enough that the actual run flow is hard to spot at a glance.

**Fix:** Extract `executeAcpRun(params): Promise<ProcessResult>` so the method body becomes a thin wrapper that builds params and delegates. The orchestration phases become explicit step names.

---

## Q3. `acp-config.ts` is becoming a utils dumping ground

**Location:** `acp-config.ts` (170 lines, 13 exported functions)

Started cohesive, sprawled. Currently mixes:

- Constants (`ACP_NATIVE_BACKEND_KIND`, `ACP_DEFAULT_AGENT`)
- Type narrowing (`asRuntimeApi`, `normalizeOptionalString`)
- Config resolution (`resolveOpenClawConfig`, `resolveAcpConfig`, `resolveAcpBackendId`, `resolveAcpAgentId`, `resolveRuntimeTasksFlows`, `resolveLegacyTaskFlow`)
- Summary builders (`buildAcpRuntimeSummary`)
- Hash-based session key builders (`buildAcpSessionScopeKey`, `buildCommandScopedAcpSessionKey`)
- Output collection / error formatting (`collectAcpRuntimeOutput`, `formatAcpLifecycleError`)
- Misc (`resolveRuntimeTimeoutSeconds`, `collectAcpRuntimeOptionCaveatNotes`, `buildAcpRuntimeOptionPatch`, `resolveOwnerSessionKey`)

**Fix:** Split along the natural seams:

- `acp-keys.ts` — `buildAcpSessionScopeKey`, `buildCommandScopedAcpSessionKey`
- `acp-output.ts` — `collectAcpRuntimeOutput`, `formatAcpLifecycleError`
- `acp-config.ts` — config resolution + constants only

Smaller modules also make tests cheaper to write per-area.

---

## Q4. `isAcpRuntimeReady` is mis-located

**Location:** `acp-session-lifecycle.ts:149-193`

`isAcpRuntimeReady` builds a `DwemrRuntimeState` from runtime API + config — that's readiness/state construction, not lifecycle management. It sits in `acp-session-lifecycle.ts` only because the close/reconcile helpers happen to live there too.

**Fix:** Move to `acp-config.ts` or its own `acp-readiness.ts`. After this move, `acp-session-lifecycle.ts` is purely close/reconcile, which matches its name.

---

## Q5. `listSessions` and `clearSessions` duplicate the "iterate tracked runs, dedupe by session key" pattern

**Location:** `acp-native-backend.ts:485-594`

Both methods iterate `loadAcpActiveRuns(stateDir)`, dedupe by `run.identity.childSessionKey`, then do per-session work. The iterator scaffolding is repeated.

**Fix:** Extract a shared iterator like `forEachTrackedAcpSession(stateDir, callback)`. Lower priority than Q1/Q2 but cleans up two of the longest methods in the file.

---

## Q6. `RuntimeApiLike.config?: any` defeats the careful type discipline

**Location:** `runtime-backend-types.ts:97`

The whole module is meticulous about `unknown`-then-narrow. This single `any` waves the discipline away and propagates as `cfg: Record<string, unknown>` everywhere downstream.

**Fix:** Tighten to `unknown`, then narrow inside `resolveOpenClawConfig` (which already does the narrowing for the common case).

---

## Q7. `closeAcpCommandSession` returns an awkward `{terminal, error}` shape

**Location:** `acp-session-lifecycle.ts:65-110`

The `terminal: boolean` overloads "session is gone" with "no error happened":

```ts
return { terminal: !storeEntry?.acp, error: storeEntry?.acp ? "..." : undefined };
```

Easy to misread at the call sites (`acp-native-backend.ts:328`, `:416`).

**Fix:** Use a discriminated union:

```ts
| { status: "closed" }
| { status: "stale"; error: string }       // metadata still present
| { status: "still_active"; error: string } // close attempt failed
```

Call sites then `switch` on `status` instead of negating booleans.

---

## Q8. `buildAcpRuntimeOptionPatch` accepts a parameter it explicitly ignores

**Location:** `acp-config.ts:134-144`

```ts
export function buildAcpRuntimeOptionPatch(
  targetPath: string,
  runtimeConfig: (DwemrRuntimeConfig & DwemrClaudeModelConfig) | undefined,
  timeoutSeconds: number | undefined,
) {
  void timeoutSeconds;
  return { model: runtimeConfig?.model?.trim() || undefined, cwd: targetPath };
}
```

The `void timeoutSeconds` is a "huh?" for any new reader.

**Fix:** Either drop the parameter, or comment why it's reserved (`// Reserved for ACP backends that accept per-turn timeout patches; currently unused.`).

---

## Q9. Session-key builders are split confusingly

**Location:** `acp-config.ts:84-105`

`buildCommandScopedAcpSessionKey` always wraps `buildAcpSessionScopeKey`:

```ts
export function buildCommandScopedAcpSessionKey(targetPath, agentId, requestId, runtimeConfig) {
  const scopeKey = buildAcpSessionScopeKey(targetPath, agentId, runtimeConfig);
  const runSuffix = createHash("sha256").update(`${requestId}:${targetPath}`).digest("hex").slice(0, 8);
  return `${scopeKey}:run-${runSuffix}`;
}
```

The naming makes the relationship hard to spot. The doctor probe also synthesizes a third variant with a `-doctor` suffix at `acp-native-backend.ts:368`.

**Fix:** Replace both with one function `buildAcpSessionKey({ targetPath, agentId, runtimeConfig, scope: { kind: "scope" } | { kind: "command", requestId } | { kind: "doctor" } })`. Pulls all three constructions into one place.

---

## Q10. Spawn / `claude-runner.ts` is disabled but still wired

**Location:** `claude-runner.ts:40-106`, `spawn-backend.ts`, `runtime-backend.ts:22`, `active-runs.ts:80`

`claude-runner.ts:40` defines `LEGACY_SPAWN_DISABLED_MESSAGE` and `runClaudeCommand`/`probeClaudeRuntime` always return failure with that message. Yet:

- `spawn-backend.ts` still imports them and dispatches via `createSpawnRuntimeBackend`
- `runtime-backend.ts:22` still registers `"spawn"` in the registry
- `active-runs.ts:80` still has `buildLegacySpawnIdentity` and the legacy normalization branch

That's ~500 lines of "looks alive but isn't" code that confuses readers and bloats the public release surface.

**Fix:** Pick one:

- **Delete it.** Remove `claude-runner.ts`, `spawn-backend.ts`, the registry entry, and the legacy spawn code paths in `active-runs.ts`. Cleanest outcome.
- **Document it loudly.** Add a top-of-file comment in `spawn-backend.ts` and `claude-runner.ts` explaining why these exist as failing stubs (e.g. "kept so external configs that set `runtimeBackend: 'spawn'` get a clear error rather than a registry miss").

Either is fine; the current undocumented half-presence is the worst option for a public release.

---

## Q11. Magic error strings are repeated

**Location:** `acp-native-backend.ts:268`, `:363`

`"DWEMR ACP-native runtime is missing OpenClaw config context."` appears in both `runClaudeCommand` and `probeClaudeRuntime`. Other doctor/error strings are also duplicated across files.

**Fix:** Hoist to a `const` block at the top of `acp-native-backend.ts` (or in `acp-config.ts` if shared more broadly).

---

## Q12. Empty catches without comments break the file's own convention

**Location:** `acp-native-backend.ts:215-217`, `:565-566`

Most try/catch blocks now have a `// Best-effort ...` comment explaining why the catch is intentional. A few are bare:

```ts
try {
  await closeAcpSession(params.manager, params.cfg, params.sessionKey, ACP_LIFECYCLE_REASONS.stopCleanup);
} catch {
  // Best-effort cleanup of persistent session state.   ← good
}
```
vs.

```ts
try {
  await manager.cancelSession(...);
  sessionClosed = true;
} catch {
  // cancelSession failed, try closeSession as fallback.   ← good
}
try {
  await closeAcpSession(...);
  sessionClosed = true;
} catch {
  // closeSession also failed.   ← terse, but okay
}
```

These two are okay. The bare cases are mostly minor; standardize for consistency.

**Fix:** Add a one-line "why" to every empty catch so the convention is uniform.

---

## Q13. Inconsistent `Dwemr` prefix on exported types

**Location:** `runtime-backend-types.ts` and siblings

Some types have the namespace prefix (`DwemrRunCommandRequest`, `DwemrStopResult`, `DwemrSessionInfo`, `DwemrRuntimeBackend`); siblings don't (`RuntimeApiLike`, `BoundFlowViews`, `BoundTaskFlow`, `FlowRevision`, `RunTaskParams`, `AcpFlowTracking`, `AcpRuntimeSummary`, `StopAttemptResult`).

**Fix:** Pick a rule. Suggested: prefix anything that's part of the public backend contract (`Dwemr*`); leave SDK-shaped wrapper types (`RuntimeApiLike`, `BoundFlowViews`) unprefixed since they mirror upstream shapes.

---

## Q14. `pgrep` / `lsof` are macOS/Linux only with no platform note

**Location:** `active-runs.ts:317-338`

`snapshotChildPids` shells out to `pgrep`; `resolveCwdForPid` shells out to `lsof`. Both return `undefined` / `[]` on Windows because the binaries aren't there. Failures are silent — a Windows reader will hunt for a bug.

**Fix:** Add an early `process.platform === "win32"` return with a JSDoc note, or document at the top of the file that PID discovery is POSIX-only.

---

## Q15. New modules have no direct unit tests

**Location:** `plugins/dev/tests/runtime-backend.test.ts`

A grep for `acp-native-backend|acp-config|acp-flow-tracking|acp-session-lifecycle` in the test file returns zero matches. Coverage flows through the public seam (`getDefaultRuntimeBackend`), but for a public release, direct module-level tests would catch refactor regressions cheaply:

- `acp-config.ts` — table-driven tests for normalization, config resolution, and key builders
- `acp-session-lifecycle.ts` — `isAcpRuntimeReady` matrix (api present/absent, config enabled/disabled, backend registered/not, flow seams present/missing)
- `attempt*` stop helpers — fake `boundTaskFlow`/`manager` to verify each tier's outcome shape

The 990-line test file is also worth splitting along module lines while you're at it.

---

## Summary punch list

| Priority | Item | Affects |
|---|---|---|
| **High** | Split `acp-native-backend.ts` into event collector + stop helpers + factory (Q1) | Readability of biggest file |
| **High** | Decide spawn's fate — fully delete or document loudly (Q10) | ~500 lines of dead-ish code |
| **Medium** | Extract `executeAcpRun` from `runClaudeCommand` (Q2) | Method clarity |
| **Medium** | Move `isAcpRuntimeReady` out of `acp-session-lifecycle.ts` (Q4) | Module cohesion |
| **Medium** | Replace `closeAcpCommandSession` `{terminal, error}` with discriminated union (Q7) | Call-site clarity |
| **Medium** | Tighten `RuntimeApiLike.config?: any` to `unknown` (Q6) | Type discipline |
| **Medium** | Hoist repeated error strings to constants (Q11) | Consistency |
| **Low** | Split `acp-config.ts` into keys/output/config (Q3) | Module focus |
| **Low** | Drop or document the unused `timeoutSeconds` param (Q8) | One "huh?" removed |
| **Low** | Unify session-key builders (Q9) | One construction site |
| **Low** | Extract `forEachTrackedAcpSession` (Q5) | Less duplication in two long methods |
| **Low** | Standardize empty-catch comments (Q12) | Style consistency |
| **Low** | Normalize `Dwemr` prefix usage on types (Q13) | Naming hygiene |
| **Low** | Document POSIX-only PID discovery (Q14) | Cross-platform clarity |
| **Low** | Add module-level tests for new helpers; split the 990-line test file (Q15) | Refactor safety |

None of these block public release. The high-priority items would mainly reduce the "wait, why is this here?" moments a new reader has on first pass.
