# DWEMR Troubleshooting

Use this document when DWEMR is installed but runs are failing, the runtime is not healthy, or `/dwemr doctor` is asking for host-level fixes.

For the lightweight overview, install steps, and everyday commands, use [../README.md](../README.md).

## ACPX Troubleshooting

DWEMR ACP-native runs are more reliable with a larger ACPX host timeout budget.
Recommended starting point:

```bash
openclaw config set plugins.entries.acpx.config.timeoutSeconds 7200
openclaw gateway restart
```

Check the current value with:

```bash
openclaw config get plugins.entries.acpx.config.timeoutSeconds
```

Reference values in current OpenClaw installs:

- default: `120` seconds
- minimum: `1` second
- maximum: `86400` seconds

Many environments work without extra ACPX permission tuning, so `permissionMode` is still conditional troubleshooting rather than a universal requirement.

If you hit ACPX permission errors in non-interactive DWEMR runs:

```bash
openclaw config set plugins.entries.acpx.config.permissionMode approve-all
openclaw gateway restart
```

Useful checks:

```bash
openclaw config get plugins.entries.acpx.config.permissionMode
openclaw config get plugins.entries.acpx.config.timeoutSeconds
```

Why these settings help in some environments:

- `permissionMode=approve-all` lets ACPX execute shell, edit, and write actions without interactive approval prompts
- `timeoutSeconds=7200` gives long ACPX turns more host-level budget

These are ACPX host settings. Project-local `.claude/settings.json` does not replace them for ACP-native runs.

## Doctor And Self-Heal

`/dwemr doctor [path]` reports:

- whether the ACP-native runtime backend is ready
- ACP-native seam availability
- whether ACPX host timeout and permission config look healthy
- whether the target project exists
- whether the project is missing DWEMR assets, bootstrap-only, or fully profile-installed
- whether onboarding is pending, waiting on clarification, or complete
- whether the configured runtime can execute a DWEMR health-check prompt

`/dwemr doctor [path] --fix` previews ACPX host repair when ACP-native automation is blocked. It prints exactly two follow-up commands:

- `/dwemr doctor [path] --fix --restart`
- `/dwemr doctor [path] --fix --no-restart`

The repair flows can:

- bootstrap or repair the configured runtime backend path
- reuse the bundled ACPX source shipped with OpenClaw when available
- repair `plugins.entries.acpx.config.permissionMode` to `approve-all`
- repair `plugins.entries.acpx.config.nonInteractivePermissions` to `fail`
- install missing DWEMR bootstrap assets without a separate shell setup step
- finish profile provisioning only when onboarding has already selected a profile

Doctor also reports ACPX timeout guidance when it detects repeatable time-bound turn failures, but timeout changes remain host-level troubleshooting rather than an automatic `--fix` mutation.

## Verification Checklist

After shipping or installing a new DWEMR build, verify these flows:

- missing runtime: `/dwemr help` still works before any bootstrap
- missing runtime: `/dwemr doctor <path>` reports the runtime as not ready
- ACPX preview: `/dwemr doctor <path> --fix` prints the two repair choices without mutating host ACPX permission config
- ACPX repair only: `/dwemr doctor <path> --fix --no-restart` repairs ACPX permission config and preserves unrelated OpenClaw config
- ACPX restart-aware repair: `/dwemr doctor <path> --fix --restart` explains whether OpenClaw should restart automatically based on `gateway.reload.mode`
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
- agent policy guardrail: doctor diagnoses `claude` ACP allowlist or default-agent issues without auto-editing `acp.allowedAgents` or `acp.defaultAgent`
- clean response surface: `/dwemr status` returns only the final assistant message on success
