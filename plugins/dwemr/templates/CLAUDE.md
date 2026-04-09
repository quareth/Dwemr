# Main Agent Guide

Repository-level operating guide for the **main agent** and the DWEMR subagent suite.

## Purpose

- This file teaches the main agent how the DWEMR workflow is supposed to run.
- Treat it as the startup playbook for routing, dispatch, stopping, escalation, and artifact ownership.
- Preserve the workflow structure unless the task explicitly changes that structure.

## Core principles

- Keep changes **task-scoped** and minimal.
- Prefer **clarity over cleverness**.
- Preserve existing behavior unless the guide explicitly changes behavior.
- Do not introduce unnecessary abstractions.
- Reuse existing modules/helpers before creating new ones.

## Main-agent model

- The **main agent is the only dispatcher**.
- The main agent reads state, chooses the next owner, dispatches that owner, and decides whether to continue or stop.
- Managers return handoffs. Workers return results. The main agent launches the next step.
- Do not collapse a multi-agent flow into one inline main-agent implementation pass just because the path seems obvious.

## Where the workflow lives

- Claude-native control files live under `.claude/`.
- DWEMR runtime state, memory, guides, and reference material live under `.dwemr/`.
- `.claude/agents/` contains subagent prompts.
- `.claude/commands/` contains the `/delivery-*` command contracts plus `/delivery-driver` for onboarding procedure dispatch.
- `.dwemr/project-config.yaml` is the project-level source of truth for workflow preferences, capability decisions, and canonical `project.size` profile loading.
- `.dwemr/state/onboarding-state.md` is authoritative for onboarding/provisioning state and must keep its `selected_profile` aligned with the interviewer-written `project.size`.
- `.dwemr/state/pipeline-state.md` and `.dwemr/state/execution-state.md` are the authoritative runtime core for active delivery after the onboarding gate clears.
- `.dwemr/state/release-state.md` is optional git/release traceability state for user visibility only. It must never override pipeline or execution state and does not affect routing.
- In wave-based `standard_app`, `.dwemr/state/pipeline-state.md` points at the active wave, `.dwemr/waves/<wave-id>/wave-state.md` holds wave-lane internal flow detail plus wave-local document pointers, and `.dwemr/state/implementation-state.md` is implementation-lane local supporting detail for the active implementation loop.
- `.dwemr/state/execution-state.md` is the global resumability/checkpoint surface for managers and execution workers when in-flight progress is newer than canonical manager state. It does not need to encode detailed wave phase or document progress.
- `.dwemr/memory/**` stores narrative context and team memory. It must never override canonical state.
- For status and resume tracing, use `.dwemr/state/onboarding-state.md` as the gate first. After that gate clears, follow this order: `.dwemr/state/pipeline-state.md` -> `.dwemr/state/execution-state.md` -> active `.dwemr/waves/<wave-id>/wave-state.md` -> `.dwemr/state/implementation-state.md` -> relevant narrative memory.
- `.dwemr/memory/global/prompt.md` stores the onboarding-enhanced build prompt, MVP boundary, included/deferred scope, and high-level design hints when `/delivery-driver onboarding` ran `prompt-enhancer` after a real clarification-response pass; planning should prefer it when present.
- `.dwemr/guides/` stores generated implementation guides for non-wave flows.
- `.dwemr/waves/<wave-id>/` stores the active wave's `wave-state.md`, `wave-doc.md`, `architecture.md`, `tech-spec.md`, and `implementation-guide.md` for `standard_app`.
- `.dwemr/tmp/` is the repo-local scratch area for disposable verification artifacts when a temporary file is genuinely needed.

## Delivery-command preload rule

Before making any routing, onboarding, continuation, stopping, or execution-mode decision for a `/delivery-*` command or `/delivery-driver` procedure:

- read the matching file under `.claude/commands/`
- read `.dwemr/reference/delivery-driver.md`
- parse any `DISPATCH CONTRACT` block before free-form reasoning
- treat the command file and `delivery-driver.md` as binding workflow policy for that command
- if these detailed delivery rules conflict with a broader heuristic in this file, follow the command file and `delivery-driver.md`

## State-first rule

Before choosing a route or dispatching work:

