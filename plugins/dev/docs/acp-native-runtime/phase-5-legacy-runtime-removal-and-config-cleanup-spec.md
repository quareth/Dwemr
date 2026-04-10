# Phase 5 Legacy Runtime Removal and Config Cleanup Spec (Implemented)

## Goal Achieved

DWEMR now presents ACP-native runtime as the clear primary model while keeping
spawn/acpx behavior as compatibility-only fallback.

Phase 5 does not remove the spawn backend yet; it downgrades legacy runtime
surface area so normal operation and operator guidance no longer center around
shell/PID assumptions.

## Legacy Runtime Audit Record

| Item | Decision | Outcome |
| --- | --- | --- |
| `runtimeBackend` (`acp-native` / `spawn`) | Keep | Explicit override remains supported for compatibility and diagnostics. |
| `acpAgent` / `acpBackend` | Keep | Remain public ACP-native runtime controls. |
| `acpxPath` | Deprecate (compat-only) | Kept in schema for spawn compatibility; demoted in docs and ACP-native notes. |
| `managedRuntimeDir` | Deprecate (compat-only) | Kept in schema for spawn compatibility; demoted in docs and ACP-native notes. |
| PATH-based ACPX bootstrap fallback | Remove | Managed runtime bootstrap no longer auto-discovers ACPX from PATH. |
| Bundled OpenClaw ACPX bootstrap source | Keep (compat) | Spawn compatibility still prefers bundled ACPX source when used. |
| PID/signal internals in operator messaging | Keep temporarily (internal only) | Runtime-owner language is primary in stop/status/doctor surfaces. |

## Implemented Artifacts

## 1. Runtime discovery simplification

Implemented in:

- `plugins/dwemr/src/openclaw/backend/runtime.ts`

Changes:

- removed PATH-based ACPX bootstrap fallback from runtime inspection/bootstrap
- managed runtime bootstrap now uses bundled OpenClaw ACPX source only
- explicit `acpxPath` override remains for forced spawn compatibility

## 2. Config surface cleanup policy

Implemented in:

- `plugins/dwemr/openclaw.plugin.json`
- `plugins/dwemr/README.md`

Changes:

- removed `acpxPath` and `managedRuntimeDir` from plugin UI hints
- retained both keys in config schema for compatibility
- documented both keys as deprecated compatibility-only spawn overrides

## 3. ACP-native diagnostic cleanup

Implemented in:

- `plugins/dwemr/src/openclaw/backend/runtime-backend.ts`

Changes:

- ACP-native runtime notes now explicitly flag `acpxPath` and
  `managedRuntimeDir` as ignored compatibility keys in ACP-native mode
- keeps operator guidance aligned with ACP-native runtime truth

## 4. Public runtime story cleanup

Implemented in:

- `plugins/dwemr/README.md`

Changes:

- ACP-native remains the default model in runtime docs
- spawn bootstrap expectations now explicitly framed as compatibility-only
- doctor guidance now prioritizes selected-backend readiness and ACP seams

## 5. Test coverage updates

Implemented in:

- `plugins/dev/tests/runtime-backend.test.ts`
- `plugins/dev/tests/onboarding.test.ts`

Coverage updates:

- added ACP-native readiness note assertions for deprecated compatibility keys
- removed obsolete runtime inspection fixture field tied to removed PATH fallback

## Validation Results

Validated in `plugins/dwemr`:

- `npm run typecheck` (pass)
- `npm test -- --runInBand --reporter=dot` (pass; 112/112)

## Exit Criteria Mapping

Phase 5 exit criteria status:

- [x] ACP-native runtime is clearly the primary execution path.
- [x] obsolete legacy runtime concepts are removed or intentionally downgraded.
- [x] the public runtime/config story is simpler than before.

## Notes for Phase 6

Phase 6 can now focus on public release hardening from a cleaner default model:

- verify install/trust flow with this reduced legacy surface
- confirm docs and CI reflect ACP-native primary behavior
- finalize release readiness evidence across supported environments
