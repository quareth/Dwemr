Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=NONE
FOLLOW_HANDOFFS=false
RETURN_TO_PARENT=false
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=false
STOP_ON=status_report_only
END DISPATCH CONTRACT

Interpret this command as: inspect delivery state and report the exact current checkpoint without changing the pipeline.

Main-agent behavior:
1) Read `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first. If `.dwemr/state/pipeline-state.md` points to `active_wave_state_path`, read that active `.dwemr/waves/<wave-id>/wave-state.md` next as wave-lane local supporting detail. Then read `.dwemr/state/implementation-state.md` as implementation-lane local supporting detail. Read `.dwemr/state/release-state.md` only as optional release trace context when helpful.
2) If onboarding is incomplete, return a concise onboarding-pending status summary and stop. Do not trigger provisioning from this command.
3) If onboarding is complete but `install_stage` is not `profile_installed`, return a concise provisioning-pending status summary and stop. Tell the user to re-enter through `/dwemr continue <path>`, `/dwemr start <path> <request>`, or `/dwemr plan <path> <request>` so the plugin runtime can provision the selected packs.
4) Otherwise return a concise status summary:
   - If `milestone_kind: "user_input_required"`, report prominently at the top:
     ```
     ## Pending user input
     Question: <milestone_summary>
     Waiting for: /dwemr continue
     ```
   - active feature id/title
   - active wave id/title and active wave-state path when present
   - execution mode
   - current stage
   - guide path and any implementation-lane local detail that clarifies the current checkpoint
   - wave-local document paths when wave-state provides them and they are relevant to the current checkpoint
   - whether `execution-state.md.report_id` differs from `pipeline-state.md.last_acknowledged_report_id` and which `pending_return_to` manager must reconcile it
   - freshest execution checkpoint when `.dwemr/state/execution-state.md` is newer than canonical state and matches the active feature
   - milestone wait state, milestone kind, milestone summary, and milestone next step when `milestone_state` is not `none`, including whether it is an active checkpointed wait or stale metadata that autonomous resume will clear
   - next agent to run
   - release lane status
   - blockers
   - exact next action
   - trace source order used for the answer: onboarding-state -> pipeline-state -> execution-state -> active wave-state -> implementation-state -> retained narrative memory
5) If execution-state is fresher than canonical state, report both:
   - the canonical manager-owned stage
   - the fresher worker or manager checkpoint and the manager that should reconcile it, preferring `report_id` / `report_owner` / `report_status` when present and falling back to legacy checkpoint fields otherwise
6) If `execution_mode` is `autonomous` but `milestone_state` still shows `waiting_for_continue`, call that out as stale checkpoint metadata from an earlier checkpointed run or mode switch rather than a live autonomous stop.
7) Narrative memory must never override canonical state. If any memory file conflicts with onboarding/pipeline/implementation/execution state, call that out explicitly and follow the canonical files.
8) In `standard_app`, treat `.dwemr/state/pipeline-state.md` as the active-wave pointer and top-level workflow truth, `.dwemr/state/execution-state.md` as the global checkpoint/resume surface, the active `.dwemr/waves/<wave-id>/wave-state.md` as the selected-wave truth for wave-local phase/status and document references only, and `.dwemr/state/implementation-state.md` as implementation-lane local detail only. Do not treat `execution-state.md` as the detailed wave-planning ledger.
9) Do not dispatch any subagents unless the user explicitly asks to continue after seeing the status.