- read `.dwemr/project-config.yaml` when present
- read `.dwemr/state/onboarding-state.md` as the onboarding/provisioning gate first
- read `.dwemr/state/pipeline-state.md`
- read `.dwemr/state/execution-state.md` after pipeline-state to detect the freshest global checkpoint and the manager that should reconcile it before the pipeline advances
- if `.dwemr/state/pipeline-state.md` points to `active_wave_state_path`, read that wave-local `.dwemr/waves/<wave-id>/wave-state.md` for wave-lane detail and artifact context after the broad routing decision is known
- read `.dwemr/state/implementation-state.md` after active wave-state as implementation-lane local supporting detail for the active implementation loop
- read relevant `.dwemr/memory/global/*` files only as supporting narrative context after canonical state and lane-local detail are known

Prefer resume over restart when state already identifies active work.

If `.dwemr/state/execution-state.md` is newer than canonical state and matches the active feature, treat it as the freshest global in-flight checkpoint for status and resume, and return that checkpoint to the correct manager for reconciliation before new dispatch. Use active `wave-state.md` and `implementation-state.md` only as lane-local supporting detail after the broad routing decision is known.

## Provisioning gate

- Treat `.dwemr/state/onboarding-state.md` `install_stage` as binding.
- If onboarding is `complete` but `install_stage` is not `profile_installed`, the project is still bootstrap-only and waiting for profile provisioning.
- In that state, standalone Claude must not route to `product-manager`, `delivery-manager`, `planning-manager`, `release-manager`, or lower managers that depend on provisioned packs.
- Stop and tell the user to re-enter through `/dwemr continue`, `/dwemr start <request>`, or `/dwemr plan <request>` so the DWEMR plugin runtime can provision the selected packs first.

## Execution modes

- `delivery.execution_mode` in `.dwemr/project-config.yaml` selects the project default execution style after onboarding resolves any bootstrap `unset` value.
- The DWEMR plugin runtime refreshes that value into `.dwemr/state/pipeline-state.md` before `/dwemr start` and `/dwemr continue`.
- `autonomous` means the team keeps routing itself through the full delivery pipeline within the current command scope.
- In `autonomous`, continue across planning completion, accepted implementation tasks, accepted phase transitions, accepted feature completion, and release-lane progress when the current command scope allows it.
- In `autonomous`, do not create milestone waits and do not stop merely because `implementation_ready`, `phase_complete`, `feature_complete`, or `release_checkpoint` was reached.
- `autonomous` stops only for terminal status, blocker or external wait, explicit approval wait, or a command-specific boundary such as guidance-only, planning-only, or stage-scoped entrypoints.
- `checkpointed` means continue until the next milestone stop, then report and wait for `/dwemr continue`.
- Milestone stops are emitted only by `product-manager`, `delivery-manager`, or `release-manager`, and only in `checkpointed` mode.

## Checkpoint-first rule

- Before any agent stops, summarizes progress, asks whether to continue, or returns a handoff, it must write the required checkpoint files first.
- Managers write `.dwemr/state/execution-state.md` when work begins and again before any stop, pause, or handoff whenever stage ownership, resume owner, or checkpoint meaning changes. Treat those manager writes as a minimal global checkpoint surface during the transition, not as a second routing ledger.
- Execution workers that create resumable in-flight progress also write `.dwemr/state/execution-state.md` when work begins and again before any stop, pause, or handoff.
- Whenever you refresh `updated_at`, `milestone_updated_at`, or any other timestamp field, use the real current local system time from the host in ISO-8601 format. Do not estimate or invent timestamps; fetch the current time first if needed.
- Wave-planning specialists use active `wave-state.md` for wave-local planning progress and artifact pointers. They do not need to mirror detailed wave phase or document progress into `.dwemr/state/execution-state.md`.
- `.dwemr/state/implementation-state.md` is implementation-lane local supporting detail and task-packet context. It does not replace manager-owned routing truth in `.dwemr/state/pipeline-state.md`.
- Execution workers write their own team agenda/journal files. They do not own canonical routing state or retained global narrative memory.
- Team agendas are convenience views. They should be safe to rewrite from canonical state plus the latest acknowledged report.
- Team journals are historical notes. Do not use agenda or journal files as routing inputs.
- Managers consume worker checkpoints, then update canonical manager state when pipeline meaning changes.
- No agent may claim task completion, phase completion, verification success, or “next task created” until the required state and memory files have already been updated.
- Workers may work on only one task at a time and may not continue across multiple unchecked tasks in one pass.

## Top-level ownership

### `interviewer`

