# Changelog

All notable changes to the `dwemr` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-04-14

### Changed

- Refocused the plugin README into a lighter front-door document centered on
  DWEMR's purpose, install flow, quick start, and the most important
  day-to-day commands.
- Reframed the README purpose section around DWEMR's goal of producing
  structured prototype applications and tools that stay easy to extend
  later, instead of leaving users stuck in repeated refactor cycles.
- Added a simple usage section to the plugin README covering
  `/dwemr init`, `/dwemr start`, `/dwemr continue`, `/dwemr projects`,
  and `/dwemr what-now`.

### Added

- New advanced reference document at `docs/advanced-usage.md` for detailed
  command reference, runtime behavior, configuration notes, architecture,
  and implementation surfaces.
- New troubleshooting document at `docs/troubleshooting.md` for ACPX host
  issues, `/dwemr doctor` and self-heal flows, timeout and permission
  guidance, and verification steps.

## [0.2.0] - 2026-04-10

This release lands the ACP-native runtime refactor and fully retires the
legacy spawn-based shell-execution backend. DWEMR now executes each routed
`/dwemr` command as a one-shot OpenClaw-managed ACP run, and ACP-native is
the only supported runtime path. The legacy spawn backend, the
DWEMR-managed ACPX wrapper bootstrap, and the deprecated config keys that
referenced them are removed.

### Added

- ACP-native runtime backend (`acp-native`) is now the unconditional
  execution path for every routed `/dwemr` command.
- Backend registry under `src/openclaw/backend/` (`runtime-backend.ts`,
  `runtime-backend-types.ts`) and a focused per-concern split under
  `src/openclaw/backend/acp-native/` (config, keys, output, readiness,
  session-lifecycle, stop, turn-result, flow-tracking, native backend).
- New plugin config keys: `acpAgent`, `acpBackend`, exposed in
  `openclaw.plugin.json` UI hints and `configSchema`.
- `/dwemr sessions` and `/dwemr sessions clear` commands to inspect and clear
  the ACP sessions DWEMR currently tracks for DWEMR-owned runs.
- `/dwemr doctor --fix --restart` and `/dwemr doctor --fix --no-restart`
  modes. Plain `/dwemr doctor --fix` now previews ACPX host repair and
  prints the two opt-in follow-up commands instead of mutating host config
  silently.
- Doctor diagnostics for ACPX host `permissionMode`, `timeoutSeconds`, and
  `claude` ACP allowlist / `defaultAgent` policy issues, with restart-aware
  reporting that consults `gateway.reload.mode`.
- Test fixtures (`acp-runtime-fakes.ts`) and new test suites covering the
  runtime backend, doctor, action handlers, onboarding, and the ACP-native
  modules (`acp-keys`, `acp-output`, `acp-readiness`, `acp-stop`,
  `acp-turn-result`). Added `active-runs-migration.test.ts` to pin graceful
  drop of legacy on-disk spawn rows.
- New shared type module `src/openclaw/backend/runtime-types.ts` and CLI
  presentation helper `src/openclaw/backend/claude-output.ts` (extracted
  from the deleted `runtime.ts` and `claude-runner.ts`).
- Expanded README sections: ACPX troubleshooting, ACP-native run model,
  and end-to-end usage examples.

### Changed

- Bump OpenClaw peer dependency from `2026.3.24-beta.2` to `2026.4.2`
  (`peerDependencies`, `devDependencies`, and `openclaw.compat` /
  `openclaw.build` blocks).
- Reorganize `src/openclaw/` into `cli/` (public command surface),
  `backend/` (runtime execution), `state/` (JSON persistence), and
  `diagnostics/` (doctor). No barrel files; importers reference the
  concrete file paths.
- Move `active-runs.ts`, `doctor.ts`, `project-memory.ts`, and
  `project-selection.ts` into the new subfolders. The monolithic
  `runtime-backend.ts` is reduced from ~1328 to ~50 lines after module
  extraction.
- Refactor `acp-native-backend.ts` into focused modules: extract
  `runAcpClaudeCommand`, `isAcpRuntimeReady`, session-key builders,
  output/error helpers, stop tiers, and turn-event / `ProcessResult`
  collection into their own files.
- Streamline ACP runtime option handling by removing the unused `timeout`
  parameter from the option surface.
- `/dwemr stop` now cancels the active OpenClaw-managed runtime owner for
  the selected project instead of killing a child process. Saved workflow
  state is left untouched so work can resume from the last checkpoint.
- `/dwemr doctor` now reports ACP-native runtime readiness, seam
  availability (`api.runtime.tasks.flows` required, `api.runtime.taskFlow`
  optional), ACPX host config health, and runtime health-check execution.
- `getDefaultRuntimeBackend()` always returns the ACP-native backend.
  When ACP-native runtime prerequisites are missing, it still returns a
  non-ready backend object so `/dwemr help` and `/dwemr doctor` continue
  to work for diagnostics.

### Removed

- **Legacy spawn runtime backend.** `spawn-backend.ts` and the legacy
  ACPX-discovery / managed-wrapper bootstrap (`runtime.ts`) are deleted
  entirely. The failing-stub `claude-runner.ts` (with
  `LEGACY_SPAWN_DISABLED_MESSAGE`, `runClaudeCommand`, and
  `probeClaudeRuntime`) is also deleted; its live types and helpers moved
  to `runtime-types.ts` and `claude-output.ts`.
- **Plugin config keys: `runtimeBackend`, `acpxPath`, `managedRuntimeDir`.**
  These were spawn-only knobs. The schema's `additionalProperties: false`
  guard now rejects them.
- `state/active-runs.ts`: deleted `buildLegacySpawnIdentity`, the legacy
  pre-identity normalization fallback, and the standalone spawn-only
  `stopActiveRun` / `StopActiveRunResult`.
- `diagnostics/doctor.ts`: deleted `buildAcpxRecoveryNotes`,
  `getShellInspection`, the "Legacy ACPX compatibility diagnostics"
  branches, the spawn ledger note, and the `ensureRuntime`-based
  bootstrap fix path.
- `cli/action-handlers.ts`: dropped the `formatRuntimeOwnerDescriptor`
  branch that printed `spawn runtime PID …`.
- `runtime-backend-types.ts`: dropped the `shellInspection` field on
  `DwemrRuntimeState` and the `DwemrRuntimeInspection` type.
- Legacy ACP-native phase 1–4 runtime specification documents under
  `plugins/dev/docs/` after the migration to ACP-native controls
  completed.

### Migration notes

- **Breaking change.** If you have set any of `runtimeBackend`, `acpxPath`,
  or `managedRuntimeDir` under `plugins.entries.dwemr.config`, remove them
  before upgrading. The schema now rejects unknown keys and these no
  longer have any effect.
- ACP-native runtime requires OpenClaw `2026.4.2` or newer. There is no
  fallback execution path; older OpenClaw releases without the required
  ACP runtime seam are no longer supported.
- The `child_process` import retained in `state/active-runs.ts` is for
  ACP-native PID discovery (`pgrep`/`lsof` correlate the spawned Claude
  child process to the target project for OS-level emergency stop). It is
  not spawn-backend code; the comment at the top of the file documents
  this contract.
- For long-running DWEMR sessions, raise the ACPX host timeout:
  `openclaw config set plugins.entries.acpx.config.timeoutSeconds 7200`
  and restart the gateway. See the README "ACPX Troubleshooting" section.

## [0.1.0]

- Initial public release of the DWEMR OpenClaw plugin.
