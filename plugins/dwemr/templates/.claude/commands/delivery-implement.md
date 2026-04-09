Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=implementation-manager
FOLLOW_HANDOFFS=true
RETURN_TO_PARENT=true
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=true
STOP_ON=task_accepted|blocked_waiting_human|blocked_loop_limit|cancelled|explicit_block
END DISPATCH CONTRACT

Interpret this command as: continue the implementation stage only from the current guide/task cursor.

Main-agent behavior:
1) Read `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/implementation-state.md`.
2) If onboarding is incomplete or the selected profile has not been provisioned yet, stop with an explicit onboarding block.
3) Verify that the active stage is implementation or that the next routed work belongs to implementation.
4) Run `implementation-manager`.
5) Dispatch exactly the worker it names:
   - `feature-implementer`
   - `implementation-reviewer`
   - `implementation-fixer`
   - `orchestrator`
6) After each worker returns, send the result back to `implementation-manager`.
7) If a named worker is unavailable, the main agent may perform only that current task/check as a fallback, then return to `implementation-manager`.
8) Stop only when `implementation-manager` returns a handoff back to `delivery-manager` (`task_accepted`), or a blocked checkpoint.
