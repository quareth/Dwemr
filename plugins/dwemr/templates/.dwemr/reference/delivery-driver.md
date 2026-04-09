---
name: delivery-driver
description: Drives this repository's delivery pipeline from the main agent using command-style entrypoints and state-file resume. Use when handling `/delivery-driver onboarding`, `/delivery-start`, `/delivery-continue`, `/delivery-status`, `/delivery-what-now`, `/delivery-plan`, `/delivery-implement`, `/delivery-release`, or `/delivery-pr`, or when the user wants the main agent to run the delivery workflow step-by-step or continuously from saved state.
---

# Delivery Driver

Use this skill when the main agent needs to run the repository's delivery pipeline itself using the agent suite under `.claude/agents/` and the DWEMR runtime state and memory files under `.dwemr/`.

This skill is for the **main agent**. It is not a subagent skill.

Read `references/subagent-registry.md` when you need the exact role of a repo agent, what inputs it expects, and where its handoff should return.

## Primary purpose

Turn the repo's manager/worker handoff design into an executable loop the main agent can follow reliably:

1. inspect state
2. pick the correct next subagent
3. dispatch exactly that subagent
4. consume its handoff
5. repeat until terminal or blocked

## Commands this skill should drive

- `/delivery-driver onboarding`
- `/delivery-start <prompt>`
- `/delivery-continue`
- `/delivery-status`
- `/delivery-what-now`
- `/delivery-plan <prompt>`
- `/delivery-implement`
- `/delivery-release`
- `/delivery-pr`

## Source-of-truth files

Read these authoritative files first whenever resuming or checking state:

- `.dwemr/project-config.yaml` when present
- `.dwemr/state/onboarding-state.md`
- `.dwemr/state/pipeline-state.md`
- `.dwemr/state/execution-state.md`
- active `.dwemr/waves/<wave-id>/wave-state.md` when `.dwemr/state/pipeline-state.md` points to `active_wave_state_path`
- `.dwemr/state/implementation-state.md`
- `.dwemr/state/pipeline-policy.md`

Use these narrative files only as optional human-readable context, never as routing truth:

- `.dwemr/memory/global/prompt.md` when present as onboarding-produced planning prompt and scope context
- `.dwemr/memory/global/last-implementation.md` when present as implementation resume context

Use this only as optional human-readable trace context when git/release is involved:

- `.dwemr/state/release-state.md`

Treat `.dwemr/state/release-state.md` only as optional human-readable context, never as routing truth.

Configuration rule:

- Treat `.dwemr/project-config.yaml` as the source of truth for project-level capability decisions and workflow preferences when present.
- If config marks a capability unavailable (for example GitHub, PRs, merge automation), prefer the supported lower-capability path instead of blocking when `scm.git_mode` is `auto`.

## State ownership summary

- `onboarding-state.md`: authoritative only for onboarding/provisioning and installed workflow profile
- `pipeline-state.md`: authoritative global routing pointer, top-level stage, active feature identity, active wave pointer, release lane, next agent, and loop counters
- `execution-state.md`: authoritative freshest global checkpoint and resume surface when in-flight progress is newer than canonical manager state
- `release-state.md`: optional git/release traceability state for user visibility only; never authoritative for routing
- in wave-based `standard_app`, active `wave-state.md`: authoritative internal wave-flow state and artifact registry for the selected wave only, and supporting wave-lane detail after broad routing is known
- `implementation-state.md`: implementation-lane local task packet and loop detail that supports resume after the broad routing decision is known
- retained narrative memory: optional context only; never override canonical state

Reconstruct current progress in this order:

1. `onboarding-state.md` as the onboarding/provisioning gate
2. `pipeline-state.md`
3. `execution-state.md`
4. active `wave-state.md` when `active_wave_state_path` exists
5. `implementation-state.md`
6. narrative memory files only as supporting context

## Main-agent execution loop

When a manager or worker returns a handoff:

1. Read the structured fields first.
2. Honor the named next agent exactly.
3. Do not substitute yourself for a named manager or worker unless fallback is explicitly allowed.
4. After running a child worker, return its result to the parent manager named in the handoff.
5. Stop only on:
   - `done`
   - `blocked_waiting_human`
   - `blocked_loop_limit`
   - `cancelled`
   - explicit `stop`

When a `/delivery-*` or `/delivery-driver` command file is used:

1. Parse the `DISPATCH CONTRACT` block before any free-form reasoning.
2. Treat the contract as binding execution policy for that command.
3. Only after honoring the contract should you use the prose guidance in the command file and this skill.

## Hard rules

