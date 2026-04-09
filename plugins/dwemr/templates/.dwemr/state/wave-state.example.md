# wave-state.example.md

Minimal reference template for `.dwemr/waves/<wave-id>/wave-state.md`.

Create a real `wave-state.md` only when a `standard_app` wave becomes active.

```yaml
dwemr_contract_version: 3
wave_id: "wave-1"
wave_title: "Foundations"
wave_goal: "Deliver the first bounded capability slice for this app."
why_now: "It unlocks the next planning and implementation work safely."
dependencies: []
wave_root_path: ".dwemr/waves/wave-1"
wave_doc_path: ""
wave_status: ""
architecture_doc_path: ""
planning_status: ""
implementation_status: ""
tech_spec_path: ""
architecture_doc_path: ""
implementation_guide_path: ""
wave_roadmap_path: "
epic_doc_path: ""
active_planning_worker: "none"
planning_artifact_in_progress: "none"
planning_worker_status: "idle"
blocked_reason: ""
updated_at: ""
```

Notes:

- Treat this example as the exact frontmatter schema for live `.dwemr/waves/<wave-id>/wave-state.md` files.
- Do not add ad hoc implementation-progress, task-tracking, checklist, or extra summary fields beyond this documented key set.
- If older repos already contain extra fields, treat them as legacy compatibility data and do not expand or rely on them.
- `pipeline-state.md`: global routing pointer that selects the active wave.
- `execution-state.md`: global checkpoint and resume surface; do not use `wave-state.md` as a replacement for it.
- `implementation-state.md`: implementation-lane local task packet and worker-loop detail; do not store that local implementation detail here.
- `wave_root_path`: canonical folder for this wave's documents.
- `wave_doc_path`: selected-wave definition packet owned by `wave-creator`.
- `architecture_doc_path`: wave-local architecture doc owned by `architect`.
- `tech_spec_path`: wave-local technical spec owned by `tech-spec`.
- `implementation_guide_path`: wave-local implementation guide owned by `implementation-guide-creator`.
- `wave_roadmap_path`: app-wide roadmap pointer owned by `product-manager`.
- `epic_doc_path`: app-wide epic pointer owned by `epic`.
- `active_planning_worker`: current or last planning worker acting on this wave.
- `planning_artifact_in_progress`: which planning artifact is currently being produced for this wave.
- `planning_worker_status`: planning-lane worker status only.
- `blocked_reason`: wave-planning-only blocker summary; leave empty when not blocked.
- `updated_at`: refresh whenever a prompt legitimately mutates `wave-state.md`.
- `planning_artifact_in_progress` allowed values: `wave_doc` | `architecture` | `tech_spec` | `implementation_guide` | `none`
- `planning_worker_status` allowed values: `idle` | `in_progress` | `blocked` | `reported` | `complete`
- legacy `wave_status`, `planning_status`, and `implementation_status` may still appear in older repos, but they should be treated as read-only compatibility fields rather than active routing truth.
- `product-manager` initializes wave identity, app-level pointers, and the first planning-oriented defaults.
- `product-manager` initializes `active_planning_worker: "none"`, `planning_artifact_in_progress: "none"`, `planning_worker_status: "idle"`, and `blocked_reason: ""`.
- `wave-planner`, `wave-creator`, `architect`, `tech-spec`, and `implementation-guide-creator` may update `active_planning_worker`, `planning_artifact_in_progress`, `planning_worker_status`, `blocked_reason`, `updated_at`, and their owned document-path fields only.
- `delivery-manager` keeps active-wave routing and wave completion progression in `pipeline-state.md`, not in wave-local status copies.
- Implementation workers do not write `wave-state.md` directly.
- Treat this file as the selected-wave state and artifact registry only.
- Treat this file as wave-internal flow state only.
- Do not store implementation guide phase/task cursors here; those belong in `.dwemr/state/implementation-state.md`.
- Do not use this file as the global resumability checkpoint; that belongs in `.dwemr/state/execution-state.md`.
- Do not use this file for broad app-level routing truth.
