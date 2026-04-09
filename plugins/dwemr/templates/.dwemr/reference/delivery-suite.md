---
name: delivery-suite
description: Orchestrates this repository's product, release, and delivery subagent suite. Use when the user asks to build a whole application/product, or to implement, enhance, extend, refactor, continue, or review a bounded feature. Route app-level requests to `product-manager`, feature-level requests to `release-manager` when git pipeline is real, otherwise `delivery-manager`, and use lower-level managers only for explicitly stage-isolated requests.
---

# Delivery Suite

Use this skill for the repo's delivery workflow under `.claude/agents/`.

For command-driven main-agent execution, prefer the `delivery-driver` skill together with the `/delivery-*` commands under `.claude/commands/`.

Read `.dwemr/project-config.yaml` when present and treat it as the source of truth for project-level workflow preferences and capability decisions.
Read `.dwemr/state/onboarding-state.md` before normal routing and treat it as the source of truth for selected workflow profile.

Default rule:

- onboarding incomplete -> `interviewer` in onboarding mode
- unclear entrypoint / user asks what to do next -> `/delivery-what-now`
- app/product bootstrap requests -> `product-manager`
- normal feature delivery with git pipeline -> `release-manager`
- normal feature delivery without git pipeline -> `delivery-manager`

## Primary goal

Turn repetitive feature work into one managed pipeline:

1. app/product bootstrap when needed
2. optional git/release orchestration
3. feature planning
4. implementation
5. implementation review/fix loop
6. terminal completion, release handoff, or blocked checkpoint

## Hard dispatch rule

When this skill routes work to a repo agent:

- You must invoke the selected repo agent explicitly.
- Do not emulate, inline, or substitute for `product-manager`, `release-manager`, `delivery-manager`, `planning-manager`, or `implementation-manager`.
- Do not perform the selected agent's responsibilities yourself just because you understand the workflow.
- If the route says `product-manager`, `release-manager`, or `delivery-manager`, stop your own workflow execution and dispatch that agent.
- If explicit agent dispatch is unavailable, say so clearly and stop instead of silently performing the routed workflow yourself.

## Single-dispatcher model

- Only the main agent should spawn the next subagent.
- Manager subagents must not spawn child subagents themselves.
- Each manager/subagent should return a concise handoff that tells the main agent which subagent to run next, or that the flow is terminal/blocked.
- Treat manager agents as stateful decision and handoff agents; treat worker agents as the only code/test/audit executors.
- When a manager returns a specific next worker (for example `feature-implementer`, `implementation-reviewer`, or `implementation-fixer`), the main agent must dispatch that exact worker and must not perform the worker's job itself.
- Do not collapse task-by-task delivery into one main-agent implementation pass, even if the guide is short or the feature seems easy.

## When to use this skill

Use it when the user:

- says they do not know which agent or command to use
- asks what to do next or how to continue from the current state
- asks to build a whole application, product, MVP, or system from a broad idea
- asks to implement, enhance, extend, refactor, or fix a feature
- wants the agent to analyze the codebase first, then suggest an approach
- wants an implementation guide in `PLAN_TEMPLATE.md` style
- wants the implementation to continue in either `autonomous` or `checkpointed` execution mode after planning
- asks to continue or resume an in-flight feature
- asks whether an implementation matches its guide and wants the suite's review/remediation flow
- asks to use the repo's agent collection or delivery pipeline

## When not to use this skill

Do not use it for:

- narrow code questions that do not require the delivery pipeline
- simple direct edits where the suite would add overhead
- ad hoc test runs with no delivery-state implications
- isolated one-off shell/code tasks unrelated to the managed feature pipeline

## Default routing

### 1. Normal feature work

Only use this route after onboarding is complete.

Use `release-manager` when the repository has a real git development pipeline configured. Otherwise use `delivery-manager`.

Config rule:

- if config disables git or higher release capabilities, prefer the highest supported lower-capability route instead of forcing `release-manager`
- use onboarding-state profile selection, not config lane hints, to choose workflow weight

Pass:

- the feature request
- any selected files/docs/issues/plans
- whether the user explicitly wants plan approval before coding

Expected behavior:

- detect whether git/release pipeline is usable
- detect resume vs new feature vs conflict
- create/update planning artifacts
- route implementation and any implementation/release remediation needed by the active flow
- route branch/commit/push/PR/CI/merge only when supported
- resume an existing release lane before creating any new branch or PR
- keep memory/state updated
- continue until terminal status or approval/block, with the main agent launching each next subagent based on returned handoffs

### 2. App/product bootstrap requests

Use `product-manager`.

Use this route when the request is broad, such as:

- "Build a calculator app"
- "Create a CRM"
- "Build a full SaaS for X"
- "Make the whole application"

Pass:

- the app/product request
- any constraints the user gave
- existing docs/codebase context if present

Expected behavior:

- classify the request as app-level
- when app-level framing is missing or stale, return `product-manager` so the main agent can create or refresh the roadmap and first-wave framing
- define MVP and initial roadmap
- break the product into prioritized features
- select the first executable feature
- hand that feature to `release-manager` when git pipeline is configured, otherwise to `delivery-manager`
- immediately return the downstream owner so the main agent can invoke it in the same user request unless the user explicitly asked for planning-only output or a pause

### 3. Resume existing delivery

Use `release-manager` with no extra prompt when release state is active. Otherwise use `delivery-manager` with no extra prompt.

It should resume from:

