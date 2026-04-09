Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=NONE
FOLLOW_HANDOFFS=false
RETURN_TO_PARENT=false
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=false
STOP_ON=guidance_only
END DISPATCH CONTRACT

Interpret this command as: the user is unsure what to do next and wants a state-aware compass that explains where the project currently is, what was done most recently, and the exact safest next DWEMR step.

Main-agent behavior:
1) Read `.dwemr/project-config.yaml` when present, then `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first. If `.dwemr/state/pipeline-state.md` points to `active_wave_state_path`, read that active `.dwemr/waves/<wave-id>/wave-state.md` next as wave-lane local supporting detail. Then read `.dwemr/state/implementation-state.md` as implementation-lane local supporting detail. Read `.dwemr/state/release-state.md` only as optional release trace context when relevant.
2) If onboarding is incomplete, do not begin fresh onboarding classification from this command. Instead:
   - if onboarding state already has a pending clarification batch, present it and stop
   - otherwise explain that `/dwemr start` or `/dwemr plan` must provide the initial project request, then stop
3) If onboarding is complete but `install_stage` is not `profile_installed`, stop with an explicit provisioning-pending guidance summary and point the user back to `/dwemr continue <path>`, `/dwemr start <path> <request>`, or `/dwemr plan <path> <request>`.
4) Treat this reasoning chain as binding:
   - determine onboarding/install gating first
   - determine execution mode and milestone wait state from `.dwemr/project-config.yaml` and `.dwemr/state/pipeline-state.md`
   - read `.dwemr/state/pipeline-state.md` for the active wave pointer and top-level stage
   - compare canonical manager state with `.dwemr/state/execution-state.md` for the freshest global checkpoint and the manager that should reconcile it
   - prefer `execution-state.md.report_id` plus `pending_return_to` when `report_id` differs from `pipeline-state.md.last_acknowledged_report_id`
   - otherwise fall back to legacy `checkpoint_owner`, `checkpoint_kind`, `current_status`, and `next_resume_owner`
   - if `execution-state.md` is newer and still matches the active feature, prefer it as the freshest checkpoint source
   - if `active_wave_state_path` exists, use the active `.dwemr/waves/<wave-id>/wave-state.md` as wave-local truth for the current wave's phase/status and artifact stack only
   - read `.dwemr/state/implementation-state.md` as implementation-lane local supporting detail; do not let it replace manager-owned routing truth
   - determine whether there is an active feature, release lane, or resumable flow
   - use retained narrative memory only as optional context after canonical state is already established
   - never let narrative memory override onboarding, pipeline, implementation, execution, or active wave-state truth
   - reconstruct current progress in this order: onboarding-state -> pipeline-state -> execution-state -> active wave-state -> implementation-state -> retained narrative memory
   - infer what step completed most recently
   - if `milestone_kind: "user_input_required"` in pipeline-state.md, the next action is to resolve that question first
     - report "Waiting for: <milestone_summary>"
     - recommend `/dwemr continue <path>` so the workflow can re-ask and capture the answer in-session, or `/dwemr what-now <path>` to re-check guidance
   - if `execution_mode` is `checkpointed` and `milestone_state: waiting_for_continue`, treat the pending milestone as the most important wait state and recommend `/dwemr continue <path>` unless a blocker suggests otherwise
   - if `execution_mode` is `autonomous` and `milestone_state: waiting_for_continue`, treat it as stale checkpoint metadata that the next `/dwemr continue <path>` should clear before resuming automatic flow
   - infer the next owner, wait state, or entry action from the shared workflow rules in `CLAUDE.md`
   - translate that inferred next step into the safest public `/dwemr` command
5) Do not dispatch `interviewer` or any other subagent from this command. This command is guidance-only and read-only.
6) The public command recommendation must come from the inferred next step, not from a broad static stage-to-command lookup.
7) Command mapping policy:
   - prefer `/dwemr continue <path>` for active resumable work unless a narrower re-entry command is clearly safer
   - in `autonomous` mode, treat `/dwemr continue <path>` as resuming the full remaining pipeline within command scope, not just the next milestone slice
   - recommend `/dwemr implement <path>` only when the checkpoint clearly shows implementation-only re-entry is the safest next action
   - recommend `/dwemr release <path>` or `/dwemr pr <path>` only when the release lane clearly owns the next step
   - recommend `/dwemr start <path> <request>` only when no active feature exists and the user needs to begin new work
   - recommend `/dwemr plan <path> <request>` only when planning-only entry is the correct next action
   - when confidence is low, say so clearly and choose the safest non-destructive command instead of inventing precision
8) Prefer user-facing OpenClaw commands in the guidance summary. Do not tell the user to run internal Claude `/delivery-*` commands.
9) Return the guidance summary in this exact shape:

```markdown
## What now
- Current position: ...
- Last completed step: ...
- Freshest checkpoint source: canonical_state | execution_state | memory_reconstruction
- Exact next step: ...
- Recommended command: `/dwemr ...`
- Why this command: ...
- Alternatives: none | [`/dwemr ...`, ...]
- Confidence: high | medium | low
- Blockers or cautions: none | [...]
```

10) Keep the summary short, action-oriented, and deterministic enough to test. Explain both the next step and the public command recommendation.
11) If state is conflicting, stale, or incomplete, say so clearly in `Blockers or cautions` and recommend the safest diagnostic or resume command instead of inventing progress.
12) Stop after presenting the guidance summary. Never auto-run the next owner from this command.
