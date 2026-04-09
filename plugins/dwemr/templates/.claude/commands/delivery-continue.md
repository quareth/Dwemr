Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=STATE_ROUTED
FOLLOW_HANDOFFS=true
RETURN_TO_PARENT=true
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=true
STOP_ON=done|blocked_waiting_human|blocked_loop_limit|cancelled|explicit_block
END DISPATCH CONTRACT

Interpret this command as: resume the currently active delivery pipeline from saved state.

Main-agent behavior:
0) Check for pending user input:
   - If `milestone_kind: "user_input_required"` in `.dwemr/state/pipeline-state.md`:
     - Read `milestone_summary` (the exact question)
     - Use `AskUserQuestion` to re-surface the question in this session
     - After the user provides the answer in-session, record it in `execution-state.md` and clear the milestone
     - Then continue from `next_agent` or standard resume owner
   - Otherwise proceed normally with state reconstruction
1) Read `.dwemr/project-config.yaml`, `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first. If `.dwemr/state/pipeline-state.md` points to `active_wave_state_path`, read that active `.dwemr/waves/<wave-id>/wave-state.md` next as wave-lane local supporting detail. Then read `.dwemr/state/implementation-state.md` as implementation-lane local supporting detail. Use retained narrative memory only as optional narrative context after canonical state and lane-local detail are established, and never as routing truth.
2) If onboarding is incomplete, do not begin fresh onboarding classification from this command. Instead:
   - if onboarding state already has a pending clarification batch, present it and stop
   - otherwise tell the user to use a request-bearing command such as `/dwemr start` or `/dwemr plan`, then stop
3) If onboarding is complete but `install_stage` is not `profile_installed`, stop with an explicit provisioning-pending block and tell the user to resume through `/dwemr continue <path>` so the plugin runtime can provision the selected packs first.
4) Treat `delivery.execution_mode` from `.dwemr/project-config.yaml` and `execution_mode` from `.dwemr/state/pipeline-state.md` as the execution-mode contract for this run. If they disagree, prefer the fresher `pipeline-state.md` value because the plugin runtime may already have refreshed it from config before dispatch.
5) If `milestone_state: "waiting_for_continue"` is already set in `.dwemr/state/pipeline-state.md`:
   - in `checkpointed` mode, acknowledge the pending milestone, clear the milestone wait in canonical state before routing, and then continue from the named `next_agent` or the standard resume owner until the next milestone or blocker
   - in `autonomous` mode, treat the pending milestone wait as stale checkpoint metadata from a prior checkpointed run or mode switch, clear it immediately, and continue the pipeline instead of stopping again
6) Start with `delivery-manager`. If git work is pending, delivery-manager routes release-manager internally.
8) If `.dwemr/state/execution-state.md` is newer than canonical state and matches the active feature, do not discard it:
   - if `execution-state.md.report_id` is present and differs from `pipeline-state.md.last_acknowledged_report_id`, treat it as an unacknowledged report and route to `pending_return_to` before any new worker is dispatched
   - otherwise, fall back to legacy freshness signals plus `pending_return_to` / `next_resume_owner`
   - resume from the freshest checkpoint context
   - return that checkpoint context to the starting manager for reconciliation before any new worker is dispatched
   - do not shortcut into `/delivery-implement` or direct implementation-only continuation until that starting manager rewrites canonical state
9) In `standard_app`, reconstruct current progress in this order: `.dwemr/state/onboarding-state.md` for gating, `.dwemr/state/pipeline-state.md` for the active-wave pointer and top-level stage, `.dwemr/state/execution-state.md` for the freshest global checkpoint and the manager that should reconcile it, active `.dwemr/waves/<wave-id>/wave-state.md` for wave-lane local phase/status and artifact paths, and `.dwemr/state/implementation-state.md` for implementation-lane local supporting detail. Do not treat `execution-state.md` as the detailed wave-planning ledger. If the pointer exists but the wave-state file is missing or contradictory, return that conflict to `delivery-manager` / `product-manager` reconciliation instead of inventing a new wave packet.
10) If narrative memory conflicts with canonical state, trust onboarding/pipeline/execution state first, then use active wave-state and implementation-state only as supporting lane-local detail when present, and continue from the canonical checkpoint instead of the narrative summary.
11) Follow the returned handoffs exactly:
   - completed planning returns to `delivery-manager`
   - implementation workers return to `implementation-manager`
12) If a named worker is unavailable in the runtime, the main agent may perform only that current task/check as a fallback, then return to the same parent manager.
13) Do not start a new feature and do not collapse the guide into a single implementation pass.
14) Execution-mode stop policy:
   - in `autonomous` mode, continue through normal manager/worker handoffs, planning completion, accepted implementation transitions, accepted feature completion, and release-lane progression when command scope allows it
   - in `autonomous` mode, do not stop at `implementation_ready`, `phase_complete`, `feature_complete`, or `release_checkpoint`
   - in `autonomous` mode, stop only for terminal status, approval wait, or blocked checkpoint
   - in `checkpointed` mode, continue until the next milestone stop, blocked decision, approval wait, or terminal status
15) Milestone stops are emitted only by `product-manager`, `delivery-manager`, or `release-manager`, and only in `checkpointed` mode. Do not invent an extra user-facing stop at each internal manager boundary.