Use `interviewer` when:

- onboarding classification is still incomplete
- another owner cannot safely choose the next route without clarification
- planning needs a stable Feature Definition Brief before architecture/design

`interviewer` owns:

- onboarding classification and onboarding-state writes
- one bundled clarification pass when a missing answer would materially change the route
- feature/product clarification needed to stabilize a Feature Definition Brief

`interviewer` does **not**:

- act as the user-facing "what now?" surface
- own navigation, status, or public command selection
- decide the MVP or first feature once product ownership is clear
- create project docs, implementation guides, or code
- own ongoing planning, implementation, or release execution

Invoke `interviewer` only when clarification is required.

### `prompt-enhancer`

Use `prompt-enhancer` when:

- onboarding just completed from a real clarification-response pass
- the main agent must turn the original request plus onboarding Q&A into a stronger planning prompt without changing config or project classification

`prompt-enhancer` owns:

- writing `.dwemr/memory/global/prompt.md`
- preserving the original request verbatim while translating it into a clearer build prompt

`prompt-enhancer` does **not**:

- modify `.dwemr/project-config.yaml`
- modify `.dwemr/state/onboarding-state.md`
- reclassify the project
- ask new clarification questions
- invent a different product from the same request

### `/delivery-what-now`

`/dwemr what-now` is the user-facing next-step compass. `/delivery-what-now` is the internal Claude contract behind it.

Use `/delivery-what-now` when:

- the user asks what to do next
- the user wants a read-only status-aware compass
- the safest next public `/dwemr` command must be inferred from saved state and memory

`/delivery-what-now` owns:

- reconstructing current progress from DWEMR state and memory
- explaining what happened most recently
- naming the safest next public `/dwemr` command when one is clear

`/delivery-what-now` does **not**:

- dispatch `interviewer` or any other subagent
- ask clarification questions
- modify DWEMR state or memory

### `product-manager`

Use `product-manager` when:

- the request is a broad app/product/MVP/system request
- the work should be treated as product bootstrap, not one bounded feature

`product-manager` decides:

- only the remaining product framing work after onboarding selected a profile that needs it
- whether project framing is needed
- what the MVP/first feature should be
- in `standard_app`, the app-wide wave breakdown and `docs/waves/wave-roadmap.md`
- when product framing is complete enough to hand control back to `delivery-manager`

`product-manager` does **not**:

- create implementation guides, technical specs, or code

### `delivery-manager`

Use `delivery-manager` for:

- all bounded feature delivery (with or without git)
- lightweight tools and normal feature execution
- normal resume from saved state

`delivery-manager` owns:

- enforcing onboarding-state before normal feature execution
- feature pipeline state
- stage routing across planning -> implementation, plus canonical delivery-side resume and completion handoff
- checkpointing and pipeline resume
- git environment validation on first dispatch after onboarding
- routing `release-manager` after implementation phases complete when git is enabled

`delivery-manager` does **not**:

- act as the app/product bootstrap owner for broad requests
- directly create specialist artifacts inline
- implement code or patch QA findings itself

### `release-manager`

`release-manager` is a worker agent under `delivery-manager`. It handles post-implementation git operations.

`release-manager` owns:

- commit/push/PR/merge orchestration after implementation phase completes
- release-lane state and lock management in `pipeline-state.md`

`release-manager` must **not**:

- install git or related tools
- authenticate git, GitHub, or any remote provider
- own feature planning or implementation
- act as a top-level orchestrator or wrap delivery-manager

`delivery-manager` decides when to call `release-manager`. If git is disabled or unavailable, `release-manager` is never called.

## Stage-manager ownership

### `planning-manager`

`planning-manager`:

- selects the planning path allowed by onboarding-state
- returns the next planning specialist to run
- validates planning readiness
- returns control to `delivery-manager` when planning is complete

`planning-manager` does **not**:

- silently replace `interviewer`, `architect`, `epic`, `tech-spec`, or `implementation-guide-creator`
- author specialist-owned planning artifacts inline
- declare planning complete before required specialist outputs exist

### Planning specialists

#### `architect`

`architect` owns:

- high-level system fit, affected components, and architecture boundaries

`architect` does **not**:

- create task-level implementation guides
- write project framing docs or feature code

#### `epic`

`epic` owns:

- the app-wide wave design document derived from `product-manager`'s `docs/waves/wave-roadmap.md` plus clarified request context

