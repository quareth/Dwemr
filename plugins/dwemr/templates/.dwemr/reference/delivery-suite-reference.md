# Delivery Suite Reference

## Routing table

| User intent | Default route | Notes |
|---|---|---|
| Onboarding incomplete | `interviewer` | Run onboarding first; do not begin normal delivery |
| Build a whole app/product/system | `product-manager` | Bootstrap first, then hand first feature to delivery |
| New feature implementation with git pipeline | `release-manager` | Preferred when repo pipeline is real |
| New feature implementation without git pipeline | `delivery-manager` | Fallback when git is unavailable |
| Resume current feature with active release state | `release-manager` | Continue git/release wrapper |
| Resume current feature without release state | `delivery-manager` | Usual non-git resume |
| Approach suggestion + plan approval before coding | `delivery-manager` | Lets pipeline preserve approval checkpoint |
| Plan only, no implementation | `planning-manager` | Use only if explicitly stage-isolated; prefer `product-manager` for app-level planning and `delivery-manager` when you want approval checkpoints/state |
| Implement current known task only | `implementation-manager` | Requires existing guide/task context |
| QA/audit/cleanup only | direct tools or `implementation-reviewer` when explicitly needed | Not a separate routed command lane |
| Ad hoc tests only | `tester` or normal tools | Not a full delivery run |

## State model

Primary runtime files:

- `.dwemr/state/onboarding-state.md`
- `.dwemr/state/pipeline-state.md`
- `.dwemr/state/implementation-state.md`
- `.dwemr/state/pipeline-policy.md`

Retained narrative memory:

- `.dwemr/memory/global/prompt.md`
- `.dwemr/memory/global/last-implementation.md`
- `.dwemr/memory/global/decision-log.md`

Optional release trace:

- `.dwemr/state/release-state.md`

These memory files are optional narrative context only. They must never override `.dwemr/state/onboarding-state.md`, `.dwemr/state/pipeline-state.md`, `.dwemr/state/execution-state.md`, or `.dwemr/state/implementation-state.md`.

## Expected delivery-manager outcomes

`delivery-manager` should determine:

0. Is onboarding already complete and binding?
1. Is this a new feature?
2. Is this a resume of the active feature?
3. Is this a conflicting request while another feature is active?
4. Does the flow require plan approval before coding?
5. Which subagent should the main agent run next?
6. Has the feature reached a terminal state?

Terminal states:

- `done`
- `blocked_waiting_human`
- `blocked_loop_limit`
- `cancelled`

## Expected product-manager outcomes

`product-manager` should determine:

1. Is this request app-level/product-level rather than one bounded feature?
2. What is the realistic MVP for a solo developer?
3. What app-level roadmap and wave docs need to exist?
4. Whether app framing is complete enough to hand off to `delivery-manager` directly or needs `epic` first
5. What is the prioritized first feature to build?
6. When should ownership pass to `release-manager` vs `delivery-manager`?
7. What next action should the main agent take?

## Expected release-manager outcomes

`release-manager` should determine:

1. Is git/release pipeline actually available?
2. Should git be skipped, blocked, or used?
3. What branch/base/remote should be used?
4. When should `delivery-manager` run under the release wrapper?
5. Which release stages are real for this repo: commit, push, PR, CI, merge?
6. Should it resume an existing release lane or block instead of creating a new one?
7. What next action should the main agent take?

Release checkpoint convention:

- pushed branch, no PR yet -> `release_stage: pushed`, `pr_status: not_created`, `merge_status: not_requested`, `release_lock: true`
- PR open -> `release_stage: pr_open`, `pr_status: open`
- merged -> `release_stage: merged`, `pr_status: merged`, `merge_status: merged`, `release_lock: false`

## Examples

### Example 0: first-run onboarding

```text
Build a calculator utility.
```

Route: `interviewer` in onboarding mode first, then provision the selected profile, then continue through normal delivery

### Example 1: full autonomous feature

```text
Implement Markdown chat export from the task detail page.
Analyze the codebase, suggest the best approach, create the implementation guide in PLAN_TEMPLATE style, then continue through implementation and review/fix completion.
```

Route: `release-manager` when git pipeline is real, otherwise `delivery-manager`

If the project execution mode is `checkpointed`, the same flow should stop at `implementation_ready`, then at profile-appropriate feature or phase milestones instead of running straight through.

### Example 2: app bootstrap

```text
Build a calculator application.
Turn it into a realistic MVP project, create the roadmap, and pick the first feature to implement.
```

Route: `product-manager`

Expected result: `product-manager` creates or refreshes the roadmap when needed, then returns the first-feature handoff to `release-manager` when git pipeline is real, otherwise `delivery-manager`

### Example 3: stop after plan

```text
Implement per-project task tags.
Analyze the codebase and suggest the best approach first.
Create the guide in PLAN_TEMPLATE style, but stop for approval before coding.
```

Route: `release-manager` when release state is active, otherwise `delivery-manager`

Expected result: planning checkpoint with approval wait

### Example 4: continue current pipeline

```text
Continue delivery.
```

Route: `release-manager` when release state is active, otherwise `delivery-manager`

### Example 5: planning only

```text
Do not implement yet.
Suggest the approach and create the implementation guide for task export presets.
```

Route: `planning-manager` only when the request is explicitly stage-isolated; otherwise prefer `delivery-manager` for stateful plan approval or `product-manager` for app-level planning

### Example 6: QA-only audit

```text
Assess the quality of the current implementation and clean up leftover code if needed.
```

Route: use direct tools, the normal review/remediation path, or `implementation-reviewer` when the request is explicitly phase-scoped

## Guardrails

- Do not let `delivery-manager`, `planning-manager`, or `product-manager` re-decide project size after onboarding.
- Do not treat `planning-manager` as the normal entrypoint.
- Do not treat a whole app/product request as a single feature guide.
- Do not bypass `product-manager` for broad bootstrap requests.
- Do not bypass `release-manager` when git pipeline is active.
- Do not rely on subagents spawning child subagents; the main agent should perform all dispatch based on returned handoffs.
- Do not create a second branch/PR lane while an open PR, pending CI, failing CI, or merge-pending lane already exists.
- Do not create a new PR if the active feature already has one; resume/update it instead.
- Do not advance from planning to implementation outside `delivery-manager` during standard delivery.
- Do not overwrite an active exclusive feature with a different request.
- Do not use the delivery suite when a direct edit is clearly simpler than orchestration.
