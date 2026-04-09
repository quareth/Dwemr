# Execution Mode Runbook

**Source of truth:** `execution_mode` field in `.dwemr/state/pipeline-state.md`

---

## `autonomous`

The pipeline runs continuously without pausing for human confirmation.

**Behavior:**
- Proceed through every task, phase transition, and wave transition without stopping.
- When a decision or clarification is needed, invoke `orchestrator` and continue — do not ask the human user directly.
- Stop only when one of these hard conditions is met:
  - A genuine external blocker exists that no agent can resolve (missing secret, legal approval, irreconcilable conflict)
  - `orchestrator` returns `ESCALATE_TO_HUMAN`
  - Terminal status is reached (`done`, `cancelled`)

**Mandatory handoff line:**
Every manager must end its handoff output with:
```
execution_mode: autonomous — dispatch [next_owner] immediately, do not ask the user
```

---

## `checkpointed`

The pipeline pauses at meaningful boundaries and waits for the user to resume with `/dwemr continue`.

**Behavior:**
- Run until the next checkpoint boundary, then stop, write state, and report.
- Checkpoint boundaries are: phase completion and wave transition.
- At each stop: write a brief summary of what was completed, what was decided, and what comes next.
- Do not stop at internal manager or worker boundaries — only at phase and wave boundaries.

**Mandatory handoff line:**
Every manager must end its handoff output with:
```
execution_mode: checkpointed — stop at [boundary type], summarize, await /dwemr continue
```

---

## What counts as a real blocker (both modes)

- A required secret, credential, or external access the user must supply
- An explicit `plan_approval_required` gate
- `orchestrator` returns `ESCALATE_TO_HUMAN`
- Irreconcilable conflict between state files with no basis to choose

Routine decisions, missing context, approach choices, and prioritization are **not** blockers — route those through `orchestrator`.
