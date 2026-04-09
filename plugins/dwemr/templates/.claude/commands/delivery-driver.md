Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

This command is the internal DWEMR driver surface for named procedures. The bootstrap/runtime currently uses `/delivery-driver onboarding` for onboarding procedure dispatch.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=interviewer
FOLLOW_HANDOFFS=false
RETURN_TO_PARENT=false
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=false
STOP_ON=onboarding_complete|awaiting_clarification|blocked_waiting_human|explicit_block
END DISPATCH CONTRACT

Procedure selection:
- If the invocation is `/delivery-driver onboarding`, apply the onboarding procedure below.
- Otherwise stop and report that the requested `delivery-driver` procedure is unsupported.

## Onboarding procedure

Interpret this command as: run or resume onboarding for a bootstrap-only DWEMR project in one headless pass, then stop after either the onboarding decision or one saved clarification batch is written.

Main-agent behavior:
1) Read `.dwemr/project-config.yaml`, `.dwemr/state/onboarding-state.md`, and `.dwemr/memory/global/user-profile.md` first.
2) If onboarding is already complete, present the current onboarding summary and stop.
3) If onboarding state does not yet contain `request_context` and `clarification_response` is empty, return one request-bearing guidance summary and stop.
4) If onboarding state already contains a pending clarification batch and `clarification_response` is still empty, present that saved clarification batch exactly and stop. Do not start a new interview pass.
5) If `clarification_response` is empty, dispatch `interviewer` with only the raw saved onboarding request text from `request_context`.
6) If `clarification_response` is present, dispatch `interviewer` with only:
   - the saved `clarification_questions`
   - the exact user answer text from `clarification_response`
7) In both onboarding passes, do not prepend analysis, add summary text, restate the original request on follow-up, add routing hints, or inject any additional opinionated framing into the interviewer invocation.
8) `interviewer` may still read `.dwemr/state/onboarding-state.md`, `.dwemr/project-config.yaml`, and other allowed files from disk. The strictness above applies only to the main-agent invocation payload.
9) If onboarding remains `awaiting_clarification`, present the saved clarification batch as the final output and stop.
10) If onboarding completes after a real clarification-response pass, immediately dispatch `prompt-enhancer` with only:
   - the original raw onboarding request text from the saved `request_context`
   - the same saved `clarification_questions` that were passed into `interviewer`
   - the same exact user answer text from the saved `clarification_response`
11) Do not prepend analysis, add summary text, restate the request in new words, or inject product opinion into the `prompt-enhancer` invocation.
12) `prompt-enhancer` must not change onboarding state or config; it only writes `.dwemr/memory/global/prompt.md`.
13) If `prompt-enhancer` cannot write `.dwemr/memory/global/prompt.md`, stop and report that prompt enhancement is blocked instead of pretending the artifact exists.
14) If onboarding completed without a clarification-response pass, do not run `prompt-enhancer`.
15) Treat `.dwemr/project-config.yaml` `project.size` as the canonical provisioning key written by `interviewer`; `.dwemr/state/onboarding-state.md` `selected_profile` must remain aligned with it.
16) If onboarding completes in a standalone Claude session, stop with an explicit provisioning-pending summary. Call out that `.dwemr/state/onboarding-state.md` now has `install_stage: provisioning_pending` and must later reach `profile_installed`, then tell the user to return through `/dwemr continue <path>`, `/dwemr start <path> <request>`, or `/dwemr plan <path> <request>` so the DWEMR plugin runtime can provision the selected packs before continuation.
17) Do not route to `product-manager`, `delivery-manager`, `planning-manager`, or any lower-level manager from this procedure.