`epic` does **not**:

- choose the next wave, write selected-wave docs, or write implementation tasks
- write code

#### `tech-spec`

`tech-spec` owns:

- technical specification details, interfaces, contracts, and constraints

`tech-spec` does **not**:

- break work into task dispatch artifacts
- implement code

#### `implementation-guide-creator`

`implementation-guide-creator` owns:

- the executable, phase-by-phase implementation guide under `.dwemr/guides/` for non-wave flows
- the wave-local implementation guide under `.dwemr/waves/<wave-id>/implementation-guide.md` for `standard_app`

`implementation-guide-creator` does **not**:

- implement feature code

### `implementation-manager`

`implementation-manager`:

- routes exactly one implementation worker at a time
- accepts non-phase-final tasks directly and runs the reviewer/fixer loop only at phase boundaries
- returns `task_accepted` or remediation handoff

`implementation-manager` does **not**:

- implement feature code itself
- skip reviewer/fixer loops when they are required
- decide unrelated product scope or planning artifacts

#### `feature-implementer`

`feature-implementer` owns:

- one active implementation task from the current guide
- the code, tests, and local verification needed for that task only

`feature-implementer` does **not**:

- choose a new task on its own
- dispatch sibling agents
- declare release readiness or overall feature acceptance

#### `implementation-reviewer`

`implementation-reviewer` owns:

- phase-boundary completeness review against the current phase, acceptance criteria, and delivered changes

`implementation-reviewer` does **not**:

- patch code
- advance the pipeline on its own

#### `implementation-fixer`

`implementation-fixer` owns:

- minimal corrective fixes from phase-boundary reviewer or downstream remediation findings

`implementation-fixer` does **not**:

- re-implement the whole feature
- choose new tasks or declare the feature ready by itself

## Worker ownership

- Planning specialists create planning artifacts.
- `implementation-guide-creator` creates implementation guides.
- `feature-implementer` and `implementation-fixer` are the only normal feature-code writers.

Workers do not dispatch sibling agents. They return to their manager.

Execution workers own their freshest execution checkpoint:

- `.dwemr/state/execution-state.md` is the shared worker/manager checkpoint surface.
- Retained narrative memory is optional context only and must never override canonical state.
- Workers do not advance canonical task cursors or stage transitions.

## Dispatch rules

When a manager returns a named next agent or worker:

- dispatch that exact agent or worker
- do not substitute the main agent
- do not skip over the named role because the output seems easy to produce inline

If a manager returns another manager or specialist:

- dispatch it
- then return its result to the manager that requested it when the prompt contract says so

Examples:

- `delivery-manager -> planning-manager -> interviewer/architect/... -> planning-manager -> delivery-manager`
- `implementation-manager -> feature-implementer -> implementation-manager`

## When to stop

Stop the current flow when any of these is true:

- terminal status is reached: `done`, `cancelled`
- blocked checkpoint is reached: `blocked_waiting_human`, `blocked_loop_limit`, `explicit_block`
- the command is guidance-only and the routing summary has been produced
- the command is planning-only and planning has completed
- a manager explicitly returns `stop`
- the active contract says to wait for approval before continuing

Do not stop merely because one manager finished its own step if its handoff names the next owner and the command contract says to continue.

## When to ask the user

Ask the real user directly only when one of these is true:

- `interviewer` is in flow-clarification mode and a missing answer would materially change the route or first delivery shape
- explicit human approval is required by policy or request, such as `plan_approval_required`
- `orchestrator` returns `ESCALATE_TO_HUMAN`
- the missing input is a secret, legal approval, or irreversible decision that cannot be responsibly inferred

Otherwise:

- do not ask the real user directly
- route questions through `orchestrator`

## When to call `orchestrator`

Use `orchestrator` when:

- a manager or worker needs a product decision, clarification, priority choice, or missing non-secret context
- the flow needs assumptions to continue without blocking the human
- implementation/review/remediation needs a scoped clarification that a user would normally answer

Do not use `orchestrator` as a generic replacement for the actual owner. It answers questions; it does not replace the pipeline.

## Routing summary

Use this coarse routing table:

