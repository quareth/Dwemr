Follow the shared DWEMR workflow rules from `CLAUDE.md`, then apply the command contract below.

DISPATCH CONTRACT
DISPATCH_MODE=STRICT
ENTRY_AGENT=STATE_ROUTED
FOLLOW_HANDOFFS=true
RETURN_TO_PARENT=true
MAIN_AGENT_MUST_NOT_INLINE=true
ALLOW_WORKER_FALLBACK=false
STOP_ON=planning_complete|blocked_waiting_human|blocked_loop_limit|cancelled|explicit_block
END DISPATCH CONTRACT

Interpret this command as: run only the planning portion of the delivery flow and stop before implementation.

Main-agent behavior:
1) Read `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and related state files first to detect active work.
2) If onboarding is incomplete, treat this command as a primary onboarding entrypoint because it carries request text. In both plugin-backed and standalone Claude runs:
   - save the raw user request into `.dwemr/state/onboarding-state.md` as `request_context` when first-pass onboarding still needs it
   - invoke `/delivery-driver onboarding` exactly
   - do not dispatch `interviewer` directly from `/delivery-plan`
   - stop after `/delivery-driver onboarding` returns
   - if onboarding remains `awaiting_clarification`, present the saved clarification batch verbatim as plain final output and stop
   - do not turn onboarding clarification into an interactive questionnaire, form, wizard, live interview step, or answer-collection flow
3) If onboarding is complete but `install_stage` is not `profile_installed`, stop with an explicit provisioning-pending block. Standalone Claude must not continue planning until the DWEMR plugin runtime provisions the selected packs. Point the user back to `/dwemr continue <path>`, `/dwemr start <path> <request>`, or `/dwemr plan <path> <request>` for that provisioning step.
4) If onboarding is complete, treat `.dwemr/state/onboarding-state.md` as the first routing gate. `selected_profile`, `needs_product_framing`, and the provisioned profile packs are binding. Do not name an owner the selected profile does not provision.
   - if the selected profile is `minimal_tool`, never route app-level planning to `product-manager`
   - if the selected profile is `standard_app` and `needs_product_framing` is true, route app-level planning to `product-manager`
   - otherwise use `delivery-manager` for planning that should preserve pipeline state
   - use `planning-manager` only for explicitly stage-isolated planning
5) Follow planning handoffs exactly:
   - planning specialists return to `planning-manager`
   - completed planning returns to `delivery-manager` when delivery owns the stage
6) Ignore execution mode for this command. Stop after a completed planning handoff or explicit approval wait.
7) Do not begin implementation from this command.