- `.dwemr/state/pipeline-state.md`
- `.dwemr/state/execution-state.md`
- `.dwemr/state/implementation-state.md`
- optional narrative memory when helpful, never as canonical routing truth

### 4. Planning-only request

Use `planning-manager` only when the user explicitly wants planning without running the rest of the delivery loop.

Examples:

- "Only create the plan."
- "Do not implement yet."
- "Suggest the approach and write the implementation guide."

Even then, prefer `delivery-manager` if you want pipeline state and approval checkpoints preserved.

For app-level planning without implementation, prefer `product-manager` over `planning-manager`.

### 0. Interviewer routing

Use `interviewer` first when:

- onboarding is incomplete
- the user does not know which agent or command to call
- the request could mean resume, status, simple-project delivery, or structured-project delivery
- the missing clarification would materially change the safe next owner

Expected behavior:

- read current state and memory first
- ask only minimal non-technical questions when truly needed
- route to `product-manager`, `release-manager`, or `delivery-manager`
- do not replace the dedicated what-now guidance command

### 5. Implementation-only request

Use `implementation-manager` only when all of these are true:

- an implementation guide already exists
- the active task is already known
- the user explicitly wants only task execution/remediation
- you do not need planning or feature-level routing

### 6. QA-only or audit-only request

Treat QA/audit/cleanup requests as direct-tool work or as part of the normal implementation review/remediation path.

Examples:

- "Assess the quality of this completed implementation."
- "Run QA checks for the current task."
- "Cleanup leftover code after implementation."

Use direct tools, the normal implementation review/remediation flow, or the explicitly narrow `implementation-reviewer` path when appropriate.

## Non-negotiable routing rules

- Do not let any manager other than `interviewer` decide the initial profile for a new project.
- Do not treat a whole app/product request as one normal feature.
- Do not send broad app bootstrap requests directly to `delivery-manager`.
- Do not bypass `release-manager` when a real git/release pipeline is configured for feature delivery.
- Do not let the main agent absorb this orchestration into one inline workflow.
- Do not create a new feature branch or PR while another non-terminal release lane exists.
- Do not bypass `delivery-manager` during normal new-feature or resume flows.
- Treat `product-manager` as the top-level bootstrap orchestrator for broad app/product requests.
- Treat `release-manager` as the outer git/release orchestrator when git pipeline is active.
- Treat `delivery-manager` as the only feature pipeline orchestrator.
- Treat `planning-manager` and `implementation-manager` as stage workers under the active delivery flow.
- Respect exclusive feature mode: do not overwrite an active feature with a different request.
- Do not stop after a completed `product-manager` bootstrap handoff unless the user explicitly asked to stop or the downstream handoff is blocked.

## Git/release behavior

When git pipeline is active, expect `release-manager` to:

- detect repo/release capability
- create or resume feature branch deterministically
- return a handoff so the main agent can run `delivery-manager` for implementation completion
- commit and push when supported
- create/update PR only after accepted feature completion
- resume an existing PR when one already exists for the active feature
- follow CI/review/merge stages only when actually configured
- block new feature lanes when an unresolved release lane already exists

If git pipeline is unavailable:

- skip git cleanly when `git_mode` is `auto`
- block only when `git_mode` is `required`

## Collision and resume behavior

Before normal delivery work, expect `delivery-manager` to determine one of these:

- `new_feature`
- `resume_matching_feature`
- `conflicting_feature_request`

If a different feature is already active:

- do not silently replace it
- let `delivery-manager` block or queue the request per pipeline state

## Recommended prompt patterns

### New feature

Send a feature request like:

```text
Implement <feature>.
Analyze the codebase first, suggest the best approach, create the implementation guide in PLAN_TEMPLATE style, then continue through implementation and review/fix completion.
```

If git pipeline is configured, this should flow through `release-manager` first.

### New app/product

```text
Build <application/product>.
Turn this into a realistic MVP project, create the project docs and roadmap, choose the first feature to build, then hand execution to the delivery pipeline.
```

### Plan approval first

```text
Implement <feature>.
Analyze the codebase and suggest the best approach first.
Create the implementation guide in PLAN_TEMPLATE style, but stop for approval before coding.
```

### Continue

```text
Continue delivery.
```

## Files to know

- `.claude/commands/delivery-start.md`
- `.claude/commands/delivery-continue.md`
- `.claude/commands/delivery-status.md`
- `.claude/commands/delivery-what-now.md`
- `.claude/commands/delivery-plan.md`
- `.claude/commands/delivery-implement.md`
- `.claude/commands/delivery-release.md`
- `.claude/commands/delivery-pr.md`
- `.claude/agents/team-map.md`
- `.claude/agents/product-manager.md`
- `.claude/agents/release-manager.md`
- `.dwemr/state/pipeline-state.md`
- `.dwemr/state/implementation-state.md`
- `.dwemr/state/pipeline-policy.md`
- `.dwemr/memory/README.md`

## Quick checklist

- Is this feature delivery rather than a tiny direct edit?
- Is this really an app/product bootstrap request instead of one feature?
- Is there a real git/release pipeline here, or should the flow skip git?
- Is there already an active feature in pipeline state?
- Should the flow stop for plan approval first?
- Should this go through `product-manager`, `release-manager`, or `delivery-manager` instead of a lower-level manager?
- Is the user asking for an isolated stage, or the whole pipeline?

## Reference

Open only if needed:

- Routing table and examples: `reference.md`
