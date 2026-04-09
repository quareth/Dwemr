# Memory system

This folder stores persistent narrative delivery memory so the pipeline can resume without re-explaining context.

## Structure

- `global/` -> human-readable narrative status and history

Important global files:

- `global/prompt.md` -> onboarding-enhanced build prompt, MVP boundary, included/deferred scope, and high-level design hints; created only when onboarding completed after a real clarification-response pass
- `global/last-implementation.md` -> optional implementation resume summary owned by `implementation-manager`
- `global/decision-log.md` -> notable planning/orchestration decisions when they materially affect delivery behavior
- `global/user-profile.md` -> durable onboarding collaboration snapshot

## Purpose

Retain only narrative context that is not already duplicated by canonical state:

- onboarding-enhanced prompt, MVP boundary, and clarified scope
- last accepted implementation summary when useful for resume context
- notable planning/orchestration decisions
- durable collaboration preferences from onboarding

Canonical delivery status, active feature identity, current checkpoint, routing truth, and next step now come directly from `.dwemr/state/*.md` plus active wave state when present. Fresh installs no longer seed a separate derived delivery-summary layer or team agenda/journal memory.

## Write policy

- Managers are primary writers.
- Specialists provide structured handoff data; managers persist memory updates.
- `prompt-enhancer` owns `prompt.md` when `/delivery-driver onboarding` runs it after a real clarification-response pass.
- `implementation-manager` owns `last-implementation.md`.
- planning and orchestration owners may append `decision-log.md` when the decision materially affects delivery behavior.
- `interviewer` owns `user-profile.md`.

## Relationship with runtime state files

Authoritative runtime state lives in `.dwemr/state/`:

- `.dwemr/state/onboarding-state.md` (onboarding/provisioning only)
- `.dwemr/state/pipeline-state.md`
- `.dwemr/state/release-state.md` (optional git/release traceability only)
- `.dwemr/state/execution-state.md`
- `.dwemr/state/implementation-state.md`
- `.dwemr/state/pipeline-policy.md`

`/memory` complements those files only where durable narrative context is still useful. It no longer carries a separate derived delivery-summary layer for active feature or current checkpoint reconstruction.

Never let `/memory` override canonical state when the two disagree.
