# DWEMR Advanced Usage And Reference

This document holds the detailed operational and implementation reference that used to live in the main plugin README.

Use [../README.md](../README.md) for the lightweight overview, install steps, and everyday usage flow.

For runtime repair, ACPX host issues, and `/dwemr doctor` behavior, use [troubleshooting.md](troubleshooting.md).

## High-Level Shape

```text
                              ┌──────┐
                              │ User │
                              └──┬───┘
                                 │
                          /dwemr <action>
                                 │
              ┌──────────────────┴──────────────────┐
              │      OpenClaw + DWEMR Plugin         │
              │                                      │
              │  local ops        routed ops          │
              │  help / doctor    start / continue    │
              │  init / mode      plan / implement    │
              │  projects / use   release / pr / stop │
              │  model / effort   status / what-now   │
              └──────────────────┬───────────────────┘
                                 │
                        Managed ACPX session
                    (per model/effort combo)
                                 │
  ┌─────────────────────────────┴─────────────────────────────────┐
  │                       Target Project                           │
  │                                                                │
  │  CLAUDE.md  ·  .claude/commands  ·  .claude/agents             │
  │  .dwemr/state/*  ·  .dwemr/project-config.yaml                 │
  │                                                                │
  │  ┌──────────────────────────────────────────────────────────┐  │
  │  │  Main Agent  (state-first dispatcher)                   │  │
  │  │  reads state → picks owner → dispatches one subagent    │  │
  │  └────┬────────────────────┬────────────────────────────────┘  │
  │       │                    │                                   │
  │       │ [onboarding gate]  │ [if needs_product_framing]        │
  │       ▼                    ▼                                   │
  │   interviewer        product-manager                           │
  │   prompt-enhancer    (standard_app only)                       │
  │       │                    │                                   │
  │       └────────┬───────────┘                                   │
  │                ▼                                               │
  │  ┌──────────────────────────────────────────────────────────┐  │
  │  │  delivery-manager                                       │  │
  │  │  stage routing: planning → implementation [→ release]   │  │
  │  └────┬─────────────────┬─────────────────────┬─────────────┘  │
  │       │                 │                     │                │
  │       ▼                 ▼                     ▼                │
  │  ┌──────────┐   ┌───────────────┐    ┌──────────────┐         │
  │  │ planning │   │implementation │    │   release    │         │
  │  │ manager  │   │   manager     │    │   manager    │         │
  │  └────┬─────┘   └──────┬────────┘    └──────┬───────┘         │
  │       │                │                    │                  │
  │       ▼                ▼                    ▼                  │
  │  MINIMAL_TOOL:    one task per cycle:   git commit / push     │
  │   guide-creator    implementer          PR create / update    │
  │                    reviewer (phase      merge (if enabled)    │
  │  STANDARD_APP:       boundary only)                           │
  │   [architect]      fixer                                      │
  │   epic             e2e-tester                                 │
  │   tech-spec        wave-creator                               │
  │   guide-creator    wave-manager                               │
  │                    wave-planner                               │
  │                                                                │
  │  orchestrator  (user-proxy, callable by any manager)          │
  │                                                                │
  │  ── Canonical State (read priority) ────────────────────────   │
  │  1. onboarding-state.md    gate: profile, packs, install      │
  │  2. project-config.yaml    config: exec mode, SCM, approval   │
  │  3. pipeline-state.md      routing ledger: owner, stage       │
  │  4. execution-state.md     freshest checkpoint overlay        │
  │  5. implementation-state   task / worker loop detail          │
  │  6. release-state.md       optional git traceability          │
  │  7. pipeline-policy.md     gates, loop limits, severity       │
  │  +  waves/*/wave-state.md  standard_app wave-local state      │
  │  +  memory/global/*        narrative context only             │
  └────────────────────────────────────────────────────────────────┘
```

## Important Safety Note

DWEMR installs a project-local `.claude/settings.json` into initialized projects.

- Claude Code is put into `bypassPermissions` mode for that project
- `Bash`, `Edit`, and `Write` are allowed
- this is intentional so the workflow can run unattended inside Claude-managed project contexts
- ACP-native runs still depend on ACPX host policy for shell and file-write permissions

Use DWEMR only in projects where that permission model is acceptable. An isolated environment is recommended.

## Important Cost Note

DWEMR is not optimized for minimal token usage.

- token usage can be high, especially in `standard_app`
- long autonomous runs can accumulate meaningful model cost
- repeated planning, review, e2e, and release loops can add up quickly

