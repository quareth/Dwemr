# Phase 5 Implementation Plan: Legacy Runtime Removal and Config Cleanup

Implemented closure spec: [phase-5-legacy-runtime-removal-and-config-cleanup-spec.md](./phase-5-legacy-runtime-removal-and-config-cleanup-spec.md)

## Intent

Remove or demote the legacy runtime assumptions that only existed to support DWEMR's direct-process execution model.

This phase should simplify the plugin after ACP-native execution is already working, not before.

## Scope Guardrail

This phase is only about cleanup, deprecation, and compatibility handling around runtime concerns.

It is **not** allowed to:

- change DWEMR workflow behavior
- redesign the project-local Claude workflow
- remove compatibility paths that are still required for normal operation

## Phase Objective

Reduce DWEMR's runtime surface so public installation and long-term maintenance align with the ACP-native design instead of continuing to orbit the old shell-based model.

## Cleanup Targets

This phase should evaluate and resolve the future of:

- managed ACPX wrapper ownership
- `acpxPath` as a first-class public runtime concept
- ACPX path-discovery/bootstrap logic
- PID-based active-run storage
- direct shell-oriented doctor messaging
- code paths that only exist for local process spawning

## Workstreams

### 1. Legacy Runtime Audit

Audit all runtime code and configuration that still exists only to support the legacy adapter.

Classify each item as:

- keep permanently
- keep temporarily as compatibility support
- deprecate
- remove

### 2. Config Surface Cleanup

Decide how the public config surface should look after ACP-native migration.

This should explicitly define:

- which runtime keys remain public and supported
- which keys become advanced compatibility options
- which keys should be deprecated from docs and UI hints

### 3. Runtime Discovery Simplification

Remove or simplify runtime discovery that no longer reflects the real primary execution model.

This includes reviewing whether ACPX executable discovery remains:

- primary
- fallback
- development-only
- removable

### 4. Diagnostic Cleanup

Update runtime diagnostics so the user sees the ACP-native runtime model as the default truth.

Legacy runtime details should not dominate the public diagnostic surface once they are no longer the normal path.

### 5. Test and Fixture Cleanup

Remove tests, fixtures, and helper assumptions that only validate the old process-launch runtime where that legacy path is no longer required.

## Deliverables

- a legacy-runtime audit record
- a cleaned runtime config policy
- reduced legacy discovery/bootstrap code
- simplified diagnostic language
- test coverage aligned to the new primary runtime model

## Related Official Docs

- Plugin runtime helpers: <https://docs.openclaw.ai/plugins/sdk-runtime>
- Plugin install and trust expectations: <https://docs.openclaw.ai/cli/plugins>
- ACP runtime installation and ownership model: <https://docs.openclaw.ai/tools/acp-agents>

## Validation Requirements

- normal DWEMR operation no longer depends on legacy runtime concepts
- public config/docs no longer overemphasize shell-oriented runtime controls
- cleanup does not regress any preserved command behavior

## Risks To Manage

- removing compatibility too early and breaking environments that still need a fallback
- keeping too much legacy runtime language and undermining the ACP-native trust story
- leaving hidden test assumptions tied to removed runtime behavior

## Exit Criteria

This phase is complete when:

- ACP-native runtime is clearly the primary execution path
- obsolete legacy runtime concepts are removed or intentionally downgraded
- the public runtime/config story is simpler than it was before the refactor

## Handoff To Phase 6

Phase 6 should start from a cleaned runtime model, not from a dual-runtime transition state, so public hardening can validate the architecture users will actually receive.
