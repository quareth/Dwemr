# Quality Runbook


If the user request conflicts with a default in this runbook, the user request wins.

This runbook sets a stronger quality bar.

## Core principles

- Prefer clarity over cleverness.
- Prefer simple, well-structured engineering over heavy architecture.
- Keep the codebase understandable for future modification.
- Use stronger structure only when it improves the current project, not to prepare for imagined scale.
- Professional quality does not require enterprise-style complexity.

## Coding standards

- Use clear, descriptive, and consistent names for files, functions, variables, types, services, and components.
- Keep functions, modules, classes, and components focused on one clear responsibility.
- Split code by responsibility when it improves readability, navigation, or maintainability.
- Avoid giant monolithic files and overly crowded modules.
- Avoid unnecessary abstractions, wrappers, and indirection.
- Reuse existing patterns when they are already sensible and established in the project.
- Keep control flow straightforward and easy to trace.
- Keep boundaries between concerns understandable, especially between UI, data access, domain logic, and integration code.
- Do not leave dead code, commented-out junk, fake placeholders, or misleading TODOs.
- Do not hardcode secrets, credentials, or sensitive environment-specific values.
- Use constants or configuration for values that are likely to change, repeated enough to hurt maintainability, or important enough to deserve a named meaning.
- Handle obvious failure cases deliberately instead of failing silently.
- Prefer explicit behavior over hidden side effects.

## Quality expectations

- The main flow should be easy to identify in the code.
- Important responsibilities should be separated clearly enough that another developer can navigate the project without guessing.
- Inputs should be handled at sensible boundaries.
- Errors should be understandable where relevant.
- Output and behavior should be predictable and consistent.
- New code should fit the project structure instead of introducing a competing style.
- Shared logic should be extracted when duplication becomes real and harmful.
- The result should feel intentional, maintainable, and professionally written without becoming ceremonious.

## Anti-patterns

- unnecessary architecture
- speculative extensibility
- excessive layering for a modest product
- oversized file trees without clear value
- hidden control flow
- copy-pasted logic without reason
- wrapper-on-wrapper design
- silent failures
- misleading naming
- fake completion