For leaner runs, explicitly steer onboarding toward a minimal workflow:

```text
/dwemr start Build this as a minimal tool. Keep the workflow lightweight and avoid standard_app unless clearly necessary.
```

## Public Commands

DWEMR exposes one public OpenClaw command surface:

- `/dwemr <action> ...`

Supported actions:

- `help`
- `doctor [path] [--fix]`
- `init [path] [--overwrite] [--confirm-overwrite]`
- `mode <auto|checkpointed>`
- `sessions [clear]`
- `projects`
- `use <path>`
- `model [number|unset]`
- `subagents [number|unset]`
- `effort [number|unset]`
- `what-now [path if no active project]`
- `status [path if no active project]`
- `continue [path if no active project]`
- `stop [path if no active project]`
- `start [path if no active project] <request>`
- `plan [path if no active project] <request>`
- `implement [path if no active project]`
- `release [path if no active project]`
- `pr [path if no active project]`
- `git disable`

If the path contains spaces, quote it.

## Recommended Workflow

1. Install or link the plugin.
2. Run `/dwemr help` or `/dwemr doctor <path>`.
3. If DWEMR reports missing runtime state or ACPX permission issues, run `/dwemr doctor <path> --fix`.
4. Make sure Claude Code is authenticated with `claude auth status`.
5. Run `/dwemr init <path>`.
6. Run `/dwemr start <request>` to complete onboarding and let DWEMR provision the selected workflow profile.
7. If onboarding returns one clarification batch, answer it with another `/dwemr start <response>` run.
8. Continue delivery with the same public `/dwemr` commands.

Fresh bootstrap-only projects are not meant to continue through standalone Claude alone. If onboarding is run directly inside Claude and selects a profile, return to `/dwemr continue`, `/dwemr start`, or `/dwemr plan` so DWEMR can provision the required packs.

## Usage Examples

### Initialize a project

```text
/dwemr init /absolute/path/to/my-project
```

`/dwemr init` creates the target project folder and installs the DWEMR bootstrap kit into it.

### Work with one active project at a time

```text
/dwemr projects
/dwemr use /absolute/path/to/project-a
/dwemr status
/dwemr use /absolute/path/to/project-b
/dwemr what-now
```

### Start work and continue onboarding

```text
/dwemr start Build me a simple calculator app
/dwemr start 1: personal calculator 2A 3A 4B 5A 6A 7A
```

### Ask what to do next

```text
/dwemr what-now
```

`/dwemr what-now` is guidance-only. It does not start a new run by itself.

### Tune model, subagent model, and effort

```text
/dwemr model
/dwemr model 2
/dwemr subagents
/dwemr subagents 1
/dwemr effort
/dwemr effort 3
/dwemr effort unset
```

### Check live progress and stop a run

```text
/dwemr status
/dwemr stop
```

### Inspect or clear tracked DWEMR ACP sessions

```text
/dwemr sessions
/dwemr sessions clear
```

### Change execution mode

```text
/dwemr mode checkpointed
/dwemr mode auto
```

## Deterministic Dispatch

The public commands dispatch directly to plugin tools with raw command arguments:

- `/dwemr` -> `dwemr_command`

Key behaviors:

- `/dwemr help` is answered directly by the plugin
- `/dwemr init` installs the DWEMR bootstrap kit into the target project
- `/dwemr mode <auto|checkpointed>` updates `.dwemr/project-config.yaml` for the active project
- `/dwemr stop` stops the active OpenClaw-managed runtime owner and leaves Claude-owned workflow state files intact
- `/dwemr what-now` maps to the internal Claude command `/delivery-what-now`

At runtime DWEMR executes one Claude entrypoint per routed command through the ACP-native runtime backend. The legacy spawn-based shell execution path was retired in `0.2.0`.

DWEMR does not emulate Claude’s internal agents. It maps the requested action to one Claude entrypoint and returns only the final assistant response on success.

## Runtime Behavior

DWEMR keeps `/dwemr` available even before setup is healthy.

ACP-native run model:

- each routed `/dwemr` command executes as a one-shot ACP run
- continuity remains state-first via `.dwemr/state/*`, not by reusing one long-lived ACP session id

ACP-native runtime seam compatibility:

| Seam | Requirement | Behavior |
| --- | --- | --- |
| `api.runtime.tasks.flows` | Required | Primary ACP-native runtime orchestration/read seam. |
| `api.runtime.taskFlow` | Optional compatibility seam | Enables best-effort managed flow/task mutation ledger writes (`flowId`, `taskId`). Missing seam does not block command execution. |

