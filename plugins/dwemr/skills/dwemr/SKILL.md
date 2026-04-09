---
name: dwemr
description: Deterministically run one DWEMR action at a time via `/dwemr <action>` and let Claude Code handle the internal delivery workflow.
user-invocable: true
disable-model-invocation: true
command-dispatch: tool
command-tool: dwemr_command
command-arg-mode: raw
---

# DWEMR

This is the public OpenClaw runtime entrypoint for DWEMR.

Supported forms:

- `/dwemr help`
- `/dwemr doctor [path] [--fix]`
- `/dwemr init [path] [--overwrite] [--confirm-overwrite]`
- `/dwemr mode <auto|checkpointed>`
- `/dwemr projects`
- `/dwemr use <path>`
- `/dwemr model [number|unset]`
- `/dwemr subagents [number|unset]`
- `/dwemr effort [number|unset]`
- `/dwemr what-now [path if no active project]`
- `/dwemr status [path if no active project]`
- `/dwemr continue [path if no active project]`
- `/dwemr stop [path if no active project]`
- `/dwemr start [path if no active project] <request>`
- `/dwemr plan [path if no active project] <request>`
- `/dwemr implement [path if no active project]`
- `/dwemr release [path if no active project]` (requires git enabled)
- `/dwemr pr [path if no active project]` (requires git enabled)
- `/dwemr git disable`

Behavior:

- Dispatches directly to the plugin tool with raw command arguments.
- Handles `help` locally with a short explanation of each DWEMR command.
- Handles `doctor` locally, reports runtime and project health, and can self-heal with `--fix`.
- Handles `init` locally by installing the DWEMR bootstrap kit into the target project. `--overwrite` is destructive and requires `--confirm-overwrite`.
- Handles `mode` locally by updating `.dwemr/project-config.yaml` for the active project; `auto` is accepted on the CLI and selects the canonical mode `autonomous`.
- Handles `stop` locally by terminating the active OpenClaw-managed DWEMR process for the selected project without rewriting Claude-owned workflow state.
- Remembers initialized and explicitly selected projects in plugin config, with one active project at a time.
- After `init` or `use`, project-scoped commands run against the active project by default, so the path becomes optional.
- Maps the requested action to exactly one internal Claude `/delivery-*` command.
- Uses `start` and `plan` as the only first-pass onboarding entrypoints for bootstrap-only projects.
- While onboarding is incomplete, `continue` and `what-now` only surface saved clarification or guidance instead of starting a fresh onboarding pass.
- If onboarding returns a clarification batch, answer it through the next request-bearing DWEMR onboarding entrypoint in OpenClaw chat. In the normal public flow, use `/dwemr start <your answers>`. Do not answer with a plain chat reply. Example: `/dwemr start 1: I test WAF payload blocking 2B 3C 4A 5A`
- After onboarding completes, bootstrap-only `start`, `continue`, `plan`, and `what-now` can provision the selected profile pack before rerunning the original command.
- Refreshes `execution_mode` from project config into canonical pipeline state before `/dwemr start` and `/dwemr continue`.
- Treats `autonomous` as the full-team continuous mode within the current command scope, while `checkpointed` stops at milestone reports and waits for `/dwemr continue`.
- Removes the delivery timeout for long-running autonomous execution commands; `/dwemr stop` is the operator escape hatch when a run needs to be terminated manually.
- Standalone Claude sessions should stop when onboarding is complete but `install_stage` is not yet `profile_installed`; the user must return through `/dwemr` so the plugin runtime can provision the selected packs.
- Keeps `status` read-only before onboarding and blocks stage-isolated commands until onboarding is complete.
- Returns an explicit unavailable message when `release` or `pr` is requested for a project where git is not enabled.
- Uses a DWEMR-managed `acpx` runtime wrapper by default, with an optional advanced override path.
- Ensures a project-scoped Claude ACPX session named `dwemr` before each internal run.
- Runs exactly one local `acpx --cwd "<project>" --format quiet claude -s dwemr "<claude-command>"` call in the target project after preflight passes.
- Returns only the final Claude assistant message on success without emulating Claude's internal agents.
