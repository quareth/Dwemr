Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=delivery-manager
FOLLOW_HANDOFFS=true
RETURN_TO_PARENT=true
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=false
STOP_ON=merged|release_checkpoint|blocked_waiting_human|blocked_loop_limit|cancelled|explicit_block
END DISPATCH CONTRACT

Interpret this command as: continue an open PR lane through review/check inspection, remediation routing, and merge when clean.

Main-agent behavior:
1) Read `.dwemr/project-config.yaml`, `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first. Read `.dwemr/state/release-state.md` only as optional release trace context when helpful, never as routing truth.
2) If onboarding is incomplete or `install_stage` is not `profile_installed`, stop with an explicit onboarding/provisioning block and point the user back to `/dwemr continue`, `/dwemr start`, or `/dwemr plan`.
3) If `scm.git_mode` is `disabled` or `unset` in `.dwemr/project-config.yaml`, stop with a message that git is not enabled for this project.
4) Run `delivery-manager`. Delivery-manager will dispatch `release-manager` to inspect PR state using `gh` when available.
5) If release-manager returns a remediation handoff, delivery-manager routes implementation fixes as needed.
6) Follow the returned handoffs from delivery-manager exactly.
7) Merge only when there are no blocking review findings and merge is allowed by config.
8) In autonomous mode, continue the PR lane through remediation routing and merge progression when allowed.
9) Stop when merged, explicitly blocked, or waiting on external/manual action.
