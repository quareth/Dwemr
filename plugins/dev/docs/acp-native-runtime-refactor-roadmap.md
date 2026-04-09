# ACP-Native Runtime Refactor Roadmap

## Why This Exists

DWEMR currently launches external host commands directly in plugin code in order to:

- bootstrap or discover ACPX
- ensure Claude sessions
- run Claude workflow commands
- track and stop active runs

That design works functionally, but it creates a public installation problem:

- OpenClaw's security scanner flags the plugin for `child_process` usage
- normal installation can be blocked or degraded by code-safety findings
- users may be pushed toward break-glass install behavior such as `--dangerously-force-unsafe-install`, which is not acceptable as a public default

For a public plugin, that is not a good trust or adoption story.

Official context:

- Plugin install and dangerous-install bypass: <https://docs.openclaw.ai/cli/plugins>
- Plugin security/code-safety findings model: <https://docs.openclaw.ai/gateway/security>
- Plugin runtime helpers: <https://docs.openclaw.ai/plugins/sdk-runtime>
- ACP harness runtime model: <https://docs.openclaw.ai/tools/acp-agents>

## The Problem

The current runtime model makes DWEMR act like a process launcher instead of a host-managed workflow orchestrator.

That leads to a few issues:

- install-time security warnings are expected and visible to every user
- DWEMR owns process lifecycle that OpenClaw should ideally own
- stop/status/doctor behavior is tied to local processes and PIDs
- runtime assumptions are more brittle across OpenClaw and ACPX changes

The issue is not that DWEMR is malicious. The issue is that its current execution model looks privileged in exactly the way a plugin scanner should treat as risky.

Related official docs:

- Plugin installation and trust boundary: <https://docs.openclaw.ai/cli/plugins>
- Plugin security/code-safety model for install scanning: <https://docs.openclaw.ai/gateway/security>
- Plugin runtime helpers and host-owned helpers: <https://docs.openclaw.ai/plugins/sdk-runtime>
- ACP sessions and harness lifecycle: <https://docs.openclaw.ai/tools/acp-agents>
- Session-spawn and background execution behavior: <https://docs.openclaw.ai/tools/subagents>

## Goal

Move DWEMR from direct process execution to an OpenClaw-managed ACP runtime model.

The target outcome is:

- public installation without the dangerous-install bypass flag
- DWEMR continues to expose the same public `/dwemr` command surface
- DWEMR still provisions the same project-local workflow assets and state model
- OpenClaw owns ACP session lifecycle instead of DWEMR shelling out to host commands

Goal-alignment docs:

- ACP-native session model: <https://docs.openclaw.ai/tools/acp-agents>
- Plugin runtime helper surface: <https://docs.openclaw.ai/plugins/sdk-runtime>
- Plugin authoring and tool registration model: <https://docs.openclaw.ai/plugins/building-plugins>

## Non-Goals

This refactor is not meant to:

- redesign the DWEMR workflow itself
- replace the Claude-native project workflow with a different authoring model
- change onboarding, state files, or provisioning rules unless required by runtime migration
- move durable workflow truth out of `.dwemr/state/*` and into runtime-owned task/session objects
- solve every runtime ergonomics issue in the same pass

## Guiding Principles

- Preserve user-facing behavior where possible.
- Change internals before changing the public command surface.
- Prefer OpenClaw-owned runtime/session controls over DWEMR-owned host process controls.
- Keep `.dwemr/state/*` as the canonical workflow truth; runtime tasks/sessions are live execution handles, not the long-term source of progress state.
- Keep migration incremental so each phase can be validated before the next one starts.
- Accept small internal behavior changes only when they clearly improve platform fit and install trust.

## Expected Behavior Impact

Some behavior should stay the same:

- users should still use `/dwemr start`, `/dwemr plan`, `/dwemr continue`, `/dwemr status`, and `/dwemr stop`
- target-project provisioning should remain a DWEMR responsibility
- the bundled Claude workflow inside initialized projects should remain the delivery engine

Some internals will likely change:

- run execution may shift from locally spawned processes to host-managed ACP sessions or tasks
- stop behavior may shift from PID killing to ACP cancellation or session closure
- doctor behavior may validate ACP health differently than it does today
- runtime configuration may move away from ACPX-path ownership toward OpenClaw-owned runtime settings
- `/dwemr continue` and reply-bearing follow-ups may start a fresh ACP run from saved DWEMR state instead of depending on one durable live ACP session

These changes are acceptable if the public workflow remains understandable and stable.

## High-Level Solution