When ACP-native prerequisites are missing at runtime, `/dwemr doctor` reports the missing seams. There is no fallback execution path.

## Bundled Workflow Assets

The package is self-contained. `init` installs a bootstrap pack instead of the full workflow.

Bootstrap assets include:

- `CLAUDE.md`
- `.claude/settings.json`
- the stable `.claude/commands/` surface
- `interviewer` and bootstrap-safe reference agents
- `.dwemr/guides/README.md`
- `.dwemr/project-config.yaml`
- `.dwemr/reference/`
- `.dwemr/memory/README.md`
- `.dwemr/reference/PLAN_TEMPLATE.md`
- `.dwemr/state/pipeline-policy.md`
- `.dwemr/state/implementation-state.example.md`

The bootstrap also seeds fresh runtime files instead of copying live runtime state:

- `.dwemr/state/pipeline-state.md`
- `.dwemr/state/execution-state.md`
- `.dwemr/state/implementation-state.md`
- `.dwemr/state/onboarding-state.md`
- `.dwemr/memory/global/*.md`

Post-onboarding runtime truth is authoritative only in:

- `.dwemr/state/pipeline-state.md`
- `.dwemr/state/execution-state.md`
- `.dwemr/state/implementation-state.md`

`.dwemr/memory/**` remains human-friendly narrative context and must never override those files when they disagree.

After onboarding completes, DWEMR provisions only the required profile packs:

- `profile-minimal-tool`
- `profile-standard-app`
- optional packs such as `standard-app-focused-planning`

If git is not enabled in `.dwemr/project-config.yaml`, `/dwemr release` and `/dwemr pr` stop with an explicit unavailable message instead of entering the release lane.

`templates/CLAUDE.md` is the single shipped main-agent guide source. During `init`, DWEMR copies that file into the target project root as `CLAUDE.md`.

`.claude/` is reserved for Claude-native control files only. DWEMR-owned config, state, memory, reference material, and generated guides live under `.dwemr/`.

## Shared Config

The installed `.dwemr/project-config.yaml` is the shared control-plane file for project-level decisions, such as:

- onboarding-resolved project size
- execution and approval defaults
- whether git, GitHub, PR, CI, and merge capabilities are available

Bootstrap installs seed unresolved onboarding-owned fields as `unset`.

Example:

```yaml
project:
  size: unset

delivery:
  execution_mode: unset
  approval_mode: auto

scm:
  git_mode: unset
  github: unset
  remote_push: unset
  pull_requests: unset
  ci: unset
  merge: unset
```

## Optional Plugin Config

DWEMR can read a plugin config entry at `plugins.entries.dwemr`.

Example:

```json
{
  "acpAgent": "claude",
  "acpBackend": "acpx",
  "activeProjectPath": "/absolute/path/to/project",
  "defaultProjectPath": "/absolute/path/to/project",
  "model": "sonnet",
  "subagentModel": "claude-sonnet-4-6",
  "effortLevel": "medium",
  "projects": [
    {
      "path": "/absolute/path/to/project",
      "addedAt": "2026-03-31T00:00:00.000Z",
      "lastUsedAt": "2026-03-31T00:00:00.000Z",
      "initialized": true
    }
  ]
}
```

Behavior notes:

- `acpAgent` optionally overrides the ACP harness agent id used by ACP-native runs
- `acpBackend` optionally overrides the ACP backend id
- `model` optionally selects the Claude model for DWEMR runs
- `subagentModel` optionally overrides the Claude model used for subagents
- `effortLevel` optionally overrides Claude effort for DWEMR runs
- `activeProjectPath` is a legacy compatibility fallback for the selected project path
- `projects` is a legacy compatibility fallback for remembered project metadata

When `activeProjectPath` or `defaultProjectPath` is set, `/dwemr init` and `/dwemr` may omit the path argument.

Current DWEMR builds persist remembered projects under the OpenClaw state directory instead of writing them into `openclaw.json` during normal command execution.

## Internal Implementation Surfaces

These remain internal implementation surfaces and are not the recommended public interface:

- plugin id `dwemr`
- tool `dwemr_init`

## Plugin Layout

- `openclaw.plugin.json`: native OpenClaw manifest
- `package.json`: package metadata
- `index.ts`: plugin entry and deterministic command tools
- `skills/`: public OpenClaw slash commands
- `templates/`: bundled Claude workflow assets