- Never skip directly from planning output to implementation workers. Completed planning must return to `delivery-manager`.
- Never skip directly from implementation output into a retired QA lane. Implementation review/fix completion must return to `implementation-manager`, then to `delivery-manager` for canonical reconciliation, next-task routing, release handoff, or stop.
- Never start a new feature if `pipeline-state.md` already shows another active exclusive feature or release lane.
- If a manager returns `Next worker for main agent`, dispatch exactly that worker.
- Do not collapse a multi-task guide into one large implementation pass.

## Strict dispatch contract

The `/delivery-*` and `/delivery-driver` command files may include a machine-readable `DISPATCH CONTRACT` block.

When present, treat it as binding workflow policy:

- `DISPATCH_MODE=STRICT` means dispatch the named subagent instead of inlining the work.
- `ENTRY_AGENT=...` tells you the first repo agent to run when no stronger state-based rule overrides it.
- `FOLLOW_HANDOFFS=true` means keep reading manager/worker handoffs and dispatching the exact named next subagent.
- `RETURN_TO_PARENT=true` means child worker output must go back to the parent manager that requested it.
- `MAIN_AGENT_MUST_NOT_INLINE=true` means do not substitute yourself for a named agent unless fallback policy explicitly allows it.
- `ALLOW_WORKER_FALLBACK=true` means main-agent fallback is allowed only for an unavailable named worker, never for manager responsibilities.
- `STOP_ON=...` defines the valid terminal or blocked stop conditions for that command.

If a command file includes a strict dispatch block and normal natural-language reasoning conflicts with it, follow the dispatch block.

## Worker fallback policy

Preferred worker execution:

- `feature-implementer`
- `implementation-reviewer`
- `implementation-fixer`

Fallback:

- If a named worker is unavailable in the current runtime, the main agent may perform that worker's job **only for the currently active task/check**, not the entire guide.
- After fallback execution, return the result to the same parent manager that would have consumed the worker handoff.
- Keep task granularity. Never use worker fallback as permission to finish the full feature in one pass.

## Environment rule

- For Python-related work, use the project-local virtual environment if it exists.
- If Python work is required and no project-local virtual environment exists, create one first.
- Prefer `.venv/bin/python`, `.venv/bin/pip`, `.venv/bin/pytest` over global tools.

## Command behavior

### `/delivery-driver onboarding`

Use for bootstrap-only onboarding procedure dispatch.

Flow:

1. Read `.dwemr/project-config.yaml`, `.dwemr/state/onboarding-state.md`, and `.dwemr/memory/global/user-profile.md`.
2. If onboarding is already complete, present the current onboarding summary and stop.
3. If onboarding state does not yet contain request-bearing context, return a request-bearing guidance summary and stop.
4. If a pending clarification batch already exists and `clarification_response` is still empty, present that saved batch exactly and stop.
5. If `clarification_response` is empty, dispatch `interviewer` with only the raw saved onboarding request text from `request_context`.
6. If `clarification_response` is present, dispatch `interviewer` with only the saved `clarification_questions` plus the exact user answer text from `clarification_response`.
7. In both onboarding passes, do not prepend analysis, restate the original request on follow-up, add routing hints, or inject extra framing into the interviewer invocation.
8. Let `interviewer` read persisted onboarding state from disk as needed; the strictness above applies only to the main-agent invocation payload.
9. If onboarding remains `awaiting_clarification`, present that saved batch and stop.
10. If onboarding completed after a real clarification-response pass, dispatch `prompt-enhancer` with only the original `request_context`, the saved `clarification_questions`, and the exact saved `clarification_response`.
11. Do not prepend analysis, summary text, or product opinion into the `prompt-enhancer` invocation.
12. `prompt-enhancer` writes `.dwemr/memory/global/prompt.md` only; it must not change onboarding state or config.
13. If `prompt-enhancer` cannot write `.dwemr/memory/global/prompt.md`, stop and report enhancement as blocked instead of pretending the artifact exists.
14. If onboarding completed without a clarification-response pass, do not run `prompt-enhancer`.
15. If onboarding completes in a standalone Claude session, stop with a provisioning-pending summary and point the user back to `/dwemr continue <path>`, `/dwemr start <path> <request>`, or `/dwemr plan <path> <request>`.

### `/delivery-start <prompt>`

Use for a new app or new feature request.

Flow:

1. Read the source-of-truth files.
2. If onboarding is incomplete, treat this as a primary onboarding entrypoint because it carries request text. In both plugin-backed and standalone Claude runs:
   - save the raw user request into `.dwemr/state/onboarding-state.md` as `request_context` when first-pass onboarding still needs it
   - invoke `/delivery-driver onboarding` exactly
   - do not dispatch `interviewer` directly from `/delivery-start`
   - stop after `/delivery-driver onboarding` returns
   - if onboarding remains `awaiting_clarification`, present that saved batch as plain final output and stop
   - do not turn onboarding clarification into an interactive questionnaire, form, wizard, or live interview step
   - wait for the user to answer later through a new request-bearing command so that answer becomes `clarification_response`
