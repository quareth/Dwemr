# DWEMR — AI Coding Guide

A short compass for AI assistants working in this repo. Read this before making changes.

## What this repo is

DWEMR is an OpenClaw plugin that installs a Claude-native delivery workflow into a target project and routes the public `/dwemr` command surface through OpenClaw. The plugin runtime is kept strictly separate from the project-local workflow it provisions. See [README.md](README.md) for the user-facing overview.

## Layout

```
plugins/
├── dwemr/                          # the published plugin
│   ├── index.ts                    # plugin entry — only consumes openclaw/cli/* + openclaw/state/project-selection
│   ├── openclaw.plugin.json        # plugin manifest
│   ├── src/
│   │   ├── control-plane/          # project assets, onboarding, pipeline, config — pure project-state logic
│   │   └── openclaw/               # plugin-runtime layer (see split below)
│   │       ├── cli/                # public command surface (handlers, routing, handler types)
│   │       ├── backend/            # runtime execution + backend registry
│   │       │   ├── acp-native/     # ACP-native backend internals (one focused file per concern)
│   │       │   ├── runtime.ts      # ACPX discovery + managed runtime helpers
│   │       │   ├── runtime-backend.ts        # backend registry / default selection
│   │       │   ├── runtime-backend-types.ts  # backend contract types
│   │       │   ├── claude-runner.ts          # process result types + legacy stubs
│   │       │   └── spawn-backend.ts          # legacy spawn adapter (intentional stub)
│   │       ├── state/              # JSON persistence: active runs, project memory, plugin config
│   │       └── diagnostics/        # /dwemr doctor (health checks, repair)
│   ├── skills/, templates/         # bootstrap assets installed into target projects
│   └── docs/PLAN_TEMPLATE.md
└── dev/                            # internal: tests + design docs (NOT shipped)
    ├── tests/                      # tsx node:test suites
    └── docs/                       # architecture, flows, refactor notes (see below)
```

## Reference docs

When you need context about how a feature works, look here before guessing:

- **High-level architecture diagrams**: [`plugins/dev/docs/architecture/`](plugins/dev/docs/architecture/) — `delivery-manager-high-level.mmd`, `high-level-agentic-workflow.mmd`
- **Subagent flow diagrams**: [`plugins/dev/docs/flows/`](plugins/dev/docs/flows/) — planning-manager, feature-implementer, implementation-reviewer, implementation-fixer, e2e-tester, release-manager

## Coding guidelines

Follow these to keep the codebase clean and prevent the same monoliths we just finished extracting.

### File shape and boundaries

- **Respect the openclaw subfolder split.** `cli/` is the public command surface, `backend/` is execution, `state/` is JSON persistence, `diagnostics/` is health checks. Don't add cross-cutting "utils" files at the openclaw root — pick the folder that matches the concern.
- **Keep files focused.** If a file grows past ~500 lines or starts mixing concerns, split it. The largest current file is `cli/action-handlers.ts` (~743 lines) and `backend/acp-native/acp-native-backend.ts` (~551 lines) — these are upper bounds, not targets.
- **One responsibility per file.** Look at how `backend/acp-native/` is split (config, keys, output, readiness, session-lifecycle, stop, turn-result, flow-tracking) — that's the model. New ACP concerns get their own file, not appended to `acp-native-backend.ts`.
- **Filenames over barrels.** No `index.ts` re-export barrels in subfolders. Importers reference files directly so the dependency graph stays explicit.

### Separation of concerns

- **`control-plane/` knows nothing about runtimes.** It owns project state on disk (onboarding, pipeline, config, assets, contract). It must never import from `openclaw/`.
- **`openclaw/cli/` is the only entry point.** `plugins/dwemr/index.ts` should only consume from `openclaw/cli/*` and `openclaw/state/project-selection`. Don't widen the public surface without a reason.
- **`openclaw/backend/` is private to the runtime layer.** CLI handlers go through `getDefaultRuntimeBackend()` from `backend/runtime-backend.ts`, never directly into ACP-native internals.
- **`state/` files own their JSON file**, including paths and serialization. Don't read or write `.dwemr/tools/*.json` from anywhere else.

### Duplication and abstractions

- **Don't duplicate logic across backends or handlers.** If the spawn and ACP-native backends both need something, hoist it to `backend/` root, not into both subfolders.
- **Don't create speculative abstractions.** Three similar lines is better than a premature helper. Only extract when there's a real second caller.
- **Don't add backwards-compat shims.** If you remove or rename something, fix every caller in the same change. Tests + typecheck will catch you.

### Tests and verification

- **Tests live in `plugins/dev/tests/`** and run via `tsx --test`. They import directly from the plugin source — when you move or rename anything, update the test imports in the same change.
- **Always run both gates** from `plugins/dwemr/`:
  ```bash
  npm run typecheck    # tsc --noEmit
  npm test             # tsx --test ../dev/tests/**/*.test.ts
  ```
- **Don't mock things you can test for real.** Tests in this repo use real temp directories and JSON files (see `plugins/dev/tests/fixtures/`).

### Imports and paths

- **Relative imports only.** No path aliases in tsconfig. When you move a file, update its outgoing `..` paths AND every importer in one pass.
- **Use `git mv`** for file relocations so history is preserved.

### When in doubt

- Check existing similar code before inventing a new pattern. The repo already has answers for most things.
- If a change feels like it wants to cross folder boundaries, stop and reconsider — that's usually a sign the concern is in the wrong place.
