# Quality Runebook

Use this runebook for implementation quality only.


If the user request conflicts with a default in this runebook, the user request wins.

## Core principles

- Prefer clarity over cleverness.
- Prefer the smallest clean solution over a more abstract one.
- Keep code understandable for a future maintainer.
- Professional quality does not mean unnecessary complexity.

## Coding standards

- Use clear and descriptive names for files, functions, variables, and components.
- Keep functions, modules, and classes focused on one clear responsibility.
- Avoid giant monolithic files when a small split would clearly improve readability.
- Avoid unnecessary abstractions, wrappers, and layers.
- Reuse existing patterns when they are already present and sensible.
- Keep control flow straightforward and easy to follow.
- Do not leave dead code, commented-out junk, fake placeholders, or misleading TODOs.
- Do not hardcode secrets, credentials, or sensitive environment-specific values.
- Use constants or configuration when values are repeated enough or likely to change.
- Handle obvious failure cases deliberately instead of failing silently.

## Quality expectations

- The main flow should be easy to identify in the code.
- Inputs should be handled at sensible boundaries.
- Errors should be understandable where relevant.
- Output and behavior should be predictable and consistent.
- The result should feel intentional, not hacked together.

## Anti-patterns

- unnecessary architecture
- speculative extensibility
- oversized file trees for tiny tools
- hidden control flow
- copy-pasted logic without reason
- silent failures
- misleading naming
- fake completion