3. If an active feature already exists, block or instruct the user to use `/delivery-continue` or an explicit switch command.
4. If onboarding is complete, treat onboarding-state as the first routing gate. `selected_profile`, `needs_product_framing`, and the provisioned profile packs are binding. Do not name an owner the selected profile does not provision.
   - if the selected profile is `minimal_tool`, never route to `product-manager`
   - if the selected profile is `standard_app` and `needs_product_framing` is true, route to `product-manager`
   - otherwise, if a git/release pipeline is explicitly enabled and already usable, route to `release-manager`
   - otherwise route to `delivery-manager`
5. In `autonomous`, keep following returned handoffs until terminal, blocked, waiting for approval, or another command-scoped stop condition.
6. In `checkpointed`, keep following returned handoffs until a milestone stop, blocked state, terminal state, or waiting-for-approval state is reached.

### `/delivery-continue`

Use for same-session or new-session resume.

Flow:

1. Read the source-of-truth files.
2. If onboarding is incomplete, do not begin fresh onboarding classification from this command. Instead:
   - if onboarding state already has a pending clarification batch, present it verbatim as plain final output and stop
   - do not convert that saved clarification into an interactive follow-up flow
  - tell the user to answer through `/dwemr start <path> <response>` so the plugin runtime can write `clarification_response`
   - otherwise tell the user to use a request-bearing command such as `/dwemr start` or `/dwemr plan`, then stop
3. If `milestone_state: "waiting_for_continue"` is set:
   - in `checkpointed`, acknowledge it, clear it, and continue until the next milestone or blocker
   - in `autonomous`, treat it as stale checkpoint metadata from an earlier checkpointed run or mode switch, clear it, and continue the full pipeline
4. If `release_stage` is non-terminal or `release_lock` is true, start with `release-manager`.
5. Otherwise start with `delivery-manager`.
6. Follow handoffs exactly from current state.
7. In `autonomous`, continue until terminal, blocked, waiting for approval, or another command-scoped stop condition.
8. In `checkpointed`, continue until the next milestone stop, blocked state, terminal state, or waiting-for-approval state is reached.

### Execution modes

Execution mode is selected through `.dwemr/project-config.yaml` and refreshed into `.dwemr/state/pipeline-state.md` by the plugin runtime before `/delivery-start` and `/delivery-continue`.

- `autonomous`: keep progressing through the full delivery pipeline within the current command scope
- in `autonomous`, continue across planning completion, accepted implementation tasks, accepted phase transitions, accepted feature completion, and release-lane progress when the current command scope allows it
- in `autonomous`, do not create milestone waits and do not stop merely because `implementation_ready`, `phase_complete`, `feature_complete`, or `release_checkpoint` was reached
- `autonomous` stops only for terminal status, blocker or external wait, explicit approval wait, or a command-specific boundary
- `checkpointed`: keep progressing until the next milestone stop, then report and wait for `/dwemr continue`

Milestone stops are emitted only by `product-manager`, `delivery-manager`, or `release-manager`, and only in `checkpointed` mode.

### `/delivery-status`

Use for a read-only status snapshot.

Return:

- onboarding state when onboarding is incomplete
- active feature id/title
- current stage
- current guide/phase/task
- next agent
- release lane state
- blockers
- exact next action

Do not dispatch subagents unless the user explicitly asks to continue.

### `/delivery-what-now`

Use when the user is unsure what to do next and wants guidance or the correct route.

Flow:

1. Read the source-of-truth files.
2. Do not dispatch subagents from this command; it is guidance-only.
3. Determine onboarding/install gating first.
4. Determine whether there is an active feature, release lane, or resumable flow.
5. Compare canonical manager state with `.dwemr/state/execution-state.md`.
6. Prefer `execution-state.md` when it is fresher and still matches the active feature.
7. Use retained narrative memory only as optional narrative context after canonical state is already established.
8. Infer the last completed step.
9. Infer the next owner, wait state, or entry action from the shared workflow rules.
10. Translate that inferred next step into the safest public `/dwemr` command.
11. Prefer `/dwemr continue` for active resumable work unless a narrower re-entry command is clearly safer.
12. If confidence is low, say so and choose the safest non-destructive command instead of inventing precision.
13. Return a concise compass summary in this stable shape:
    - `Current position`
    - `Last completed step`
    - `Freshest checkpoint source`
    - `Exact next step`
    - `Recommended command`
    - `Why this command`
    - `Alternatives`
    - `Confidence`
    - `Blockers or cautions`
