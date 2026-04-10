# Phase 1 Runtime Contract Spec (Implemented)

## Purpose

Freeze the runtime contract that Phase 2-6 must preserve while DWEMR migrates from plugin-owned process launching to OpenClaw-owned ACP runtime controls.

This spec is implementation-facing and code-anchored to the current DWEMR runtime.

## Current Runtime Inventory (Code-Anchored)

### Responsibility inventory

| Responsibility | Current implementation | Current user-facing effect |
| --- | --- | --- |
| Runtime discovery/bootstrap | `src/openclaw/backend/runtime.ts` (`inspectDwemrRuntime`, `ensureManagedDwemrRuntime`) | `/dwemr doctor` reports managed runtime, ACPX discovery state, and can self-heal wrapper bootstrap. |
| Command execution | `src/openclaw/backend/claude-runner.ts` (`runClaudeCommand`, `runTrackedClaudeProcess`) | Routed `/dwemr` actions execute one quiet Claude command and return final assistant text or formatted failure. |
| Session creation | `src/openclaw/backend/claude-runner.ts` (`ensureClaudeSessionNamed`) | Each routed command ensures a Claude session before execution. |
| Run tracking | `src/openclaw/state/active-runs.ts` (`registerActiveRun`, `clearActiveRun`, `findActiveRun`) | Active run for a project is tracked by PID and shown in status/stop surfaces. |
| Stop behavior | `src/openclaw/state/active-runs.ts` (`stopActiveRun`) and `src/openclaw/cli/action-handlers.ts` (`handleStop`) | `/dwemr stop` sends SIGTERM/SIGKILL to tracked PID and preserves DWEMR state files. |
| Doctor behavior | `src/openclaw/diagnostics/doctor.ts` (`runDwemrDoctor`, `formatDoctorText`) | `/dwemr doctor [--fix]` validates runtime/project health and offers repair guidance. |
| Runtime preflight gate | `src/openclaw/diagnostics/doctor.ts` (`preflightExecution`) | Routed commands fail early with actionable diagnostics if runtime/project is not ready. |
| Command routing boundary | `src/openclaw/cli/action-handlers.ts` + `src/openclaw/cli/command-routing.ts` | Public `/dwemr` command semantics remain deterministic and stable. |
| Runtime option injection | `src/openclaw/backend/claude-runner.ts` (`buildProcessEnv`) + `src/control-plane/project-config.ts` reads via handlers | Model/subagent/effort options influence Claude process environment and session naming. |

## Contract Boundary

### Preserved user-visible behavior checklist

- [x] Public `/dwemr` command surface remains available and stable.
- [x] Command intent for `start`, `plan`, `continue`, `status`, `what-now`, `doctor`, and `stop` remains unchanged.
- [x] Project bootstrap/provisioning ownership remains in DWEMR plugin code.
- [x] Installed Claude workflow remains the delivery engine in target projects.
- [x] `.dwemr/state/*` remains canonical durable workflow truth.
- [x] Resume correctness depends on saved DWEMR state, not on a still-live runtime handle.
- [x] Routed commands still return coherent operator-facing final text.

### Allowed runtime implementation changes

- [x] Replace direct `acpx`/`claude` process spawning with OpenClaw runtime helpers.
- [x] Replace PID tracking with runtime-native flow/task/session identity.
- [x] Replace signal-based stop with ACP-native cancellation/closure.
- [x] Redesign doctor probes around runtime-managed capabilities.
- [x] Downgrade/remove ACPX path bootstrap ownership after migration proves stable.

## Current vs Target Responsibility Map

| Domain | Current owner | Target owner |
| --- | --- | --- |
| Command parsing/routing | DWEMR plugin | DWEMR plugin (unchanged) |
| Project install/provisioning | DWEMR plugin | DWEMR plugin (unchanged) |
| Durable workflow state | `.dwemr/state/*` in target project | `.dwemr/state/*` in target project (unchanged) |
| Runtime execution launch | DWEMR via `child_process` | OpenClaw runtime (`api.runtime.tasks.flows`) |
| Session lifecycle | DWEMR shell calls (`acpx ... claude sessions ensure`) | OpenClaw-managed ACP session/task lifecycle |
| Active run identity | PID + command/session metadata in plugin state dir | Backend-neutral runtime identity (`flowId`, `taskId`, `childSessionKey`, backend kind) |
| Stop semantics | PID kill (`SIGTERM` -> `SIGKILL`) | ACP task/session cancellation |
| Runtime health checks | ACPX path + shell probe commands | Runtime capability + task/session readiness checks |

## Legacy Runtime Classification

| Legacy feature | Classification | Phase intent |
| --- | --- | --- |
| `acpxPath` override | Temporary compatibility shim | Keep during migration, deprecate once ACP-native path is default and stable. |
| Managed ACPX wrapper bootstrap (`managedRuntimeDir`) | Temporary compatibility shim | Keep until ACP-native backend fully replaces shell execution path. |
| PID-based `active-runs.json` | Temporary compatibility shim | Replace with backend-neutral run identity in Phase 2/4. |
| Shell-based doctor probes (`claude auth status`, quiet prompt) | Temporary compatibility shim | Replace with runtime-native health model in Phase 4. |
| PATH/CLI ACPX discovery heuristics | Legacy to remove later | Remove/demote in Phase 5 after runtime ownership transfer is complete. |

## Runtime API Mapping (Current Seam -> ACP-Native Seam)