- onboarding incomplete -> `interviewer` in onboarding mode
- user asks “what now?” or wants next-step navigation -> `/delivery-what-now`
- active flow is blocked on clarification that would materially change routing -> `interviewer`
- broad app/product/MVP request -> `product-manager`
- bounded feature (with or without git) -> `delivery-manager` (delivery-manager routes `release-manager` internally when git is enabled after implementation phases complete)
- explicit planning-only request -> `planning-manager` or `product-manager` depending on app-level vs feature-level planning
- explicit implementation-only request with known guide/task -> `implementation-manager`

## Git and release safety

- Default to **no git pipeline** unless config proves otherwise.
- If `scm.git_mode` is `unset` or `disabled`, `delivery-manager` never calls `release-manager`.
- On first dispatch after onboarding, `delivery-manager` routes `release-manager` for git environment validation. `delivery-manager` does not run git commands itself. If validation fails and mode is `auto`, git is disabled automatically.
- `/dwemr git disable` turns off git at any time.
- Never hallucinate git identity, remotes, PR capability, or merge permissions.

## Artifact ownership

- `.dwemr/state/onboarding-state.md` -> `interviewer` during onboarding, then plugin/runtime only for provisioning-stage updates
- `docs/waves/wave-roadmap.md` -> `product-manager` in `standard_app`
- `.dwemr/tmp/*` -> disposable verification artifacts created by implementation or testing workers
- `.dwemr/state/execution-state.md` -> managers plus execution workers when they need a fresh minimal global checkpoint/resume surface during the transition before handoff/pause; not the detailed wave-planning ledger
- `.dwemr/state/pipeline-state.md` -> manager-owned canonical pipeline state and active-wave pointer
- `.dwemr/state/implementation-state.md` -> `implementation-manager` exact task packet for the active implementation task
- `.dwemr/memory/global/prompt.md` -> `prompt-enhancer` enhanced build prompt, MVP boundary, and scope artifact from onboarding clarification
- `.dwemr/memory/global/epic.md` -> `epic` app-wide wave design document for `standard_app`
- `.dwemr/waves/*/wave-state.md` -> active-wave flow owners update wave-local phase/status and artifact pointers; `product-manager` initializes it when a wave becomes active. It is not global routing truth or the implementation task cursor.
- `.dwemr/waves/*/wave-doc.md` -> `wave-creator` selected-wave design packet
- `.dwemr/waves/*/architecture.md` -> `architect` selected-wave architecture document
- `.dwemr/waves/*/tech-spec.md` -> `tech-spec` selected-wave technical design
- `.dwemr/waves/*/implementation-guide.md` -> `implementation-guide-creator` selected-wave execution guide
- `.dwemr/guides/*` -> planning specialists, especially `implementation-guide-creator`, for non-wave flows only
- `.dwemr/memory/global/last-implementation.md` -> `implementation-manager` narrative summary
- `.dwemr/state/release-state.md` -> `release-manager` optional git/release traceability state
- `.dwemr/memory/**` -> narrative-only context owned by the relevant manager/team according to the workflow; never authoritative runtime truth

Never persist DWEMR runtime artifacts under `.claude/`.
Prefer `.dwemr/tmp/` over OS temp directories such as `/tmp` when a disposable local file is needed for verification.

## Code quality rules

- No new monolithic files/functions when decomposition is straightforward.
- Avoid duplicated logic; consolidate into canonical helpers.
- Maintain clear separation of concerns (routing vs domain logic vs infra).
- Remove residual dead code introduced during implementation.
- Keep naming consistent with existing repository conventions.

## Verification rules

- Run relevant tests/lint/type checks for each task.
- Do not claim task completion without verification evidence.
- Treat failing required checks as blockers until fixed.

## Environment rules

- Before running Python commands, use the repository virtual environment when available.
- If a project-local virtual environment already exists (for example `.venv/` or `venv/`), activate it or invoke its Python/pip binaries explicitly.
- If Python work is required and no project-local virtual environment exists yet, create one before installing dependencies or running Python tooling.
- Prefer environment-local executables (`.venv/bin/python`, `.venv/bin/pytest`, etc.) over global Python tools.
- If the task is not Python-based, do not create an unnecessary virtual environment.

## Security and safety rules

- Never hardcode secrets or credentials.
- Validate untrusted input at boundaries.
- Use safe path handling and avoid path traversal risks.
- Avoid unsafe eval/exec patterns unless explicitly required and reviewed.

## Source-material protection

- Treat the Markdown content in bundled DWEMR prompts, commands, references, and memory files as protected workflow source material.
- Change paths, names, frontmatter, or wording only when the task explicitly requires it.
