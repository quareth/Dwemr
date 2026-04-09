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

Interpret this command as: start a new delivery pipeline from the provided request.

Main-agent behavior:
1) Read `.dwemr/project-config.yaml`, `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first. If `.dwemr/state/pipeline-state.md` points to `active_wave_state_path`, read that active `.dwemr/waves/<wave-id>/wave-state.md` next as wave-lane local supporting detail. Then read `.dwemr/state/implementation-state.md` as implementation-lane local supporting detail. Use retained narrative memory only as optional narrative context after canonical state and lane-local detail are established, and never as routing truth.
2) If onboarding is incomplete, treat this command as the primary onboarding entrypoint because it carries request text. In both plugin-backed and standalone Claude runs:
   - save the raw user request into `.dwemr/state/onboarding-state.md` as `request_context` when first-pass onboarding still needs it
   - invoke `/delivery-driver onboarding` exactly
   - do not dispatch `interviewer` directly from `/delivery-start`
   - stop after `/delivery-driver onboarding` returns
   - if onboarding remains `awaiting_clarification`, present the saved clarification batch verbatim as plain final output and stop
   - do not turn onboarding clarification into an interactive questionnaire, form, wizard, live interview step, or answer-collection flow
3) If another active exclusive feature or release lane already exists, do not silently replace it; report that the user should use `/delivery-continue` or explicitly switch features.
4) If onboarding is complete but `install_stage` is not `profile_installed`, stop with an explicit provisioning-pending block. Standalone Claude must not route further until the DWEMR plugin runtime provisions the selected packs. Point the user back to `/dwemr continue <path>`, `/dwemr start <path> <request>`, or `/dwemr plan <path> <request>` for that provisioning step.
5) Treat `delivery.execution_mode` from `.dwemr/project-config.yaml` and `execution_mode` from `.dwemr/state/pipeline-state.md` as the execution-mode contract for this run. If they disagree, prefer the fresher `pipeline-state.md` value because the plugin runtime may already have refreshed it from config before dispatch.
6) If onboarding is complete, treat `.dwemr/state/onboarding-state.md` as the first routing gate. `selected_profile`, `needs_product_framing`, and the provisioned profile packs are binding. Do not name an owner the selected profile does not provision.
   - if the selected profile is `minimal_tool`, never route to `product-manager`
   - if the selected profile is `standard_app` and `needs_product_framing` is true, route to `product-manager`
   - otherwise route to `delivery-manager` (delivery-manager handles git routing internally when git is enabled)
7) After each manager/worker response, follow the handoff fields exactly and dispatch the named next subagent.
8) Do not implement code inline in place of a named worker unless worker fallback is explicitly required by the runtime.
9) Execution-mode stop policy:
   - in `autonomous` mode, continue through normal manager/worker handoffs, planning completion, accepted implementation transitions, accepted feature completion, and release-lane progress when command scope allows it
   - in `autonomous` mode, do not stop at `implementation_ready`, `phase_complete`, `feature_complete`, or `release_checkpoint`
   - in `autonomous` mode, stop only for terminal status, approval wait, or blocked checkpoint
   - in `checkpointed` mode, continue until the next milestone stop, blocked decision, approval wait, or terminal status
10) Milestone stops are emitted only by `product-manager`, `delivery-manager`, or `release-manager`, and only in `checkpointed` mode. Do not invent an extra user-facing stop at each internal manager boundary.
