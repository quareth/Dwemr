Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=delivery-manager
FOLLOW_HANDOFFS=true
RETURN_TO_PARENT=true
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=false
STOP_ON=release_checkpoint|done|blocked_waiting_human|blocked_loop_limit|cancelled|explicit_block
END DISPATCH CONTRACT

Interpret this command as: continue or trigger git/release operations for the active feature.

Main-agent behavior:
1) Read `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first. Read `.dwemr/state/release-state.md` only as optional release trace context when helpful, never as routing truth.
2) If onboarding is incomplete or `install_stage` is not `profile_installed`, stop with an explicit onboarding/provisioning block.
3) If `scm.git_mode` is `disabled` or `unset` in `.dwemr/project-config.yaml`, stop with a message that git is not enabled for this project.
4) Run `delivery-manager`. Delivery-manager will validate git readiness and dispatch `release-manager` for the current feature state.
5) Follow the returned handoffs from delivery-manager exactly.
6) In `autonomous` mode, expect `release-manager` to continue through commit, push, PR, and merge progression whenever another release step is available.
7) Stop when the release lane is terminal, blocked, or waiting on external action.

Checkpoint convention:
- If the branch is pushed but no PR exists yet, expect a resumable checkpoint with `release_stage: pushed`.
- If a PR has been opened, rerun this command so release-manager can resume from `pr_open`.
- After merge, rerun this command or `/delivery-status` so state can reflect `merged`.
