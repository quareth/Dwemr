# Delivery Workflow Engine & Memory Relay (DWEMR)

DWEMR is an OpenClaw plugin that installs and operates a Claude-native delivery workflow inside a target project.

It gives you a small public command surface through `/dwemr`, while the heavier workflow logic, state, and prompts live inside the project DWEMR provisions.

## Purpose

DWEMR is built to help you create prototype applications and tools in a structured way from the beginning.

The goal is not just to get something working once. DWEMR aims to leave you with a project that is functional, in good shape, and easier to extend and enhance later without getting stuck in endless refactor cycles.

In practice, DWEMR sits between OpenClaw and Claude Code:

- OpenClaw is the operator and command surface
- Claude Code is the delivery engine
- DWEMR keeps project-local workflow state under `.dwemr/`

## Requirements

- Node.js 22 or newer
- OpenClaw `2026.4.2` or newer
- OpenClaw's ACPX runtime available on the machine
- Claude Code installed and authenticated on the host machine

## Install

Install from the registry:

```bash
openclaw plugins install dwemr
openclaw gateway restart
```

For local development:

```bash
openclaw plugins install -l ./plugins/dwemr
openclaw gateway restart
```

You only need to configure `plugins.entries.dwemr.config` if you want optional overrides such as a default project path, model, or effort level.

## Quick Start

1. Initialize a project:

```text
/dwemr init /absolute/path/to/project
```

2. Start work from a request:

```text
/dwemr start Build me a simple calculator app
```

3. If DWEMR asks a clarification batch during onboarding, answer with another `start`:

```text
/dwemr start 1: personal calculator 2A 3A 4B
```

4. If you are unsure what to do next:

```text
/dwemr what-now
```

## Simple Usage

`/dwemr init <path>`

Initializes a DWEMR-managed project and installs the workflow bootstrap files into that folder. This is the setup step that gives the project its Claude commands, DWEMR state, and delivery structure.

`/dwemr start <prompt>`

Starts onboarding or delivery from a plain-language request. This is the main entry point when you want DWEMR to turn an idea into a structured working prototype.

`/dwemr continue`

Resumes the active project from its saved state. Use this when work was interrupted or when DWEMR has paused and you want it to keep going from the latest checkpoint.

`/dwemr projects`

Lists the DWEMR projects the plugin remembers. This is useful when you are working across multiple projects and want to see what is available before switching between them.

`/dwemr what-now`

Reads the current DWEMR state and tells you the safest next step. It is useful when you forgot where a run stopped or want guidance without starting a new action.

DWEMR can remember multiple projects, but only one project is active at a time. Use `/dwemr use <path>` to switch the active project.

## What `init` Installs

`/dwemr init` installs the DWEMR bootstrap kit into the target project, including:

- `CLAUDE.md`
- `.claude/` command and agent assets
- `.dwemr/` state, memory, reference, and config files

DWEMR keeps its runtime state in the project so it can resume work from checkpoints instead of depending on one live session.

## Safety And Cost Notes

DWEMR is meant for hands-off project automation, and that has tradeoffs:

- it installs a project-local `.claude/settings.json`
- Claude Code is configured for unattended work in that managed project
- ACPX host settings still control the actual shell and file-write harness permissions
- token usage can be high, especially in heavier workflows such as `standard_app`

If you want the leanest path, say so in the request:

```text
/dwemr start Build this as a minimal tool. Keep the workflow lightweight.
```

## Advanced Docs

The heavier reference material has been moved out of this README:

- [Advanced usage and reference](docs/advanced-usage.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Plan template](docs/PLAN_TEMPLATE.md)

The advanced reference covers:

- full command list and examples
- runtime behavior and implementation details
- plugin config and runtime overrides
- workflow architecture, assets, and internal implementation notes

For ACPX issues, `/dwemr doctor`, timeouts, permission problems, and runtime repair steps, use [docs/troubleshooting.md](docs/troubleshooting.md).

## Support

- Repository: [https://github.com/quareth/Dwemr](https://github.com/quareth/Dwemr)
- Issues: [https://github.com/quareth/Dwemr/issues](https://github.com/quareth/Dwemr/issues)