| Current seam | Target seam | Notes |
| --- | --- | --- |
| `inspectDwemrRuntime` readiness + ACPX binary resolution | Runtime capability detection via OpenClaw plugin runtime | Binary-path ownership should not be the primary truth after migration. |
| `runClaudeCommand` + `runTrackedClaudeProcess` | `api.runtime.tasks.flows` orchestration of ACP-backed run | Task flow is primary seam on OpenClaw `2026.4.2+`. |
| `registerActiveRun` / `findActiveRun` / `clearActiveRun` (PID) | Flow/task/session-linked run records | Persist run identity as transient runtime handle, not durable progress truth. |
| `stopActiveRun` PID signals | Flow/task cancel then session close/cancel if needed | Preserve stop intent without process signals in user output. |
| `probeClaudeRuntime` shell checks | ACP runtime/session readiness checks on host-managed runtime | Keep doctor actionable but runtime-native. |
| `api.runtime.state.resolveStateDir()` (already used) | Keep as-is | Still valid for plugin-owned metadata storage. |

## Minimum OpenClaw Capability Matrix (Raised Floor: 2026.4.2)

| Capability | Required | Version policy |
| --- | --- | --- |
| Plugin API compat gate (`pluginApi`, `minGatewayVersion`) | Yes | Already pinned to `2026.4.2` in `plugins/dwemr/package.json`. |
| TaskFlow runtime seam (`api.runtime.tasks.flows`) | Yes, primary | Required for ACP-native orchestration and run ledger. |
| Deprecated alias (`api.runtime.taskFlow`) | Optional fallback | Compatibility alias only, never primary design target. |
| Runtime state dir helper (`api.runtime.state.resolveStateDir`) | Yes | Already used and remains valid. |
| Host-managed ACP session/task lifecycle controls | Yes | Required prerequisite for Phase 3/4 implementation. |

### Platform prerequisite policy

- Missing required runtime helpers on `2026.4.2+` is a platform blocker for ACP-native phases.
- Do not reintroduce plugin-owned normal execution via `child_process` as a fallback to missing helpers.

## Command Completion Contract

### Default completion rule

Routed commands continue to present as command-scoped operations that return final operator-facing text for that invocation.

### Completion behavior by command family

| Command family | Completion contract |
| --- | --- |
| Guidance/read (`status`, `what-now`) | Return final text for current state view; no background ownership required after completion. |
| Entrypoint execution (`start`, `plan`, `continue`, `implement`, `release`, `pr`) | Return final text for the current execution turn; if question/checkpoint is persisted, active runtime handle may end safely. |
| Control-plane local (`doctor`, `stop`, `mode`, `projects`, `use`, `model`, `subagents`, `effort`, `git disable`, `init`) | Continue as plugin-handled command responses with no dependence on old PID model once migrated. |

### Timeout/cancel outcomes

- Timeouts must remain explicit in user-facing output.
- Cancellation/stop outcomes must describe DWEMR intent in DWEMR language, not raw host signal internals.
- Completed turns that already wrote checkpoint state are valid terminal outcomes even when no active runtime handle remains.

## Runtime Option Compatibility Matrix

| Option | Current behavior | ACP-native contract |
| --- | --- | --- |
| `model` | Injected via `ANTHROPIC_MODEL`; influences session naming | Preserve effect; map to ACP-native model selection surface or equivalent env injection at runtime boundary. |
| `subagentModel` | Injected via `CLAUDE_CODE_SUBAGENT_MODEL`; influences session naming | Preserve effect where supported; if partial support, keep explicit caveat messaging. |
| `effortLevel` | Injected via `CLAUDE_CODE_EFFORT_LEVEL`; influences session naming | Preserve effect where supported; document mapped equivalent and caveats. |
| `acpxPath` | Overrides executable for shell runtime | Compatibility-only during migration; planned deprecation after ACP-native stabilization. |
| `managedRuntimeDir` | Controls managed ACPX wrapper location | Compatibility-only during migration; legacy once shell runtime is removed from normal path. |

## Continuity Matrix (Durable Workflow vs Live Runtime)

| Scenario | Durable checkpoint required | Live runtime handle required |
| --- | --- | --- |
| User answers onboarding/planning clarification later | Yes | No, if pending question + resume checkpoint are already saved. |
| `/dwemr continue` from persisted checkpoint | Yes | No, can start a fresh ACP run from saved state. |
| User requests `/dwemr stop` while command is still executing | Yes (for later resume) | Yes, only to target active in-flight work for cancellation. |
| `/dwemr status` while paused for user input | Yes | No, status must still be coherent without active runtime handle. |
| Long-running active execution currently in-flight | Yes | Yes, for active control/inspection and cancellation. |

## Migration Acceptance Checklist (Phase 1 Gate for Later Phases)

- [x] Runtime contract is explicit and code-anchored.
- [x] Preserved behavior vs allowed runtime change is explicitly separated.
- [x] Legacy runtime elements are classified (keep, temporary shim, deprecate/remove).
- [x] Current seam -> ACP-native seam mapping is documented.
- [x] OpenClaw capability floor and required seams are frozen at `2026.4.2`.
- [x] Command completion contract is defined (sync expectations, timeout/cancel handling, acceptable handle disappearance).
- [x] Runtime option compatibility policy is documented.
- [x] Continuity model explicitly distinguishes durable workflow state from live runtime ownership.

## Phase 1 Decision Record

- DWEMR remains state-first: `.dwemr/state/*` is authoritative durable progress.
- ACP runtime handles are transient execution ownership, not durable workflow truth.
- OpenClaw `2026.4.2` stays the minimum supported floor for ACP-native work.
- `api.runtime.tasks.flows` is the required orchestration seam for migration phases.