The refactor should move responsibility in this direction:

- DWEMR keeps command routing, onboarding coordination, provisioning, and project-state management
- OpenClaw owns ACP runtime execution, session lifecycle, and host-level controls
- DWEMR state files remain the durable resumption source for workflow progress, pending questions, and next-step routing
- DWEMR becomes an orchestrator over ACP-native execution rather than a shell wrapper around `acpx` and `claude`

This should be done in phases so we can preserve working behavior while replacing risky runtime seams.

## Runtime API Anchor

To avoid drifting into undocumented runtime behavior, the migration should treat documented OpenClaw runtime seams as the primary implementation path:

- use OpenClaw-managed ACP session spawning/lifecycle controls for child session execution
- use a documented result-delivery bridge that is available on the pinned minimum supported OpenClaw version
- use `api.runtime.tasks.flows` as the primary orchestration/task-ledger seam on the raised DWEMR floor of OpenClaw `2026.4.2` or newer
- keep stop/status/doctor tied to host task/session state rather than plugin-local process state
- preserve a strict split between durable workflow state and live runtime ownership; runtime ids may be attached to DWEMR state, but they must not replace the state-first resume model
- treat missing ACP helper surfaces as explicit platform prerequisites; do not re-introduce plugin-owned shell spawning as a workaround

## Platform Contract Decision

DWEMR adopts the raised-floor path for this refactor.

The pinned minimum supported OpenClaw version for ACP-native implementation is:

- `2026.4.2`

This is the first published OpenClaw package version in this review where the plugin runtime types expose TaskFlow-capable runtime helpers, including `api.runtime.tasks.flows` and the deprecated alias `api.runtime.taskFlow`.

The roadmap should treat `api.runtime.tasks.flows` as primary and `api.runtime.taskFlow` only as a compatibility alias when needed.

This decision must remain reflected in all of the following:

- `plugins/dwemr/package.json`
- public README/runtime requirements
- phase implementation docs and acceptance criteria

No implementation or release should lower the declared minimum OpenClaw version below `2026.4.2` unless the ACP-native plan is rewritten to remove TaskFlow-capable runtime helpers as a required dependency.

## Refactor Phases

### Phase 1: Runtime Contract Definition

Define the target runtime contract for DWEMR under an ACP-native model.

This phase should answer:

- what behavior must remain unchanged for users
- which current runtime behaviors are implementation details and can change
- which pieces of config remain public, become legacy, or should be removed later
- what "done" means for install trust, runtime control, and command compatibility

Output:

- one low-level design document for the target execution contract
- clear success criteria for the rest of the migration
- detailed plan: [acp-native-runtime/phase-1-runtime-contract.md](./acp-native-runtime/phase-1-runtime-contract.md)
- implemented contract spec: [acp-native-runtime/phase-1-runtime-contract-spec.md](./acp-native-runtime/phase-1-runtime-contract-spec.md)

Related official docs:

- Plugin install and security constraints: <https://docs.openclaw.ai/cli/plugins>
- ACP runtime model and session controls: <https://docs.openclaw.ai/tools/acp-agents>
- Plugin runtime helper surface: <https://docs.openclaw.ai/plugins/sdk-runtime>

### Phase 2: Execution Seam Extraction

Separate DWEMR's current runtime execution logic from command-routing and project-state logic.

The point of this phase is to create a stable internal seam so the runtime backend can change without rewriting all action handlers at once.

Output:

- one low-level phase plan for extracting and isolating the execution backend
- clear inventory of current responsibilities that must move behind the new seam
- detailed plan: [acp-native-runtime/phase-2-execution-seam-extraction.md](./acp-native-runtime/phase-2-execution-seam-extraction.md)
- implemented seam spec: [acp-native-runtime/phase-2-execution-seam-spec.md](./acp-native-runtime/phase-2-execution-seam-spec.md)

Related official docs:

- Plugin runtime helpers, especially host/runtime seams: <https://docs.openclaw.ai/plugins/sdk-runtime>
- Plugin building and registration model: <https://docs.openclaw.ai/plugins/building-plugins>

### Phase 3: ACP-Native Run Path

Introduce the OpenClaw-managed ACP execution path and make it capable of running DWEMR workflow commands.

This phase is where the runtime ownership begins to shift from local process spawning to host-managed ACP behavior.

Output:

- one low-level phase plan for the first ACP-native execution implementation
- validation criteria for command execution, session continuity, and result delivery
- detailed plan: [acp-native-runtime/phase-3-acp-native-run-path.md](./acp-native-runtime/phase-3-acp-native-run-path.md)
- implemented run-path spec: [acp-native-runtime/phase-3-acp-native-run-path-spec.md](./acp-native-runtime/phase-3-acp-native-run-path-spec.md)

