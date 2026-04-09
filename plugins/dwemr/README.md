# Delivery Workflow Engine & Memory Relay (DWEMR)

DWEMR is an OpenClaw plugin that installs and operates a Claude-native delivery workflow.

It is intentionally split into two layers:

- OpenClaw public layer: short deterministic slash commands
- Claude internal layer: the bundled `/delivery-*` workflow plus `/delivery-driver` onboarding procedure inside the target project

OpenClaw is the operator. Claude Code remains the delivery engine.

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
              │  projects / use   release / pr / stop  │
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
  │  .dwemr/state/*  ·  .dwemr/project-config.yaml                │
  │                                                                │
  │  ┌──────────────────────────────────────────────────────────┐  │
  │  │  Main Agent  (state-first dispatcher)                    │  │
  │  │  reads state → picks owner → dispatches one subagent     │  │
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
  │  │  delivery-manager                                        │  │
  │  │  stage routing: planning → implementation [→ release]    │  │
  │  └────┬─────────────────┬─────────────────────┬─────────────┘  │
  │       │                 │                     │                │
  │       ▼                 ▼                     ▼                │
  │  ┌──────────┐   ┌───────────────┐    ┌──────────────┐         │
  │  │ planning │   │implementation │    │   release    │         │
  │  │ manager  │   │   manager     │    │   manager    │         │
  │  └────┬─────┘   └──────┬────────┘    └──────┬───────┘         │
  │       │                │                    │                  │
  │       ▼                ▼                    ▼                  │
  │  MINIMAL_TOOL:    one task per cycle:   git commit / push      │
  │   guide-creator    implementer          PR create / update     │
  │                    reviewer (phase      merge (if enabled)     │
  │  STANDARD_APP:       boundary only)                            │
  │   [architect]      fixer                                       │
  │   epic             e2e-tester                                  │
  │   tech-spec        wave-creator                                │
  │   guide-creator    wave-manager                                │
  │                    wave-planner                                 │
  │                                                                │
  │  orchestrator  (user-proxy, callable by any manager)           │
  │                                                                │
  │  ── Canonical State (read priority) ────────────────────────   │
  │  1. onboarding-state.md    gate: profile, packs, install       │
  │  2. project-config.yaml    config: exec mode, SCM, approval   │
  │  3. pipeline-state.md      routing ledger: owner, stage        │
  │  4. execution-state.md     freshest checkpoint overlay         │
  │  5. implementation-state   task / worker loop detail           │
  │  6. release-state.md       optional git traceability           │
  │  7. pipeline-policy.md     gates, loop limits, severity        │
  │  +  waves/*/wave-state.md  standard_app wave-local state       │
  │  +  memory/global/*        narrative context only              │
  └────────────────────────────────────────────────────────────────┘
```

## Requirements

- Node.js 22 or newer
- OpenClaw `2026.4.2` or newer
- OpenClaw's ACPX runtime available on the machine
- Claude Code installed and authenticated on the host machine

DWEMR relies on OpenClaw's ACPX runtime for Claude execution. On healthy OpenClaw installs this is usually available automatically.

## Quick install

```bash
openclaw plugins install dwemr
openclaw gateway restart
```

Then configure `plugins.entries.dwemr.config` in your OpenClaw config only if you need optional runtime overrides such as a default project path or model override.

## Important Safety Note

DWEMR installs a project-local `.claude/settings.json` into initialized projects.

- Claude Code is put into `bypassPermissions` mode for that project
- `Bash`, `Edit`, and `Write` are allowed
- this is intentional so the bundled workflow can run unattended

Use DWEMR only in projects where that permission model is acceptable. Running it in an isolated environment is recommended.

## Important Cost Note

DWEMR is not optimized for minimal token usage.

- token usage can be high, especially in `standard_app` mode
- long autonomous runs can accumulate significant model cost through repeated planning, review, e2e, and release loops
- use DWEMR with care if you are sensitive to model spend

For leaner runs, explicitly steer onboarding toward a minimal workflow in your request, for example:

```text
/dwemr start Build this as a minimal tool. Keep the workflow lightweight and avoid standard_app unless clearly necessary.
```

## Support

- Repository: [https://github.com/quareth/Dwemr](https://github.com/quareth/Dwemr)
- Issues: [https://github.com/quareth/Dwemr/issues](https://github.com/quareth/Dwemr/issues)
- Local development: `openclaw plugins install -l ./plugins/dwemr`

## Public commands

DWEMR exposes one public OpenClaw command surface:

- `/dwemr <action> ...`

Supported `/dwemr` actions:

- `help`
- `doctor [path] [--fix]`
- `init [path] [--overwrite] [--confirm-overwrite]`
- `mode <auto|checkpointed>`
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
- `release [path if no active project]` (requires git enabled)
- `pr [path if no active project]` (requires git enabled)
- `git disable`

If the path contains spaces, quote it.

## Deterministic dispatch

The public commands dispatch directly to plugin tools with raw command arguments:

- `/dwemr` -> `dwemr_command`

`/dwemr help` is answered directly by the plugin.

`/dwemr init` is handled directly by the plugin and installs the DWEMR bootstrap kit into the target project.

`/dwemr mode <auto|checkpointed>` is also handled directly by the plugin. It updates `.dwemr/project-config.yaml` for the active DWEMR project; CLI `auto` selects the canonical mode `autonomous`.

`/dwemr stop` is handled directly by the plugin. It stops the active OpenClaw-managed DWEMR runtime owner for the selected project and leaves the Claude-owned workflow state files untouched so work can resume from the last saved checkpoint.

`/dwemr what-now` maps to the internal Claude command `/delivery-what-now`, which is guidance-only. It reads authoritative DWEMR state first, uses memory only as optional narrative context, summarizes what happened most recently, and points the user to the safest next public `/dwemr` command. If onboarding is incomplete, DWEMR surfaces the saved onboarding clarification when one exists; otherwise it points the user back to a request-bearing onboarding command.

At runtime DWEMR executes one Claude entrypoint per routed command through the
selected runtime backend:

- ACP-native backend (`acp-native`): OpenClaw-managed ACP session + turn control
- legacy backend (`spawn`): direct ACPX command execution (compatibility path)

DWEMR does not emulate Claude’s internal agents. It maps the requested action to one Claude entrypoint and returns only the final assistant response on success.

## Install

```bash
openclaw plugins install dwemr
openclaw gateway restart
```

For local development:

```bash
openclaw plugins install -l ./plugins/dwemr
openclaw gateway restart
```

## Runtime behavior

DWEMR keeps `/dwemr` available even before setup is healthy.

DWEMR supports two execution backends:

- `acp-native` (default when available): OpenClaw-managed ACP sessions and turns
- `spawn` (legacy compatibility): DWEMR-managed ACPX shell execution

When ACP-native prerequisites are missing at runtime, DWEMR can still run through
the legacy spawn backend.

`acpx` is now primarily a compatibility/runtime-backend detail instead of the
only execution path.

Spawn compatibility bootstrap is intentionally limited to bundled OpenClaw ACPX
sources or an explicit `acpxPath` override.

ACP-native run model:

- each routed `/dwemr` command executes as a one-shot ACP run
- DWEMR continuity remains state-first via `.dwemr/state/*`, not by reusing one
  long-lived ACP session id

ACP-native runtime seam compatibility:

| Seam | Requirement | Behavior |
| --- | --- | --- |
| `api.runtime.tasks.flows` | Required | Primary ACP-native runtime orchestration/read seam. |
| `api.runtime.taskFlow` | Optional compatibility seam | Enables best-effort managed flow/task mutation ledger writes (`flowId`, `taskId`). Missing seam does not block command execution. |

If you explicitly force `runtimeBackend: "spawn"` and `/dwemr doctor --fix`
reports that no ACPX runtime was found, try:

```bash
openclaw plugins install acpx
openclaw gateway restart
```

Then rerun:

```text
/dwemr doctor --fix
```

If you manage ACPX separately for spawn compatibility, set
`plugins.entries.dwemr.config.acpxPath` to the executable path.

DWEMR also remembers multiple project paths in its own state storage while keeping exactly one active project at a time.

## Recommended workflow

1. Install or link the plugin.
2. Run `/dwemr help` or `/dwemr doctor <path>`.
3. If DWEMR reports missing runtime state or ACPX permission issues, run `/dwemr doctor <path> --fix`.
4. Make sure Claude Code is authenticated on the machine with `claude auth status`.
5. Run `/dwemr init <path>`.
6. Run `/dwemr start <request>` to complete onboarding and let DWEMR provision the selected workflow profile.
7. If onboarding returns one clarification batch, answer it with another `/dwemr start <response>` run.
8. Continue normal delivery with the same public `/dwemr` commands.

Freshly initialized bootstrap-only projects are not meant to continue through standalone Claude alone. If you run onboarding directly inside Claude and it selects a profile, return to `/dwemr continue` or another `/dwemr start` or `/dwemr plan` run so the DWEMR plugin runtime can provision the selected packs before downstream delivery commands continue.

If you are unsure what to do after onboarding has started, run `/dwemr what-now` to review the current guidance or any saved clarification batch. It does not begin first-pass onboarding by itself.

After `init`, DWEMR remembers that project and makes it the active project automatically without rewriting the live gateway config.

`/dwemr init` creates only the final project folder. Parent directories must already exist, which helps catch typos like `Documnets` before DWEMR creates the wrong tree.

Use `/dwemr projects` to list remembered projects and `/dwemr use <path>` to switch the active one.

Use `/dwemr mode checkpointed` when you want DWEMR to stop at major milestones and report before waiting for `/dwemr continue`. Use `/dwemr mode auto` when you want the canonical `autonomous` behavior: the bundled team keeps routing itself through planning, implementation, feature completion, and git/release progression until the run is done, blocked, approval-limited, or stopped by the current command's scope.

In `autonomous` mode, long-running DWEMR execution commands are allowed to keep running without the old delivery timeout. If you need to interrupt a run manually, use `/dwemr stop`.

## Doctor and self-heal

`/dwemr doctor [path]` reports:

- whether the selected runtime backend is ready
- ACP-native seam availability (`tasks.flows` required, `taskFlow` compatibility)
- whether ACPX host permission config matches DWEMR's ACP-native automation requirements
- legacy ACPX compatibility diagnostics when spawn compatibility is in use
- whether the target project exists
- whether the project is missing DWEMR assets, bootstrap-only, or fully profile-installed
- whether onboarding is pending, waiting on clarification, or complete
- whether the configured runtime can execute a DWEMR health-check prompt

`/dwemr doctor [path] --fix` now previews ACPX permission repair when ACP-native automation is blocked. It explains the root cause and prints exactly two follow-up commands:

- `/dwemr doctor [path] --fix --restart`
- `/dwemr doctor [path] --fix --no-restart`

`/dwemr doctor [path] --fix --restart` and `/dwemr doctor [path] --fix --no-restart` will try to:

- bootstrap or repair the configured runtime backend path
- reuse the bundled ACPX source shipped with OpenClaw when available
- repair `plugins.entries.acpx.config.permissionMode` to `approve-all`
- repair `plugins.entries.acpx.config.nonInteractivePermissions` to `fail`
- install missing DWEMR bootstrap assets without requiring a separate shell setup step
- finish profile provisioning only when onboarding has already selected a profile

For ACP-native runs, ACPX owns shell and file-write permissions. `.claude/settings.json` and Claude CLI bypass flags do not override ACPX harness policy. When doctor repairs ACPX permission config with `--restart`, it inspects `gateway.reload.mode` and tells you whether OpenClaw should apply the restart path automatically or whether a manual restart is still required.

## Verification checklist

After shipping or installing a new DWEMR build, verify these flows:

- missing runtime: `/dwemr help` still works before any bootstrap
- missing runtime: `/dwemr doctor <path>` reports the runtime as not ready
- ACPX preview: `/dwemr doctor <path> --fix` prints the two repair choices without mutating host ACPX permission config
- ACPX repair only: `/dwemr doctor <path> --fix --no-restart` repairs ACPX permission config and preserves unrelated OpenClaw config
- ACPX restart-aware repair: `/dwemr doctor <path> --fix --restart` explains whether OpenClaw should restart/apply automatically based on `gateway.reload.mode`
- self-heal: `/dwemr doctor <path> --fix --restart` or `--no-restart` creates a usable managed runtime when ACPX permission config was the blocker
- repaired runtime: `/dwemr doctor <path>` reports a ready execution runtime afterward
- repaired runtime: `/dwemr status` succeeds after self-heal
- bootstrap-only project: `/dwemr doctor <path>` reports onboarding as pending instead of corruption
- onboarding entry gating: `/dwemr continue` does not start first-pass onboarding on a brand-new bootstrap-only project
- execution mode control: `/dwemr mode checkpointed` updates the active project's `.dwemr/project-config.yaml`
- operator stop control: `/dwemr stop` cancels a long-running OpenClaw-managed DWEMR runtime owner and keeps the last saved workflow checkpoint
- pending clarification: `/dwemr what-now` repeats the saved clarification batch instead of starting a new interview
- clarification follow-up: `/dwemr start <response>` resumes onboarding with the saved request context
- missing project assets: `/dwemr doctor <path>` reports the project as missing DWEMR assets
- repaired project assets: `/dwemr init <path>` or `/dwemr doctor <path> --fix` installs the missing bootstrap assets
- onboarding flow: `/dwemr start <request>` can run onboarding, provision the selected profile, and continue the original command
- release gating: `/dwemr release` and `/dwemr pr` return an explicit unavailable message when git is not enabled for the project
- healthy Claude runtime: `/dwemr doctor <path>` confirms auth, session ensure, and a quiet prompt
- agent policy guardrail: doctor diagnoses `claude` ACP allowlist/default-agent policy issues without auto-editing `acp.allowedAgents` or `acp.defaultAgent`
- clean response surface: `/dwemr status` returns only the final assistant message on success

## Bundled workflow assets

The package is self-contained. `init` now installs a bootstrap pack instead of the full workflow. The bootstrap includes:

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

On the first request-bearing onboarding command, DWEMR selects a workflow profile. After onboarding completes, DWEMR provisions only the required profile packs:

- `profile-minimal-tool`
- `profile-standard-app`
- optional packs such as `standard-app-focused-planning`

Until that provisioning step happens, a bootstrap-only project is still pending profile installation. Standalone Claude should stop after onboarding and hand control back to `/dwemr` for provisioning rather than trying to route into managers whose packs are not installed yet.

If git is not enabled in `.dwemr/project-config.yaml`, `/dwemr release` and `/dwemr pr` stop with an explicit unavailable message instead of attempting to enter the release lane.

Quality is enforced through the active quality runbook, implementation guides, implementer verification, and the implementation-reviewer loop rather than a separate routed QA command.

`templates/CLAUDE.md` is the single shipped main-agent guide source. During `init`, DWEMR copies that file into the target project root as `CLAUDE.md`.

Do not remove `CLAUDE.md` from a DWEMR-managed project or casually replace it with repo-specific guidance. DWEMR installs that file during provisioning because it explains the agentic workflow, routing rules, and state model the main agent relies on to run the system correctly.

`.claude/` is reserved for Claude-native control files only. DWEMR-owned config, state, memory, reference material, and generated guides live under `.dwemr/`.

This runtime model is intentionally breaking for older initialized projects. Re-run `/dwemr init <path> --overwrite --confirm-overwrite` only when you intentionally want to destroy the existing target folder contents and recreate a brand-new DWEMR bootstrap install there.

## Shared config

The installed `.dwemr/project-config.yaml` is the shared control-plane file for project-level decisions, such as:

- onboarding-resolved project size
- execution/approval defaults
- whether git, GitHub, PR, CI, and merge capabilities are available

Bootstrap installs now seed unresolved onboarding-owned fields as `unset`. Onboarding must rewrite those to concrete values before normal delivery continues.

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

`project.size` in `.dwemr/project-config.yaml` is now the canonical source for provisioning/profile loading. `.dwemr/state/onboarding-state.md` still carries onboarding state and must keep `selected_profile` aligned with that interviewer decision.

## Optional plugin config

DWEMR can read a plugin config entry at `plugins.entries.dwemr`.

Supported key:

```json
{
  "runtimeBackend": "acp-native",
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

`runtimeBackend` optionally forces backend selection. Supported values are:

- `acp-native` (OpenClaw-managed ACP runtime path)
- `spawn` (legacy ACPX command path)

When `runtimeBackend` is unset, DWEMR auto-selects `acp-native` when runtime
prerequisites are available and otherwise falls back to `spawn`.

`acpAgent` optionally overrides the ACP harness agent id used by ACP-native runs.
If unset, DWEMR follows OpenClaw ACP defaults and ultimately falls back to
`claude`.

`acpBackend` optionally overrides the ACP backend id for ACP-native runs.

`acpxPath` is a deprecated compatibility override for forced `spawn` backend
usage. ACP-native execution ignores this key.

`managedRuntimeDir` is a deprecated compatibility override for forced `spawn`
backend usage. ACP-native execution ignores this key.

`model` optionally selects the Claude model for DWEMR runs. Claude Code supports aliases such as `sonnet`, `opus`, `haiku`, and `opusplan`, as well as full model names.

`subagentModel` optionally overrides the Claude model used for subagents. Use a full model name when possible.

`effortLevel` optionally overrides Claude effort for DWEMR runs. Supported Claude values include `low`, `medium`, `high`, `max`, and `auto`.

`activeProjectPath` is a legacy compatibility fallback for the currently selected project path.

`projects` is a legacy compatibility fallback for remembered project metadata.

When `activeProjectPath` or `defaultProjectPath` is set, `/dwemr init` and `/dwemr` may omit the path argument.

Current DWEMR builds persist remembered projects under the OpenClaw state directory instead of writing them into `openclaw.json` during normal command execution.

Runtime option notes:

- `model` is mapped in both `acp-native` and `spawn` backends.
- `cwd` is mapped in both `acp-native` and `spawn` backends.
- timeout behavior maps to ACP-native `timeoutSeconds`; `timeoutMs: null`
  keeps the ACP runtime timeout unset so autonomous runs remain unbounded.
- `subagentModel` and `effortLevel` are fully preserved in `spawn`; ACP-native
  mapping is backend-dependent and currently best-effort with caveats.

## Internal implementation surfaces

These remain internal implementation surfaces and are not the recommended public interface:

- plugin id `dwemr`
- tool `dwemr_init`

## Plugin layout

- `openclaw.plugin.json` - native OpenClaw manifest
- `package.json` - package metadata
- `index.ts` - plugin entry and deterministic command tools
- `skills/` - public OpenClaw slash commands
- `templates/` - bundled Claude workflow assets
