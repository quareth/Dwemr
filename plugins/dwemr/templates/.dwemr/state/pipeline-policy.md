# Pipeline policy

Use this file as default execution policy for `delivery-manager` and `implementation-manager`.

When git/release pipeline is active, `release-manager` wraps this flow.

## Configuration source of truth

Read `.dwemr/project-config.yaml` when present.

Policy interpretation rules:

- if config marks a capability unavailable or disabled, prefer a lower-capability recovery path over blocking when `scm.git_mode` is `auto`
- if config asks for lighter planning/docs/verification behavior, keep the workflow minimal while preserving verification quality
- if config asks for standard/structured behavior, keep the fuller workflow

## Gates

- **Implementation completeness gate:** `implementation-reviewer` must return `COMPLETE` before leaving the current phase or completing the feature.
- **Mandatory verification gate:** every task requires task-scoped implementation-worker verification evidence before advancing to the next task.
- **Phase-boundary review gate:** the task that closes a phase must also receive an acceptable `implementation-reviewer` verdict before the workflow leaves that phase.
- **Canonical severity taxonomy:** `High`, `Medium`, `Low`, `Info`.
- **Fix-required findings:** any `[High]` or `[Medium]` finding from implementation review or downstream remediation/release evidence.
- **Acceptance threshold:** high/medium findings require fixes; low/info can be deferred.

## Loop limits

- Max reviewer/fixer loops per phase-boundary review cycle: `5`

Loop-limit behavior:

- If the reviewer/fixer loop limit is reached, `implementation-manager` must return `blocked_loop_limit` to `delivery-manager`.
- `delivery-manager` must then mark the pipeline blocked instead of silently retrying.

## Required checks per task

- Minimum required on every task: task-scoped verification evidence from the implementation worker.
- Additional required before leaving a phase or completing the feature: `implementation-reviewer` verdict for the task that closes the current phase.
- Additional audits or specialized checks may still be useful when risk or user intent justifies them, but they are outside the default routed delivery flow.
- Do not assume a separate routed QA stage is active in the default delivery flow.

## Completion behavior

- Default objective per invocation: continue autonomously until the active feature reaches a terminal state.
- After each accepted task, update:
  - `.dwemr/state/implementation-state.md`
  - `.dwemr/state/pipeline-state.md`
  - `.dwemr/state/execution-state.md`
  - `.dwemr/memory/global/last-implementation.md`
- Do not depend on retired delivery-summary memory for acceptance, status, or resume behavior.
- Delivery truth comes from canonical state plus retained narrative context only when it adds non-routing detail.

## Git/release policy

- Git pipeline is optional and should run only when repository/dev pipeline capability is real or explicitly required.
- `release-manager` owns branch/commit/push/PR/CI/merge orchestration when git pipeline is active.
- `delivery-manager` should not duplicate git orchestration.
- If git pipeline is unavailable and `git_mode` is `auto`, skip git cleanly.
- If git pipeline is unavailable and `git_mode` is `required`, block the pipeline.
- Never auto-merge unless repository policy explicitly allows it or the user explicitly requests it.
- Never create a new feature branch or PR while an existing release lane is non-terminal.
- `release-manager` must always resume an existing branch/PR/CI lane for the same feature before creating anything new.
- `release-manager` must block, not fork a second lane, when another feature already owns a non-terminal release lane.
- Commit/push/PR creation should happen only after the feature reaches accepted delivery completion under the active review/verification gates.
- Open PR, pending CI, failing CI, or merge-pending states are non-terminal and must be resumed or explicitly resolved before another feature starts.
- Deterministic branch naming must map the same feature id to the same branch unless the user explicitly requests a different branch policy.

## Escalation

- Prefer `orchestrator` for non-secret decisions.
- Escalate to human only when `orchestrator` returns `ESCALATE_TO_HUMAN`.
