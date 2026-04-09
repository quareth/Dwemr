# Phase 6 Implementation Plan: Public Release Hardening

## Intent

Validate that the ACP-native runtime refactor is not only technically correct, but also good enough for public installation, public trust, and ongoing maintenance.

This phase converts a successful refactor into a release-ready public plugin story.

## Scope Guardrail

This phase is only about public hardening, verification, and release readiness for the runtime refactor.

It is **not** allowed to:

- redesign product behavior
- reopen completed runtime architecture decisions without a concrete blocker
- change the underlying Claude workflow

## Phase Objective

Confirm that the new runtime model:

- removes the dangerous-install public install problem
- behaves correctly in supported environments
- is documented clearly
- can be maintained confidently after public release

## Workstreams

### 1. Install Trust Validation

Validate the install experience end to end.

The central question for this workstream is simple:

- can users install DWEMR publicly without a dangerous-install bypass?

This validation should be treated as a release gate, not a nice-to-have.

This workstream must also include an explicit code-safety gate:

- plugin code-safety scan reports no critical findings for the shipped package
- no release proceeds while critical scan findings remain unresolved

### 2. Platform Verification

Verify runtime behavior on the environments DWEMR intends to support.

At minimum this should cover:

- macOS
- Linux

Windows should be explicitly classified as:

- supported
- limited
- not currently supported

with the decision reflected in docs.

### 3. Diagnostic and Support Review

Confirm that public-facing support surfaces match the new architecture.

This includes:

- README runtime guidance
- doctor output
- recovery notes
- support links and issue guidance

### 4. CI and Regression Coverage

Ensure CI and local verification cover the new runtime behavior appropriately.

This phase should define:

- which tests protect the preserved runtime contract
- which tests verify ACP-native behavior
- which release checks are required before publishing updates

### 5. Release Messaging

Prepare the public explanation of the refactor.

This should cover:

- what changed internally
- what stayed the same for users
- whether any legacy runtime configuration was removed or downgraded
- what users should do if they are coming from older installs

## Deliverables

- public install-validation results
- platform/runtime verification checklist
- updated support and runtime guidance
- release-gated verification checklist
- public release notes or migration notes

## Related Official Docs

- Plugin install/public distribution behavior: <https://docs.openclaw.ai/cli/plugins>
- Plugin authoring and packaging model: <https://docs.openclaw.ai/plugins/building-plugins>
- ACP runtime health and controls: <https://docs.openclaw.ai/tools/acp-agents>
- Session/background execution behavior: <https://docs.openclaw.ai/tools/subagents>

## Validation Requirements

- install no longer requires `--dangerously-force-unsafe-install`
- plugin code-safety scanning reports no critical findings for the release artifact
- the plugin behaves correctly on supported platforms
- the declared minimum OpenClaw version of `2026.4.2` matches the runtime helper surface the implementation actually uses
- public docs reflect the ACP-native runtime model
- regression coverage protects the preserved command/runtime contract

## Risks To Manage

- assuming the architectural refactor alone guarantees good public install UX
- under-documenting migration behavior for existing users
- leaving platform support ambiguous after the runtime change

## Exit Criteria

This phase is complete when:

- DWEMR is publicly installable without a security-bypass warning
- release package passes plugin code-safety scanning with no critical findings
- the shipped plugin does not depend on runtime helpers that are absent from the declared minimum OpenClaw version of `2026.4.2`
- docs and diagnostics match the shipped runtime model
- supported-platform expectations are explicit
- release verification is strong enough for continued public maintenance
