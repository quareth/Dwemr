# implementation-state.example.md

Minimal reference template for `.dwemr/state/implementation-state.md`.

Use this only as a schema example. Replace the placeholder values with the active guide and task chosen by the planning/delivery flow.

```yaml
dwemr_contract_version: 3
feature_id: "none"
guide: "<active-implementation-guide-path>"
phase: "0"
task: "0.1"
intent_summary: "One-sentence summary of the active task intent."
ownership_checklist:
  - "task-scoped changes only"
  - "follow explicit guide constraints"
  - "run relevant verification before handoff"
active_worker: "none"
worker_status: "idle"
attempt_id: ""
changed_files: []
verification_commands: []
verification_summary: ""
reviewer_verdict: ""
review_findings_ref: ""
updated_at: ""
```

Notes:

- Treat this file as the implementation-lane local task packet and worker-loop detail. Manager-acknowledged task acceptance still belongs in `pipeline-state.md`.
- `feature_id`: active feature identity for the current implementation loop.
- `guide`: path to the active implementation guide. This may be `.dwemr/guides/<implementation-guide>.md` for non-wave flows or `.dwemr/waves/<wave-id>/implementation-guide.md` for `standard_app`.
- `phase`: current phase identifier from the guide.
- `task`: current task identifier from the guide.
- `intent_summary`: brief description of what this task is supposed to achieve.
- `ownership_checklist`: short task-specific guardrails the implementer/reviewer should keep in view.
- `active_worker`: current implementation-lane worker (`feature-implementer`, `implementation-reviewer`, `implementation-fixer`) or `none`.
- `worker_status`: local implementation-lane progress only. Suggested values: `idle` | `implementing` | `under_review` | `fixing` | `blocked` | `reported`.
- `attempt_id`: stable local loop marker for the current implement-review-fix attempt.
- `changed_files`: local list of task-scoped files touched in the latest implementation/fix pass.
- `verification_commands`: commands run for the latest implementation or fix pass.
- `verification_summary`: concise verification result for the latest implementation-lane pass.
- `reviewer_verdict`: latest reviewer outcome when review has run.
- `review_findings_ref`: optional local pointer to a findings packet or report section.
- `updated_at`: refresh whenever the implementation lane legitimately mutates this file.
- Keep this file structured and concise. Do not use prose here as runtime truth.