14. Stop after the guidance summary.

### `/delivery-plan <prompt>`

Use for planning-only operation.

Route:

- if onboarding is incomplete, save the raw request into `.dwemr/state/onboarding-state.md` as `request_context` when needed, invoke `/delivery-driver onboarding` exactly, then stop after it returns
- do not dispatch `interviewer` directly from `/delivery-plan`
- if onboarding remains `awaiting_clarification`, present the saved clarification batch as plain final output and stop
- do not turn onboarding clarification into an interactive questionnaire, form, wizard, or live interview step
- treat onboarding-state as the first routing gate; `selected_profile`, `needs_product_framing`, and the provisioned profile packs are binding
- do not route app-level planning to `product-manager` for `minimal_tool`
- route app-level planning to `product-manager` only when the selected profile allows it and `needs_product_framing` is true
- otherwise use `delivery-manager` when planning should preserve pipeline state
- use `planning-manager` only for explicitly stage-isolated planning

Stop after planning completion. Do not begin implementation.

### `/delivery-implement [optional note]`

Use to continue implementation only.

Flow:

1. Verify current stage is implementation or that `next_agent` points into implementation.
2. Run `implementation-manager`.
3. Dispatch the exact worker it names.
4. Return worker result to `implementation-manager`.
5. Repeat until `task_accepted`, blocked, or clarification required.
6. Return final implementation handoff to `delivery-manager`.

### `/delivery-release [optional note]`

Use to continue branch/commit/push/PR/merge handling.

Flow:

1. Read `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first.
2. Read `.dwemr/state/release-state.md` only as optional human-readable trace context, never as routing truth.
3. Run `release-manager`.
4. If it returns a delivery handoff, run `delivery-manager` and continue the normal loop.
5. In `checkpointed`, stop at the release checkpoint it returned.
6. In `autonomous`, continue through release-lane milestones whenever another release step is available in the current run; stop only when the lane is terminal, explicitly blocked, or waiting on external/manual action that the current run cannot clear.

Release checkpoint convention:

- after branch push but before manual PR creation, expect:
  - `release_stage: pushed`
  - `pr_status: not_created`
  - `merge_status: not_requested`
  - `release_lock: true`
  - a `release_lock_reason` telling the user to open a PR when ready
- after PR creation, expect `release_stage: pr_open`
- after merge, expect `release_stage: merged` and `release_lock: false`

### `/delivery-pr [optional note]`

Use to continue from an open PR through review/check inspection, fix routing, and merge when clean.

Flow:

1. Read `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, and `.dwemr/state/execution-state.md` first.
2. Read `.dwemr/state/release-state.md` only as optional human-readable trace context, never as routing truth.
3. Start with `release-manager`.
4. Expect `release-manager` to inspect the open PR using `gh` when available:
   - PR metadata
   - review decision
   - review comments
   - mergeability
5. If the PR is clean and merge is allowed by command intent or repo policy, continue the release lane to merge.
6. If implementation issues are found, route back through `delivery-manager` then `implementation-manager`.
7. If review, test, or security issues are found, route back through `delivery-manager`, then follow the active implementation or release remediation owner selected by the current prompts. Do not route into `qa-manager`.
8. After fixes land and the branch/PR is updated, resume `release-manager` and continue until merged or blocked.
9. In `checkpointed`, stop at valid release checkpoints when `release-manager` emits them.
10. In `autonomous`, do not stop merely because the lane reached `pr_open` or `ready_to_merge` if another release or remediation step is available in the current run.
11. Stop only on:
   - `merged`
   - an explicitly blocked lane
   - external/manual review or human-only decisions that cannot be progressed in the current run

## Handoff-reading checklist

Always look for these fields in manager output:

- `Next action for main agent`
- `Next owner for main agent`
- `Next planning agent for main agent`
- `Next worker for main agent`
- `Terminal status`
- `Blocking issues`

## Practical guidance

- Prefer `/delivery-continue` as the default daily entrypoint once a feature is active; execution mode decides whether the run behaves autonomously or checkpoint-by-checkpoint.
- In `autonomous`, `/delivery-continue` resumes the full remaining pipeline within command scope rather than only the next milestone slice.
- After a checkpointed release stop at a pushed-branch checkpoint, prefer `/delivery-release` to resume the lane after manual PR or merge actions.
- Prefer `/delivery-status` before starting a fresh delivery request if you are unsure whether something is already in progress.
- Prefer `/delivery-plan` if the user explicitly asked not to code yet.
- Keep user-facing summaries short; let state files carry the detailed resume context.