Related official docs:

- ACP agents and `runtime: "acp"` session spawning: <https://docs.openclaw.ai/tools/acp-agents>
- Session spawning and non-blocking behavior: <https://docs.openclaw.ai/tools/subagents>
- Task Flow runtime for managed orchestration over ACP-backed work: <https://docs.openclaw.ai/automation/tasks>
- Plugin runtime task-flow helpers: <https://docs.openclaw.ai/plugins/sdk-runtime>

### Phase 4: Stop, Status, and Doctor Migration

Replace process-oriented runtime controls with ACP-native runtime controls.

This phase should cover the operator-facing surfaces that currently assume local process ownership.

Output:

- one low-level phase plan for stop/status/doctor behavior under the new runtime model
- a migration checklist for any user-visible behavior adjustments
- detailed plan: [acp-native-runtime/phase-4-stop-status-doctor-migration.md](./acp-native-runtime/phase-4-stop-status-doctor-migration.md)
- implemented migration spec: [acp-native-runtime/phase-4-stop-status-doctor-migration-spec.md](./acp-native-runtime/phase-4-stop-status-doctor-migration-spec.md)

Related official docs:

- ACP runtime controls such as status, cancel, close, and doctor: <https://docs.openclaw.ai/tools/acp-agents>
- Session status and session-control concepts: <https://docs.openclaw.ai/concepts/session-tool>
- Background task tracking model: <https://docs.openclaw.ai/automation/tasks>

### Phase 5: Legacy Runtime Removal and Config Cleanup

Once ACP-native execution is proven stable, remove or downgrade legacy runtime assumptions.

This phase should decide what to do with legacy concepts such as:

- managed ACPX wrapper ownership
- direct executable-path overrides
- PID-based active run tracking
- shell-oriented recovery guidance

Output:

- one low-level phase plan for cleanup and deprecation handling
- final public-facing migration notes for docs and release messaging
- detailed plan: [acp-native-runtime/phase-5-legacy-runtime-removal-and-config-cleanup.md](./acp-native-runtime/phase-5-legacy-runtime-removal-and-config-cleanup.md)
- implemented cleanup spec: [acp-native-runtime/phase-5-legacy-runtime-removal-and-config-cleanup-spec.md](./acp-native-runtime/phase-5-legacy-runtime-removal-and-config-cleanup-spec.md)

Related official docs:

- Plugin runtime helper surface and supported host-owned seams: <https://docs.openclaw.ai/plugins/sdk-runtime>
- Plugin install/trust story for public distribution: <https://docs.openclaw.ai/cli/plugins>
- ACP runtime installation and ownership model: <https://docs.openclaw.ai/tools/acp-agents>

### Phase 6: Public Release Hardening

Validate that the new runtime model is suitable for public installation and maintenance.

This phase should confirm:

- install no longer requires the dangerous-install bypass
- docs match the new runtime model
- CI and release validation cover the new behavior
- Linux and macOS behavior remain healthy, with Windows support decisions clearly documented

Output:

- one low-level release-hardening plan
- final publish readiness checklist
- detailed plan: [acp-native-runtime/phase-6-public-release-hardening.md](./acp-native-runtime/phase-6-public-release-hardening.md)

Related official docs:

- Plugin install and public distribution behavior: <https://docs.openclaw.ai/cli/plugins>
- Plugin authoring and packaging surface: <https://docs.openclaw.ai/plugins/building-plugins>
- ACP runtime health and operator-facing controls: <https://docs.openclaw.ai/tools/acp-agents>
- Session/runtime behavior for background work: <https://docs.openclaw.ai/tools/subagents>

## Phase Planning Rule

This roadmap is intentionally high level.

Before starting any phase implementation, create a separate low-level phase document that covers:

- exact files and modules involved
- detailed behavior expectations
- migration risks
- testing and rollback considerations

Do not expand this roadmap into a technical implementation spec. Keep it as the parent document that explains why the refactor exists and how the work is staged.

## Success Criteria

This roadmap is complete when DWEMR reaches all of the following:

- users can install the public plugin without a dangerous-install bypass
- DWEMR no longer depends on direct plugin-owned host process execution for normal operation
- the public `/dwemr` workflow remains coherent and recognizable
- runtime behavior is better aligned with OpenClaw's ACP-native model
- docs, diagnostics, and support guidance reflect the new architecture clearly
