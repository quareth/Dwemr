// index.ts
import path11 from "node:path";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// src/openclaw/cli/command-routing.ts
import path from "node:path";
function tokenizeRawArgs(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;
  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
function formatProjectScopedUsage(command, suffix, defaultProjectPath) {
  return `- /dwemr ${command}${defaultProjectPath ? "" : " [path]"}${suffix ? ` ${suffix}` : ""}`;
}
function formatProjectScopedHelp(command, suffix, description, defaultProjectPath) {
  return `- ${command}${defaultProjectPath ? "" : " [path]"}${suffix ? ` ${suffix}` : ""}: ${description}`;
}
function formatUsageForProject(defaultProjectPath) {
  return [
    "DWEMR commands:",
    "- /dwemr doctor [path] [--fix] [--restart|--no-restart]",
    "- /dwemr init [path] [--overwrite] [--confirm-overwrite]",
    "- /dwemr mode <auto|checkpointed>",
    "- /dwemr projects",
    "- /dwemr use <path>",
    "- /dwemr model [number|unset]",
    "- /dwemr subagents [number|unset]",
    "- /dwemr effort [number|unset]",
    formatProjectScopedUsage("status", "", defaultProjectPath),
    formatProjectScopedUsage("what-now", "", defaultProjectPath),
    formatProjectScopedUsage("continue", "", defaultProjectPath),
    formatProjectScopedUsage("stop", "", defaultProjectPath),
    formatProjectScopedUsage("start", "<request>", defaultProjectPath),
    formatProjectScopedUsage("plan", "<request>", defaultProjectPath),
    formatProjectScopedUsage("implement", "", defaultProjectPath),
    formatProjectScopedUsage("release", "(requires git enabled)", defaultProjectPath),
    formatProjectScopedUsage("pr", "(requires git enabled)", defaultProjectPath),
    "- /dwemr git disable"
  ].join("\n");
}
function formatHelpText(defaultProjectPath) {
  const lines = [
    "DWEMR commands:",
    "- doctor [path] [--fix] [--restart|--no-restart]: inspect the DWEMR runtime, preview ACPX permission repair, and optionally self-heal it",
    "- init [path] [--overwrite] [--confirm-overwrite]: install the DWEMR bootstrap kit; overwrite recreates the target folder from scratch",
    "- mode <auto|checkpointed>: set the execution mode for the active DWEMR project",
    "- sessions [clear]: list or clear only DWEMR-tracked ACP sessions; unrelated ACP/ACPX sessions are never touched",
    "- projects: list remembered DWEMR projects and show which one is active",
    "- help: list DWEMR commands and what each one does",
    "- use <path>: remember a project path and make it the active project",
    "- model [number|unset]: list or select the main Claude model for this project",
    "- subagents [number|unset]: list or select the subagent model for this project",
    "- effort [number|unset]: list or select the effort level for this project",
    formatProjectScopedHelp("what-now", "", "show state-aware guidance about the safest next DWEMR step", defaultProjectPath),
    formatProjectScopedHelp("status", "", "show the current delivery state without changing it", defaultProjectPath),
    formatProjectScopedHelp("continue", "", "resume the active delivery flow from saved state", defaultProjectPath),
    formatProjectScopedHelp("stop", "", "stop the active OpenClaw-managed DWEMR run for the project", defaultProjectPath),
    formatProjectScopedHelp("start", "<request>", "begin a new delivery request", defaultProjectPath),
    formatProjectScopedHelp("plan", "<request>", "create a plan without starting implementation", defaultProjectPath),
    formatProjectScopedHelp("implement", "", "continue only the implementation stage", defaultProjectPath),
    formatProjectScopedHelp("release", "", "continue the git release lane when git is enabled for the project", defaultProjectPath),
    formatProjectScopedHelp("pr", "", "continue the PR/merge lane when git is enabled for the project", defaultProjectPath),
    "- git disable: disable git for the active DWEMR project"
  ];
  if (defaultProjectPath) {
    lines.push("", `Active DWEMR project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}
function resolveProjectPath(inputPath, defaultProjectPath) {
  if (inputPath) {
    return path.resolve(inputPath);
  }
  return defaultProjectPath;
}
function buildInitHelp(defaultProjectPath) {
  const lines = [
    "Usage: /dwemr init <path> [--overwrite] [--confirm-overwrite]",
    "Example: /dwemr init /absolute/path/to/project",
    "Behavior: installs the DWEMR bootstrap kit; onboarding provisions the selected workflow profile later.",
    "Overwrite: `--overwrite` is destructive and recreates the target project folder from scratch. It requires `--confirm-overwrite`.",
    "Note: DWEMR creates only the final project folder. Parent directories must already exist."
  ];
  if (defaultProjectPath) {
    lines.push(`Configured default project path: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}
function buildModeHelp(defaultProjectPath) {
  const lines = [
    "Usage: /dwemr mode <auto|checkpointed>",
    "Example: /dwemr mode checkpointed",
    "Behavior: updates `.dwemr/project-config.yaml` for the active DWEMR project."
  ];
  if (defaultProjectPath) {
    lines.push(`Active DWEMR project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}
function buildRunnerHelp(defaultProjectPath) {
  const lines = [formatUsageForProject(defaultProjectPath), "", "Use `/dwemr help` for a short explanation of each command."];
  if (defaultProjectPath) {
    lines.push("", `Active DWEMR project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}
function looksLikeExplicitPath(token) {
  return token === "." || token === ".." || token.startsWith("/") || token.startsWith("./") || token.startsWith("../") || token.startsWith("~/") || /^[A-Za-z]:[\\/]/.test(token);
}
function buildUseHelp(defaultProjectPath) {
  const lines = [
    "Usage: /dwemr use <path>",
    "Example: /dwemr use /absolute/path/to/project"
  ];
  if (defaultProjectPath) {
    lines.push(`Current active project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}
function formatMissingActiveProjectError(action, defaultProjectPath) {
  if (defaultProjectPath) {
    return "Project path is required.\n" + buildRunnerHelp(defaultProjectPath);
  }
  return [
    `DWEMR cannot run \`${action}\` yet because there is no active project.`,
    "",
    "Run `/dwemr init <path>` first to initialize a project and make it active.",
    "If you already initialized a project earlier, run `/dwemr use <path>` to make it active again.",
    "",
    buildRunnerHelp(defaultProjectPath)
  ].join("\n");
}
function mapActionToClaudeCommand(action, targetPath, tokens, defaultProjectPath) {
  const separatorIndex = tokens.indexOf("--");
  const afterAction = tokens.slice(1);
  const commandMap = {
    status: "/delivery-status",
    "what-now": "/delivery-what-now",
    continue: "/delivery-continue",
    implement: "/delivery-implement",
    release: "/delivery-release",
    pr: "/delivery-pr"
  };
  if (action === "start" || action === "plan") {
    let explicitPath = targetPath;
    let requestTokens = [];
    if (separatorIndex >= 0) {
      const beforeSeparator2 = tokens.slice(1, separatorIndex);
      if (beforeSeparator2.length > 1) {
        return { error: "Too many positional arguments before `--`.\n" + buildRunnerHelp(defaultProjectPath) };
      }
      explicitPath = explicitPath ?? beforeSeparator2[0];
      requestTokens = tokens.slice(separatorIndex + 1);
    } else if (!explicitPath && afterAction.length > 1 && looksLikeExplicitPath(afterAction[0])) {
      explicitPath = afterAction[0];
      requestTokens = afterAction.slice(1);
    } else {
      requestTokens = afterAction;
    }
    const resolvedPath2 = resolveProjectPath(explicitPath, defaultProjectPath);
    if (!resolvedPath2) {
      return { error: formatMissingActiveProjectError(action, defaultProjectPath) };
    }
    const request = requestTokens.join(" ").trim();
    if (!request) {
      return { error: `A request is required for \`${action}\`.
` + buildRunnerHelp(defaultProjectPath) };
    }
    return {
      targetPath: resolvedPath2,
      claudeCommand: action === "start" ? `/delivery-start ${request}` : `/delivery-plan ${request}`,
      requestText: request
    };
  }
  const beforeSeparator = separatorIndex >= 0 ? tokens.slice(1, separatorIndex) : tokens.slice(1);
  const singlePath = beforeSeparator[0];
  if (beforeSeparator.length > 1) {
    return { error: "Too many positional arguments before `--`.\n" + buildRunnerHelp(defaultProjectPath) };
  }
  const resolvedPath = resolveProjectPath(targetPath ?? singlePath, defaultProjectPath);
  if (!resolvedPath) {
    return { error: formatMissingActiveProjectError(action, defaultProjectPath) };
  }
  const claudeCommand = commandMap[action];
  if (!claudeCommand) {
    return { error: `Unknown DWEMR action: ${action}
` + buildRunnerHelp(defaultProjectPath) };
  }
  return { targetPath: resolvedPath, claudeCommand };
}

// src/openclaw/cli/action-handler-types.ts
function textResult(text) {
  return {
    content: [{ type: "text", text }],
    details: {
      kind: "text",
      text
    }
  };
}

// src/openclaw/cli/action-handlers.ts
import path10 from "node:path";

// src/openclaw/backend/claude-output.ts
var deliveryToDwemrLiteralTranslations = [
  [/\/delivery-driver onboarding\b/g, "DWEMR onboarding"],
  [/\/delivery-driver\b/g, "DWEMR driver"],
  [/\/delivery-pr\b/g, "/dwemr pr"],
  [/\/delivery-what-now\b/g, "/dwemr what-now"],
  [/\/delivery-continue\b/g, "/dwemr continue"],
  [/\/delivery-implement\b/g, "/dwemr implement"],
  [/\/delivery-release\b/g, "/dwemr release"],
  [/\/delivery-status\b/g, "/dwemr status"]
];
function translateParameterizedDeliveryCommand(text, commandName, publicPrefix) {
  return text.replace(new RegExp(String.raw`/delivery-${commandName}(?:(\s+)([^\n\r` + "`" + String.raw`]+))?`, "g"), (_match, spacing, args) => {
    const trimmedArgs = args?.trim();
    if (!trimmedArgs) {
      return `${publicPrefix} <request>`;
    }
    return `${publicPrefix}${spacing ?? " "}${trimmedArgs}`;
  });
}
function translateClaudeCommandSurface(text) {
  let translated = translateParameterizedDeliveryCommand(text, "start", "/dwemr start");
  translated = translateParameterizedDeliveryCommand(translated, "plan", "/dwemr plan");
  for (const [pattern, replacement] of deliveryToDwemrLiteralTranslations) {
    translated = translated.replace(pattern, replacement);
  }
  return translated;
}
function formatRunnerResult(claudeCommand, exitCode, stdout, stderr, timedOut) {
  const publicCommand = translateClaudeCommandSurface(claudeCommand);
  if (exitCode === 0 && !timedOut && stdout) {
    return translateClaudeCommandSurface(stdout);
  }
  const lines = [`DWEMR failed to run \`${publicCommand}\` in Claude.`, `Exit code: \`${exitCode}\``];
  if (timedOut) {
    lines.push("The command timed out before Claude returned a final response.");
  }
  if (stdout) {
    lines.push(`Stdout:
${translateClaudeCommandSurface(stdout)}`);
  } else {
    lines.push("Stdout: (empty)");
  }
  if (stderr) {
    lines.push(`Stderr:
${translateClaudeCommandSurface(stderr)}`);
  }
  return lines.join("\n\n");
}

// src/control-plane/onboarding-state.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path2 from "node:path";

// src/control-plane/state-contract.ts
var DWEMR_CONTRACT_VERSION = 3;
var AUTHORITATIVE_STATE_RELATIVE_PATHS = [
  ".dwemr/state/onboarding-state.md",
  ".dwemr/state/pipeline-state.md",
  ".dwemr/state/execution-state.md",
  ".dwemr/state/implementation-state.md"
];
function extractFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return match?.[1] ?? "";
}
function parseDwemrContractVersion(raw) {
  const frontmatter = extractFrontmatter(raw);
  if (!frontmatter) {
    return void 0;
  }
  for (const line of frontmatter.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    if (key !== "dwemr_contract_version") {
      continue;
    }
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  return void 0;
}

// src/control-plane/onboarding-state.ts
var ONBOARDING_STATE_RELATIVE_PATH = path2.join(".dwemr", "state", "onboarding-state.md");
var ONBOARDING_STATE_DEFAULTS = {
  contractVersion: DWEMR_CONTRACT_VERSION,
  status: "pending",
  entryAction: "",
  requestContext: "",
  clarificationSummary: "",
  clarificationQuestions: [],
  clarificationResponse: "",
  selectedProfile: void 0,
  planningMode: "",
  docsMode: "",
  qaMode: "",
  needsProductFraming: false,
  selectedPacks: [],
  requiredArtifacts: [],
  installStage: "bootstrap_only",
  updatedAt: ""
};
function stripWrappingQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function parseInlineValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [];
    }
  }
  return stripWrappingQuotes(trimmed);
}
function hasSavedClarificationBatch(state) {
  return state.clarificationSummary.trim().length > 0 || state.clarificationQuestions.some((value) => value.trim().length > 0);
}
function normalizeOnboardingState(raw) {
  const normalizedProfile = raw?.selectedProfile === "minimal_tool" || raw?.selectedProfile === "standard_app" ? raw.selectedProfile : void 0;
  const clarificationQuestions = Array.isArray(raw?.clarificationQuestions) ? raw?.clarificationQuestions.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  const selectedPacks = Array.isArray(raw?.selectedPacks) ? raw?.selectedPacks.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  const requiredArtifacts = Array.isArray(raw?.requiredArtifacts) ? raw?.requiredArtifacts.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  const normalizedState = {
    contractVersion: raw?.contractVersion === DWEMR_CONTRACT_VERSION ? raw.contractVersion : ONBOARDING_STATE_DEFAULTS.contractVersion,
    status: ONBOARDING_STATE_DEFAULTS.status,
    entryAction: typeof raw?.entryAction === "string" ? raw.entryAction : ONBOARDING_STATE_DEFAULTS.entryAction,
    requestContext: typeof raw?.requestContext === "string" ? raw.requestContext : ONBOARDING_STATE_DEFAULTS.requestContext,
    clarificationSummary: typeof raw?.clarificationSummary === "string" ? raw.clarificationSummary : ONBOARDING_STATE_DEFAULTS.clarificationSummary,
    clarificationQuestions,
    clarificationResponse: typeof raw?.clarificationResponse === "string" ? raw.clarificationResponse : ONBOARDING_STATE_DEFAULTS.clarificationResponse,
    selectedProfile: normalizedProfile,
    planningMode: typeof raw?.planningMode === "string" ? raw.planningMode : ONBOARDING_STATE_DEFAULTS.planningMode,
    docsMode: typeof raw?.docsMode === "string" ? raw.docsMode : ONBOARDING_STATE_DEFAULTS.docsMode,
    qaMode: typeof raw?.qaMode === "string" ? raw.qaMode : ONBOARDING_STATE_DEFAULTS.qaMode,
    needsProductFraming: raw?.needsProductFraming === true,
    selectedPacks,
    requiredArtifacts,
    installStage: raw?.installStage === "profile_installed" ? "profile_installed" : ONBOARDING_STATE_DEFAULTS.installStage,
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : ONBOARDING_STATE_DEFAULTS.updatedAt
  };
  const persistedStatus = typeof raw?.status === "string" ? raw.status : ONBOARDING_STATE_DEFAULTS.status;
  if (normalizedState.selectedProfile || persistedStatus === "complete") {
    if (normalizedState.selectedProfile) {
      return {
        ...normalizedState,
        status: "complete",
        clarificationSummary: "",
        clarificationQuestions: [],
        clarificationResponse: "",
        installStage: normalizedState.installStage === "profile_installed" ? "profile_installed" : "provisioning_pending"
      };
    }
  }
  if (hasSavedClarificationBatch(normalizedState)) {
    return {
      ...normalizedState,
      status: "awaiting_clarification",
      planningMode: "",
      docsMode: "",
      qaMode: "",
      needsProductFraming: false,
      selectedPacks: [],
      requiredArtifacts: [],
      installStage: "bootstrap_only"
    };
  }
  return {
    ...normalizedState,
    status: "pending",
    clarificationSummary: "",
    clarificationQuestions: [],
    clarificationResponse: "",
    planningMode: "",
    docsMode: "",
    qaMode: "",
    needsProductFraming: false,
    selectedPacks: [],
    requiredArtifacts: [],
    installStage: "bootstrap_only"
  };
}
function parseOnboardingState(raw) {
  const frontmatter = extractFrontmatter(raw);
  if (!frontmatter) {
    return { ...ONBOARDING_STATE_DEFAULTS };
  }
  const parsed = {};
  for (const line of frontmatter.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = parseInlineValue(line.slice(separatorIndex + 1));
    switch (key) {
      case "status":
        parsed.status = String(value);
        break;
      case "dwemr_contract_version":
        parsed.contractVersion = Number.parseInt(String(value), 10);
        break;
      case "entry_action":
        parsed.entryAction = String(value);
        break;
      case "request_context":
        parsed.requestContext = String(value);
        break;
      case "clarification_summary":
        parsed.clarificationSummary = String(value);
        break;
      case "clarification_questions":
        parsed.clarificationQuestions = Array.isArray(value) ? value : [];
        break;
      case "clarification_response":
        parsed.clarificationResponse = String(value);
        break;
      case "selected_profile":
        parsed.selectedProfile = value;
        break;
      case "planning_mode":
        parsed.planningMode = String(value);
        break;
      case "docs_mode":
        parsed.docsMode = String(value);
        break;
      case "qa_mode":
        parsed.qaMode = String(value);
        break;
      case "needs_product_framing":
        parsed.needsProductFraming = value === true;
        break;
      case "selected_packs":
        parsed.selectedPacks = Array.isArray(value) ? value : [];
        break;
      case "required_artifacts":
        parsed.requiredArtifacts = Array.isArray(value) ? value : [];
        break;
      case "install_stage":
        parsed.installStage = value;
        break;
      case "updated_at":
        parsed.updatedAt = String(value);
        break;
      default:
        break;
    }
  }
  return normalizeOnboardingState(parsed);
}
function formatOnboardingState(state) {
  const normalized = normalizeOnboardingState(state);
  const bodyLines = ["# Onboarding state", ""];
  if (normalized.status === "complete") {
    bodyLines.push(`Selected profile: \`${normalized.selectedProfile ?? "none"}\`.`);
  } else if (normalized.status === "awaiting_clarification") {
    bodyLines.push("Onboarding is waiting on one clarification batch before profile selection can complete.");
    if (normalized.clarificationSummary) {
      bodyLines.push("", `Missing context: ${normalized.clarificationSummary}`);
    }
    if (normalized.clarificationQuestions.length > 0) {
      bodyLines.push("", "Clarification questions:");
      for (const question of normalized.clarificationQuestions) {
        bodyLines.push(`- ${question}`);
      }
    }
  } else if (normalized.requestContext) {
    bodyLines.push("Onboarding request context is recorded and ready for the next headless onboarding pass.");
  } else {
    bodyLines.push("Onboarding has not been completed yet.");
  }
  return [
    "---",
    `dwemr_contract_version: ${normalized.contractVersion}`,
    `status: ${JSON.stringify(normalized.status)}`,
    `entry_action: ${JSON.stringify(normalized.entryAction)}`,
    `request_context: ${JSON.stringify(normalized.requestContext)}`,
    `clarification_summary: ${JSON.stringify(normalized.clarificationSummary)}`,
    `clarification_questions: ${JSON.stringify(normalized.clarificationQuestions)}`,
    `clarification_response: ${JSON.stringify(normalized.clarificationResponse)}`,
    `selected_profile: ${normalized.selectedProfile ? JSON.stringify(normalized.selectedProfile) : '""'}`,
    `planning_mode: ${JSON.stringify(normalized.planningMode)}`,
    `docs_mode: ${JSON.stringify(normalized.docsMode)}`,
    `qa_mode: ${JSON.stringify(normalized.qaMode)}`,
    `needs_product_framing: ${normalized.needsProductFraming ? "true" : "false"}`,
    `selected_packs: ${JSON.stringify(normalized.selectedPacks)}`,
    `required_artifacts: ${JSON.stringify(normalized.requiredArtifacts)}`,
    `install_stage: ${JSON.stringify(normalized.installStage)}`,
    `updated_at: ${JSON.stringify(normalized.updatedAt)}`,
    "---",
    "",
    ...bodyLines,
    ""
  ].join("\n");
}
function resolveOnboardingStatePath(targetPath) {
  return path2.join(targetPath, ONBOARDING_STATE_RELATIVE_PATH);
}
async function readOnboardingState(targetPath) {
  try {
    const raw = await readFile(resolveOnboardingStatePath(targetPath), "utf8");
    return parseOnboardingState(raw);
  } catch {
    return { ...ONBOARDING_STATE_DEFAULTS };
  }
}
async function writeOnboardingState(targetPath, state) {
  const targetFilePath = resolveOnboardingStatePath(targetPath);
  await mkdir(path2.dirname(targetFilePath), { recursive: true });
  await writeFile(targetFilePath, formatOnboardingState(state), "utf8");
  return normalizeOnboardingState(state);
}

// src/control-plane/project-assets.ts
import { access, cp, mkdir as mkdir2, readFile as readFile3, readdir, rm, writeFile as writeFile3 } from "node:fs/promises";
import path5 from "node:path";

// install-packs.ts
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// src/control-plane/seed-data.ts
var bootstrapStateSeeds = {
  ".dwemr/state/pipeline-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: "none"
feature_title: "none"
feature_fingerprint: "none"
feature_status: "idle"
run_mode: "exclusive"
resume_token: ""
feature_request: ""
git_enabled: false
git_state: ""
git_mode: "disabled"
git_base_branch: "main"
git_feature_branch: ""
git_remote: "origin"
pr_number: ""
pr_head_sha: ""
pr_base_branch: "main"
pr_status: "not_applicable"
ci_status: "not_applicable"
merge_status: "not_applicable"
release_stage: "none"
release_lock: false
release_lock_reason: ""
release_owner_feature_id: ""
release_resume_required: false
approval_mode: "auto"
execution_mode: "autonomous"
current_owner: "none"
return_owner: "none"
stage_status: "idle"
current_step_kind: "none"
current_step_status: "none"
current_step_id: ""
active_wave_id: ""
active_wave_title: ""
active_wave_state_path: ""
wave_roadmap_path: ""
epic_doc_path: ""
completed_wave_ids: []
remaining_wave_outline: []
milestone_state: "none"
milestone_kind: "none"
milestone_owner: "none"
milestone_summary: ""
milestone_next_step: ""
milestone_updated_at: ""
status: "idle"
current_stage: "planning"
active_guide_path: ""
plan_path: ""
current_phase: ""
current_task: ""
next_agent: "none"
review_loop_count: 0
completed_tasks: []
last_handoff: ""
last_acknowledged_report_id: ""
last_acknowledged_report_owner: "none"
last_acknowledged_at: ""
blocked_reason: ""
updated_at: ""
---

Authoritative macro workflow state for managed delivery.

- The YAML frontmatter above is authoritative.
- Use this file for manager-owned routing, acknowledged stage/task state, blockers, milestones, release-lane truth, and the latest acknowledged worker report.
`,
  ".dwemr/state/execution-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
report_id: ""
supersedes_report_id: ""
feature_id: "none"
feature_fingerprint: "none"
scope_type: "none"
scope_ref: ""
report_owner: "none"
report_status: "idle"
stage: ""
guide: ""
phase: ""
task: ""
checkpoint_owner: "none"
checkpoint_kind: "none"
current_intent: ""
last_completed_step: ""
current_status: "idle"
pending_return_to: "none"
next_resume_owner: "none"
changed_files: []
verification_summary: ""
outcome_summary: ""
reviewer_verdict: ""
blocking_reason: ""
updated_at: ""
---

Authoritative live checkpoint file.

- The YAML frontmatter above is authoritative.
- Prefer \`report_id\`, \`report_owner\`, \`report_status\`, \`scope_type\`, and \`scope_ref\` when present.
- Keep legacy \`checkpoint_*\`, \`current_status\`, and \`next_resume_owner\` fields readable for compatibility during the transition.
- Every active agent should refresh this file on start and before any stop, pause, or handoff.
`,
  ".dwemr/state/implementation-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: "none"
guide: ""
phase: ""
task: ""
intent_summary: ""
ownership_checklist: []
active_worker: "none"
worker_status: "idle"
attempt_id: ""
changed_files: []
verification_commands: []
verification_summary: ""
reviewer_verdict: ""
review_findings_ref: ""
updated_at: ""
---

Authoritative implementation-lane local task packet and worker-loop detail.

- The YAML frontmatter above is authoritative.
- Keep this file structured and concise; do not use prose here for runtime truth.
- \`pipeline-state.md\` remains the manager-owned routing ledger and the place where task acceptance is acknowledged.
`,
  ".dwemr/state/onboarding-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
status: "pending"
entry_action: ""
request_context: ""
clarification_summary: ""
clarification_questions: []
clarification_response: ""
selected_profile: ""
planning_mode: ""
docs_mode: ""
qa_mode: ""
needs_product_framing: false
selected_packs: []
required_artifacts: []
install_stage: "bootstrap_only"
updated_at: ""
---

# Onboarding state

Onboarding has not been completed yet.
`
};
var standardAppStateSeeds = {
  ".dwemr/state/e2e-state.md": `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: "none"
guide: ""
phase: ""
task: ""
test_type: "none"
test_suite_path: ""
test_command: ""
last_run_result: "none"
last_run_summary: ""
tests_created: []
failures: []
env_blocker: ""
updated_at: ""
---

E2E testing traceability state.

- The YAML frontmatter above is authoritative.
- Updated by \`e2e-tester\` on every run.
- This file is for traceability only. It does not affect pipeline routing or execution state.
`
};
function createReleaseStateSeed(options = {}) {
  return `---
dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}
feature_id: ${JSON.stringify(options.featureId ?? "none")}
phase: ${JSON.stringify(options.phase ?? "")}
git_enabled: ${options.gitEnabled === true ? "true" : "false"}
git_mode: ${JSON.stringify(options.gitMode ?? "disabled")}
git_base_branch: ${JSON.stringify(options.gitBaseBranch ?? "main")}
git_feature_branch: ${JSON.stringify(options.gitFeatureBranch ?? "")}
git_remote: ${JSON.stringify(options.gitRemote ?? "origin")}
release_stage: ${JSON.stringify(options.releaseStage ?? "none")}
release_lock: ${options.releaseLock === true ? "true" : "false"}
release_owner_feature_id: ${JSON.stringify(options.releaseOwnerFeatureId ?? "")}
pr_number: ${JSON.stringify(options.prNumber ?? "")}
pr_status: ${JSON.stringify(options.prStatus ?? "not_applicable")}
ci_status: ${JSON.stringify(options.ciStatus ?? "not_applicable")}
merge_status: ${JSON.stringify(options.mergeStatus ?? "not_applicable")}
last_release_action: ${JSON.stringify(options.lastReleaseAction ?? "")}
last_release_summary: ${JSON.stringify(options.lastReleaseSummary ?? "")}
blocking_reason: ${JSON.stringify(options.blockingReason ?? "")}
updated_at: ${JSON.stringify(options.updatedAt ?? "")}
---

Release traceability state.

- The YAML frontmatter above is traceability-only.
- Updated by \`release-manager\` for git/release visibility.
- This file does not affect pipeline routing, execution checkpoints, or resume decisions.
`;
}
var bootstrapGlobalMemorySeeds = {
  ".dwemr/memory/global/decision-log.md": `# Decision log

Append notable product or technical decisions here when they affect delivery behavior.
`,
  ".dwemr/memory/global/last-implementation.md": `# Last implementation

Record the last accepted implementation handoff here when useful for resume context.

Narrative only. The active implementation task still comes from \`.dwemr/state/implementation-state.md\`.
`,
  ".dwemr/memory/global/user-profile.md": `# User profile

Durable onboarding snapshot for how DWEMR should collaborate with the user.

## Current

- Technical level:
- Preferred guidance depth:
- Tolerance for process/docs:
- Desired involvement level:
- Collaboration style:
- Last updated:
`
};

// install-packs.ts
var pluginRoot = path3.dirname(fileURLToPath(import.meta.url));
var pluginAssetRoot = path3.basename(pluginRoot) === "dist" ? path3.dirname(pluginRoot) : pluginRoot;
var templateRoot = path3.join(pluginAssetRoot, "templates");
var ACTIVE_QUALITY_RUNBOOK_PATH = "docs/runbooks/active-quality-runbook.md";
function templateAsset(relativePath) {
  return {
    type: "copy",
    sourcePath: path3.join(templateRoot, relativePath),
    targetPath: relativePath
  };
}
function templateAssetAs(sourceRelativePath, targetPath) {
  return {
    type: "copy",
    sourcePath: path3.join(templateRoot, sourceRelativePath),
    targetPath
  };
}
function pluginAsset(sourceRelativePath, targetPath) {
  return {
    type: "copy",
    sourcePath: path3.join(pluginAssetRoot, sourceRelativePath),
    targetPath
  };
}
function seedEntries(seedMap) {
  return Object.entries(seedMap).map(
    ([targetPath, content]) => ({
      type: "seed",
      targetPath,
      content
    })
  );
}
function requiredPaths(entries) {
  return entries.map((entry) => entry.targetPath);
}
function definePack(name, entries) {
  return {
    name,
    entries,
    requiredPaths: requiredPaths(entries)
  };
}
var commandAssets = [
  ".claude/commands/delivery-continue.md",
  ".claude/commands/delivery-driver.md",
  ".claude/commands/delivery-implement.md",
  ".claude/commands/delivery-plan.md",
  ".claude/commands/delivery-pr.md",
  ".claude/commands/delivery-release.md",
  ".claude/commands/delivery-start.md",
  ".claude/commands/delivery-status.md",
  ".claude/commands/delivery-what-now.md"
].map(templateAsset);
var bootstrapEntries = [
  templateAsset("CLAUDE.md"),
  templateAsset(".claude/settings.json"),
  templateAsset(".claude/agents/interviewer.md"),
  templateAsset(".claude/agents/prompt-enhancer.md"),
  templateAsset(".claude/agents/team-map.md"),
  templateAsset(".claude/agents/workflow.md"),
  ...commandAssets,
  templateAsset(".dwemr/guides/README.md"),
  templateAsset(".dwemr/memory/README.md"),
  templateAsset(".dwemr/project-config.yaml"),
  templateAsset(".dwemr/reference/delivery-driver.md"),
  templateAsset(".dwemr/reference/delivery-suite-reference.md"),
  templateAsset(".dwemr/reference/delivery-suite.md"),
  templateAsset(".dwemr/reference/subagent-registry.md"),
  templateAsset(".dwemr/reference/frontend-guidelines.md"),
  pluginAsset("docs/PLAN_TEMPLATE.md", ".dwemr/reference/PLAN_TEMPLATE.md"),
  templateAsset(".dwemr/state/implementation-state.example.md"),
  templateAsset(".dwemr/state/wave-state.example.md"),
  templateAsset(".dwemr/state/pipeline-policy.md"),
  templateAsset(".dwemr/runbooks/execution-mode-runbook.md"),
  ...seedEntries(bootstrapStateSeeds),
  ...seedEntries(bootstrapGlobalMemorySeeds)
];
var minimalToolEntries = [
  templateAsset(".claude/agents/delivery-manager.md"),
  templateAsset(".claude/agents/feature-implementer.md"),
  templateAsset(".claude/agents/implementation-fixer.md"),
  templateAsset(".claude/agents/implementation-guide-creator.md"),
  templateAsset(".claude/agents/implementation-manager.md"),
  templateAsset(".claude/agents/implementation-reviewer.md"),
  templateAsset(".claude/agents/orchestrator.md"),
  templateAsset(".claude/agents/planning-manager.md"),
  templateAsset(".claude/agents/release-manager.md")
];
var standardAppEntries = [
  templateAssetAs(".claude/agents/delivery-manager-standard-app.md", ".claude/agents/delivery-manager.md"),
  templateAssetAs(".claude/agents/planning-manager-standard-app.md", ".claude/agents/planning-manager.md"),
  templateAssetAs(".claude/agents/implementation-manager-standard-app.md", ".claude/agents/implementation-manager.md"),
  templateAssetAs(".claude/agents/product-manager-standard-app.md", ".claude/agents/product-manager.md"),
  templateAsset(".claude/agents/architect.md"),
  templateAsset(".claude/agents/epic.md"),
  templateAsset(".claude/agents/tech-spec.md"),
  templateAsset(".claude/agents/e2e-tester.md"),
  templateAsset(".claude/agents/wave-creator.md"),
  templateAsset(".claude/agents/wave-manager.md"),
  templateAsset(".claude/agents/wave-planner.md"),
  ...seedEntries(standardAppStateSeeds)
];
var standardAppFocusedPlanningEntries = [templateAsset(".claude/agents/architect.md")];
var PACK_REGISTRY = {
  bootstrap: definePack("bootstrap", bootstrapEntries),
  "profile-minimal-tool": definePack("profile-minimal-tool", minimalToolEntries),
  "profile-standard-app": definePack("profile-standard-app", standardAppEntries),
  "standard-app-focused-planning": definePack("standard-app-focused-planning", standardAppFocusedPlanningEntries)
};
function getPackDefinition(name) {
  return PACK_REGISTRY[name];
}
function getProfilePackChain(profile) {
  switch (profile) {
    case "minimal_tool":
      return ["profile-minimal-tool"];
    case "standard_app":
      return ["profile-minimal-tool", "profile-standard-app"];
  }
}
function normalizeSelectedPacks(selectedPacks, selectedProfile) {
  const normalized = /* @__PURE__ */ new Set();
  if (selectedProfile) {
    for (const packName of getProfilePackChain(selectedProfile)) {
      normalized.add(packName);
    }
  }
  for (const packName of selectedPacks ?? []) {
    if (packName in PACK_REGISTRY && packName !== "bootstrap") {
      normalized.add(packName);
    }
  }
  return [...normalized];
}
function getProfileQualityRunbookSourcePath(profile) {
  switch (profile) {
    case "minimal_tool":
      return ".dwemr/runbooks/simple-quality-runbook.md";
    case "standard_app":
      return ".dwemr/runbooks/quality-runbook.md";
  }
}
function getInstalledQualityRunbookPath() {
  return ACTIVE_QUALITY_RUNBOOK_PATH;
}
function getProfileQualityRunbookEntry(profile) {
  const sourceRelativePath = getProfileQualityRunbookSourcePath(profile);
  return {
    type: "copy",
    sourcePath: path3.join(templateRoot, sourceRelativePath),
    targetPath: ACTIVE_QUALITY_RUNBOOK_PATH
  };
}

// src/control-plane/project-config.ts
import { readFile as readFile2, writeFile as writeFile2 } from "node:fs/promises";
import path4 from "node:path";
var DEFAULT_EXECUTION_MODE = "autonomous";
var PROJECT_CONFIG_RELATIVE_PATH = path4.join(".dwemr", "project-config.yaml");
function splitLines(raw) {
  return raw.replace(/\r\n/g, "\n").split("\n");
}
function matchesYamlField(line, key) {
  const trimmed = line.trimStart();
  return trimmed.startsWith(`${key}:`) && line.length - trimmed.length === 2;
}
function extractYamlFieldValue(line, key) {
  if (!matchesYamlField(line, key)) return void 0;
  const raw = line.slice(line.indexOf(":") + 1).trim().replace(/^["']|["']$/g, "").replace(/#.*$/, "").trim();
  return raw || void 0;
}
function isTopLevelSection(line) {
  return /^[A-Za-z0-9_-]+:\s*$/.test(line.trim()) && !line.startsWith(" ");
}
function findTopLevelSection(lines, targetKey) {
  let start = -1;
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (!isTopLevelSection(lines[index])) {
      continue;
    }
    const key = lines[index].trim().slice(0, -1);
    if (key === targetKey) {
      start = index;
      continue;
    }
    if (start >= 0) {
      end = index;
      break;
    }
  }
  return { start, end };
}
function findDeliverySection(lines) {
  return findTopLevelSection(lines, "delivery");
}
function findProjectSection(lines) {
  return findTopLevelSection(lines, "project");
}
function normalizeExecutionModeInput(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  if (normalized === "auto" || normalized === "autonomous") {
    return "autonomous";
  }
  if (normalized === "checkpointed") {
    return "checkpointed";
  }
  return;
}
function normalizeProjectSizeInput(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "unset") {
    return;
  }
  if (normalized === "minimal_tool" || normalized === "standard_app") {
    return normalized;
  }
  return;
}
function parseProjectExecutionMode(raw) {
  const lines = splitLines(raw);
  const { start, end } = findDeliverySection(lines);
  if (start < 0) {
    return DEFAULT_EXECUTION_MODE;
  }
  for (let index = start + 1; index < end; index += 1) {
    const match = lines[index].match(/^\s{2}execution_mode:\s*["']?([A-Za-z_-]+)["']?\s*(?:#.*)?$/);
    if (!match) {
      continue;
    }
    return normalizeExecutionModeInput(match[1]) ?? DEFAULT_EXECUTION_MODE;
  }
  return DEFAULT_EXECUTION_MODE;
}
function parseProjectSize(raw) {
  const lines = splitLines(raw);
  const { start, end } = findProjectSection(lines);
  if (start < 0) {
    return;
  }
  for (let index = start + 1; index < end; index += 1) {
    const match = lines[index].match(/^\s{2}size:\s*["']?([A-Za-z0-9_-]+)["']?\s*(?:#.*)?$/);
    if (!match) {
      continue;
    }
    return normalizeProjectSizeInput(match[1]);
  }
  return;
}
function setProjectExecutionMode(raw, executionMode) {
  const lines = splitLines(raw);
  const { start, end } = findDeliverySection(lines);
  const newLine = `  execution_mode: ${executionMode}`;
  if (start < 0) {
    const prefix = lines.length > 0 && lines[lines.length - 1].trim().length > 0 ? [""] : [];
    return [...lines, ...prefix, "delivery:", newLine].join("\n");
  }
  for (let index = start + 1; index < end; index += 1) {
    if (/^\s{2}execution_mode:\s*/.test(lines[index])) {
      lines[index] = newLine;
      return lines.join("\n");
    }
  }
  let insertIndex = end;
  for (let index = start + 1; index < end; index += 1) {
    if (/^\s{2}(qa_level|approval_mode):\s*/.test(lines[index])) {
      insertIndex = index;
      break;
    }
  }
  lines.splice(insertIndex, 0, newLine);
  return lines.join("\n");
}
function setProjectSize(raw, projectSize) {
  const lines = splitLines(raw);
  const { start, end } = findProjectSection(lines);
  const newLine = `  size: ${projectSize}`;
  if (start < 0) {
    const prefix = lines.length > 0 && lines[lines.length - 1].trim().length > 0 ? [""] : [];
    return [...lines, ...prefix, "project:", newLine].join("\n");
  }
  for (let index = start + 1; index < end; index += 1) {
    if (/^\s{2}size:\s*/.test(lines[index])) {
      lines[index] = newLine;
      return lines.join("\n");
    }
  }
  lines.splice(start + 1, 0, newLine);
  return lines.join("\n");
}
function findModelsSection(lines) {
  return findTopLevelSection(lines, "models");
}
function parseProjectModelConfig(raw) {
  const lines = splitLines(raw);
  const { start, end } = findModelsSection(lines);
  if (start < 0) {
    return {};
  }
  const result = {};
  for (let index = start + 1; index < end; index += 1) {
    const mainMatch = lines[index].match(/^\s{2}main:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/);
    if (mainMatch) {
      result.model = mainMatch[1];
      continue;
    }
    const subMatch = lines[index].match(/^\s{2}subagents:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/);
    if (subMatch) {
      result.subagentModel = subMatch[1];
      continue;
    }
    const effortMatch = lines[index].match(/^\s{2}effort:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/);
    if (effortMatch) {
      result.effortLevel = effortMatch[1];
    }
  }
  return result;
}
function setModelsField(raw, key, value) {
  const lines = splitLines(raw);
  const { start, end } = findModelsSection(lines);
  for (let index = start + 1; index < end; index += 1) {
    if (matchesYamlField(lines[index], key)) {
      if (value === void 0) {
        lines.splice(index, 1);
      } else {
        lines[index] = `  ${key}: ${value}`;
      }
      return lines.join("\n");
    }
  }
  if (value === void 0) {
    return raw;
  }
  if (start < 0) {
    const prefix = lines.length > 0 && lines[lines.length - 1].trim().length > 0 ? [""] : [];
    return [...lines, ...prefix, "models:", `  ${key}: ${value}`].join("\n");
  }
  lines.splice(end, 0, `  ${key}: ${value}`);
  return lines.join("\n");
}
var SCM_DEFAULTS = {
  gitMode: "unset",
  github: "unset",
  remotePush: "unset",
  pullRequests: "unset",
  ci: "unset",
  merge: "unset"
};
var SCM_DISABLED = {
  gitMode: "disabled",
  github: "not_available",
  remotePush: "disabled",
  pullRequests: "disabled",
  ci: "disabled",
  merge: "disabled"
};
function findScmSection(lines) {
  return findTopLevelSection(lines, "scm");
}
function parseScmField(lines, start, end, key, fallback) {
  for (let index = start + 1; index < end; index += 1) {
    const value = extractYamlFieldValue(lines[index], key);
    if (value) return value;
  }
  return fallback;
}
function parseProjectScmConfig(raw) {
  const lines = splitLines(raw);
  const { start, end } = findScmSection(lines);
  if (start < 0) {
    return { ...SCM_DEFAULTS };
  }
  return {
    gitMode: parseScmField(lines, start, end, "git_mode", "unset"),
    github: parseScmField(lines, start, end, "github", "unset"),
    remotePush: parseScmField(lines, start, end, "remote_push", "unset"),
    pullRequests: parseScmField(lines, start, end, "pull_requests", "unset"),
    ci: parseScmField(lines, start, end, "ci", "unset"),
    merge: parseScmField(lines, start, end, "merge", "unset")
  };
}
function setScmField(raw, key, value) {
  const lines = splitLines(raw);
  const { start, end } = findScmSection(lines);
  for (let index = start + 1; index < end; index += 1) {
    if (matchesYamlField(lines[index], key)) {
      lines[index] = `  ${key}: ${value}`;
      return lines.join("\n");
    }
  }
  if (start < 0) {
    const prefix = lines.length > 0 && lines[lines.length - 1].trim().length > 0 ? [""] : [];
    return [...lines, ...prefix, "scm:", `  ${key}: ${value}`].join("\n");
  }
  lines.splice(end, 0, `  ${key}: ${value}`);
  return lines.join("\n");
}
function setAllScmFields(raw, config) {
  let result = raw;
  result = setScmField(result, "git_mode", config.gitMode);
  result = setScmField(result, "github", config.github);
  result = setScmField(result, "remote_push", config.remotePush);
  result = setScmField(result, "pull_requests", config.pullRequests);
  result = setScmField(result, "ci", config.ci);
  result = setScmField(result, "merge", config.merge);
  return result;
}
function resolveProjectConfigPath(targetPath) {
  return path4.join(targetPath, PROJECT_CONFIG_RELATIVE_PATH);
}
async function readProjectModelConfig(targetPath) {
  try {
    const raw = await readFile2(resolveProjectConfigPath(targetPath), "utf8");
    return parseProjectModelConfig(raw);
  } catch {
    return {};
  }
}
async function updateProjectModelField(targetPath, key, value) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile2(configPath, "utf8");
  const next = setModelsField(raw, key, value);
  await writeFile2(configPath, next, "utf8");
}
async function readProjectExecutionMode(targetPath) {
  const raw = await readFile2(resolveProjectConfigPath(targetPath), "utf8");
  return parseProjectExecutionMode(raw);
}
async function readProjectSize(targetPath) {
  const raw = await readFile2(resolveProjectConfigPath(targetPath), "utf8");
  return parseProjectSize(raw);
}
async function updateProjectExecutionMode(targetPath, executionMode) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile2(configPath, "utf8");
  const next = setProjectExecutionMode(raw, executionMode);
  await writeFile2(configPath, next, "utf8");
  return {
    configPath,
    executionMode
  };
}
async function updateProjectSize(targetPath, projectSize) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile2(configPath, "utf8");
  const next = setProjectSize(raw, projectSize);
  await writeFile2(configPath, next, "utf8");
  return {
    configPath,
    projectSize
  };
}
async function readProjectScmConfig(targetPath) {
  try {
    const raw = await readFile2(resolveProjectConfigPath(targetPath), "utf8");
    return parseProjectScmConfig(raw);
  } catch {
    return { ...SCM_DEFAULTS };
  }
}
function isGitEnabled(scmConfig) {
  return scmConfig.gitMode !== "unset" && scmConfig.gitMode !== "disabled";
}
async function disableProjectGit(targetPath) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile2(configPath, "utf8");
  const next = setAllScmFields(raw, SCM_DISABLED);
  await writeFile2(configPath, next, "utf8");
  return { configPath };
}

// src/control-plane/project-assets.ts
function formatOverwriteConfirmation(targetPath) {
  return [
    `DWEMR refused to run destructive overwrite init for \`${targetPath}\` without explicit confirmation.`,
    "",
    "Using `/dwemr init --overwrite` deletes the existing target project folder contents and recreates a brand-new DWEMR bootstrap install there.",
    "",
    "This removes the current DWEMR runtime state, memory, generated guides, and any other files already inside that target folder.",
    "",
    "If you really want that reset, rerun:",
    `- /dwemr init ${targetPath} --overwrite --confirm-overwrite`
  ].join("\n");
}
function getBootstrapRequiredPaths() {
  return getPackDefinition("bootstrap").requiredPaths;
}
function getBootstrapEntries() {
  return getPackDefinition("bootstrap").entries;
}
function resolveCanonicalProfile(onboardingState, configProjectSize) {
  return configProjectSize ?? onboardingState.selectedProfile;
}
function getExpectedPacks(onboardingState, configProjectSize) {
  const selectedPacks = onboardingState.status === "complete" ? normalizeSelectedPacks(onboardingState.selectedPacks, resolveCanonicalProfile(onboardingState, configProjectSize)) : [];
  const canonicalProfile = resolveCanonicalProfile(onboardingState, configProjectSize);
  const expectedPaths = [
    ...selectedPacks.flatMap((packName) => getPackDefinition(packName).requiredPaths),
    ...canonicalProfile ? [getInstalledQualityRunbookPath()] : []
  ];
  return {
    expectedPacks: ["bootstrap", ...selectedPacks],
    selectedPacks,
    expectedPaths
  };
}
async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
function editDistance(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from(
    { length: rows },
    (_, rowIndex) => Array.from({ length: cols }, (_2, colIndex) => rowIndex === 0 ? colIndex : colIndex === 0 ? rowIndex : 0)
  );
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost
      );
    }
  }
  return matrix[a.length][b.length];
}
async function listChildDirectories(parentPath) {
  try {
    const entries = await readdir(parentPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}
async function suggestSimilarPath(existingAncestor, requestedSegments, leafName) {
  const [firstMissingSegment, ...remainingSegments] = requestedSegments;
  if (!firstMissingSegment) {
    return void 0;
  }
  const siblingDirectories = await listChildDirectories(existingAncestor);
  let bestCandidate;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sibling of siblingDirectories) {
    const distance = editDistance(firstMissingSegment, sibling);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = sibling;
    }
  }
  if (!bestCandidate) {
    return void 0;
  }
  const maxAcceptedDistance = Math.max(2, Math.floor(firstMissingSegment.length * 0.25));
  if (bestDistance > maxAcceptedDistance) {
    return void 0;
  }
  return path5.join(existingAncestor, bestCandidate, ...remainingSegments, leafName);
}
async function validateInitTargetPath(targetPath) {
  const resolvedTargetPath = path5.resolve(targetPath);
  const parentPath = path5.dirname(resolvedTargetPath);
  if (await pathExists(parentPath)) {
    return { ok: true };
  }
  const missingSegments = [];
  let cursor = parentPath;
  while (!await pathExists(cursor)) {
    const baseName = path5.basename(cursor);
    if (!baseName || baseName === "." || baseName === path5.sep) {
      break;
    }
    missingSegments.unshift(baseName);
    const nextCursor = path5.dirname(cursor);
    if (nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }
  const leafName = path5.basename(resolvedTargetPath);
  const suggestion = await pathExists(cursor) ? await suggestSimilarPath(cursor, missingSegments, leafName) : void 0;
  const lines = [
    `DWEMR refused to initialize \`${resolvedTargetPath}\` because one or more parent directories do not exist.`,
    "",
    "DWEMR only auto-creates the final project folder. Parent directories must already exist so typos do not silently create the wrong tree."
  ];
  if (suggestion) {
    lines.push("", `Did you mean:
- ${suggestion}`);
  }
  lines.push("", "Create the parent directories first or rerun `/dwemr init` with the corrected path.");
  return {
    ok: false,
    error: lines.join("\n")
  };
}
async function installEntry(targetPath, entry, overwrite) {
  const destinationPath = path5.join(targetPath, entry.targetPath);
  await mkdir2(path5.dirname(destinationPath), { recursive: true });
  if (entry.type === "copy") {
    if (!await pathExists(entry.sourcePath)) {
      throw new Error(`Required source asset is missing: ${entry.sourcePath}`);
    }
    await cp(entry.sourcePath, destinationPath, {
      force: overwrite,
      errorOnExist: !overwrite
    });
    return entry.targetPath;
  }
  if (!overwrite && await pathExists(destinationPath)) {
    throw new Error(`Refusing to overwrite existing file without overwrite=true: ${destinationPath}`);
  }
  await writeFile3(destinationPath, entry.content, "utf8");
  return entry.targetPath;
}
async function installPack(targetPath, packName, overwrite) {
  const pack = getPackDefinition(packName);
  const installedTargets = [];
  for (const entry of pack.entries) {
    installedTargets.push(await installEntry(targetPath, entry, overwrite));
  }
  return installedTargets;
}
async function installMissingEntries(targetPath, entries) {
  const installedTargets = [];
  const skippedTargets = [];
  for (const entry of entries) {
    const destinationPath = path5.join(targetPath, entry.targetPath);
    if (await pathExists(destinationPath)) {
      skippedTargets.push(entry.targetPath);
      continue;
    }
    installedTargets.push(await installEntry(targetPath, entry, false));
  }
  return {
    installedTargets,
    skippedTargets
  };
}
async function ensureReleaseStateForGitEnabledProject(targetPath) {
  const scmConfig = await readProjectScmConfig(targetPath);
  if (!isGitEnabled(scmConfig)) {
    return false;
  }
  const releaseStatePath = path5.join(targetPath, ".dwemr/state/release-state.md");
  await mkdir2(path5.dirname(releaseStatePath), { recursive: true });
  await writeFile3(
    releaseStatePath,
    createReleaseStateSeed({
      gitEnabled: false,
      gitMode: scmConfig.gitMode,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }),
    "utf8"
  );
  return true;
}
async function inspectContractIssues(targetPath) {
  const issues = [];
  let pipelineStateRaw;
  for (const relativePath of AUTHORITATIVE_STATE_RELATIVE_PATHS) {
    const absolutePath = path5.join(targetPath, relativePath);
    try {
      const raw = await readFile3(absolutePath, "utf8");
      if (relativePath === ".dwemr/state/pipeline-state.md") {
        pipelineStateRaw = raw;
      }
      const detectedVersion = parseDwemrContractVersion(raw);
      if (detectedVersion !== DWEMR_CONTRACT_VERSION) {
        issues.push(
          detectedVersion === void 0 ? `${relativePath}: missing \`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}\`` : `${relativePath}: found contract version ${detectedVersion}, expected ${DWEMR_CONTRACT_VERSION}`
        );
      }
    } catch {
      issues.push(`${relativePath}: missing authoritative state file`);
    }
  }
  if (pipelineStateRaw) {
    const activeWaveStatePath = readFrontmatterStringField(pipelineStateRaw, "active_wave_state_path");
    if (activeWaveStatePath) {
      const absoluteWaveStatePath = path5.resolve(targetPath, activeWaveStatePath);
      try {
        const raw = await readFile3(absoluteWaveStatePath, "utf8");
        const detectedVersion = parseDwemrContractVersion(raw);
        if (detectedVersion !== DWEMR_CONTRACT_VERSION) {
          issues.push(
            detectedVersion === void 0 ? `${activeWaveStatePath}: missing \`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}\`` : `${activeWaveStatePath}: found contract version ${detectedVersion}, expected ${DWEMR_CONTRACT_VERSION}`
          );
        }
      } catch {
        issues.push(`${activeWaveStatePath}: missing authoritative active wave-state file`);
      }
    }
  }
  return issues;
}
function readFrontmatterStringField(raw, fieldName) {
  const frontmatter = extractFrontmatter(raw);
  if (!frontmatter) {
    return void 0;
  }
  for (const line of frontmatter.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    if (key !== fieldName) {
      continue;
    }
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    return value || void 0;
  }
  return void 0;
}
async function inspectProjectHealth(targetPath) {
  const exists = await pathExists(targetPath);
  if (!exists) {
    return {
      targetPath,
      exists: false,
      installState: "missing",
      onboardingState: await readOnboardingState(targetPath),
      expectedPacks: ["bootstrap"],
      missingFiles: [...getBootstrapRequiredPaths()],
      contractIssues: []
    };
  }
  const onboardingState = await readOnboardingState(targetPath);
  const bootstrapMissing = (await Promise.all(
    getBootstrapRequiredPaths().map(async (relativePath) => await pathExists(path5.join(targetPath, relativePath)) ? void 0 : relativePath)
  )).filter((value) => Boolean(value));
  if (bootstrapMissing.length > 0) {
    return {
      targetPath,
      exists: true,
      installState: "missing",
      onboardingState,
      expectedPacks: ["bootstrap"],
      missingFiles: bootstrapMissing,
      contractIssues: []
    };
  }
  const contractIssues = await inspectContractIssues(targetPath);
  const configProjectSize = await readProjectSize(targetPath).catch(() => void 0);
  const canonicalProfile = resolveCanonicalProfile(onboardingState, configProjectSize);
  const { expectedPacks, selectedPacks, expectedPaths } = getExpectedPacks(onboardingState, configProjectSize);
  const missingFiles = (await Promise.all(
    expectedPaths.map(async (relativePath) => await pathExists(path5.join(targetPath, relativePath)) ? void 0 : relativePath)
  )).filter((value) => Boolean(value));
  return {
    targetPath,
    exists: true,
    installState: contractIssues.length > 0 ? "unsupported_contract" : onboardingState.status === "complete" && onboardingState.installStage === "profile_installed" && missingFiles.length === 0 && selectedPacks.length > 0 ? "profile_installed" : "bootstrap_only",
    onboardingState,
    canonicalProfile,
    expectedPacks,
    missingFiles,
    contractIssues
  };
}
async function initializeProject(targetPath, overwrite) {
  if (overwrite && await pathExists(targetPath)) {
    await rm(targetPath, { recursive: true, force: true });
  }
  await mkdir2(path5.dirname(targetPath), { recursive: true });
  await mkdir2(targetPath, { recursive: true });
  const installed = await installPack(targetPath, "bootstrap", overwrite);
  return [
    overwrite ? `Reinstalled DWEMR assets in ${targetPath}.` : `Initialized DWEMR bootstrap assets in ${targetPath}.`,
    "",
    "Installed bootstrap pack:",
    "- bootstrap",
    "",
    "Created files:",
    ...installed.map((item) => `- ${item}`),
    "",
    "Next steps:",
    "- Make sure Claude Code is authenticated on this machine (`claude auth status`).",
    "- Start onboarding with `/dwemr start <request>` or `/dwemr plan <request>`.",
    "- Use `/dwemr continue` or `/dwemr what-now` later to review any saved onboarding clarification or resume after profile selection."
  ].join("\n");
}
async function repairBootstrapAssets(targetPath) {
  await mkdir2(targetPath, { recursive: true });
  const result = await installMissingEntries(targetPath, getBootstrapEntries());
  return {
    repairedPack: "bootstrap",
    installedTargets: result.installedTargets,
    skippedTargets: result.skippedTargets
  };
}
async function provisionProjectProfile(targetPath, onboardingState) {
  const configProjectSize = await readProjectSize(targetPath).catch(() => void 0);
  const canonicalProfile = resolveCanonicalProfile(onboardingState, configProjectSize);
  if (!canonicalProfile) {
    throw new Error("Onboarding completed without any canonical project size or selected profile.");
  }
  const selectedPacks = normalizeSelectedPacks(onboardingState.selectedPacks, canonicalProfile);
  if (selectedPacks.length === 0) {
    throw new Error("Onboarding completed without any provisionable profile packs.");
  }
  const installedTargets = /* @__PURE__ */ new Set();
  for (const packName of selectedPacks) {
    for (const installedPath of await installPack(targetPath, packName, true)) {
      installedTargets.add(installedPath);
    }
  }
  const qualityRunbookEntry = getProfileQualityRunbookEntry(canonicalProfile);
  installedTargets.add(await installEntry(targetPath, qualityRunbookEntry, true));
  if (await ensureReleaseStateForGitEnabledProject(targetPath)) {
    installedTargets.add(".dwemr/state/release-state.md");
  }
  const normalizedState = {
    ...onboardingState,
    selectedProfile: canonicalProfile,
    selectedPacks,
    installStage: "profile_installed",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (!configProjectSize) {
    await updateProjectSize(targetPath, canonicalProfile);
  }
  await writeOnboardingState(targetPath, normalizedState);
  return {
    packNames: selectedPacks,
    installedTargets: [...installedTargets].sort(),
    onboardingState: normalizedState
  };
}

// src/control-plane/pipeline-state.ts
import { readFile as readFile4, writeFile as writeFile4 } from "node:fs/promises";
import path6 from "node:path";
var PIPELINE_STATE_RELATIVE_PATH = path6.join(".dwemr", "state", "pipeline-state.md");
function resolvePipelineStatePath(targetPath) {
  return path6.join(targetPath, PIPELINE_STATE_RELATIVE_PATH);
}
function parseFrontmatterField(lines, key) {
  for (const line of lines) {
    const match = line.match(new RegExp(`^${key}:\\s*["']?([^"'\\n#]+?)["']?\\s*$`));
    if (match) {
      const value = match[1].trim();
      return value === "" || value === '""' || value === "''" ? void 0 : value;
    }
  }
  return void 0;
}
async function readPipelineStateBrief(targetPath) {
  try {
    const raw = await readFile4(resolvePipelineStatePath(targetPath), "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      return null;
    }
    const lines = fmMatch[1].split("\n");
    return {
      featureTitle: parseFrontmatterField(lines, "feature_title"),
      featureStatus: parseFrontmatterField(lines, "feature_status"),
      stageStatus: parseFrontmatterField(lines, "stage_status"),
      currentOwner: parseFrontmatterField(lines, "current_owner"),
      nextAgent: parseFrontmatterField(lines, "next_agent"),
      activeWaveTitle: parseFrontmatterField(lines, "active_wave_title"),
      currentPhase: parseFrontmatterField(lines, "current_phase"),
      currentTask: parseFrontmatterField(lines, "current_task"),
      currentStepStatus: parseFrontmatterField(lines, "current_step_status"),
      milestoneState: parseFrontmatterField(lines, "milestone_state"),
      milestoneKind: parseFrontmatterField(lines, "milestone_kind"),
      milestoneSummary: parseFrontmatterField(lines, "milestone_summary"),
      executionMode: parseFrontmatterField(lines, "execution_mode"),
      updatedAt: parseFrontmatterField(lines, "updated_at")
    };
  } catch {
    return null;
  }
}
function formatPipelineStateBrief(brief, activeRunInfo) {
  const lines = ["\u2500\u2500 DWEMR Pipeline Snapshot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"];
  if (activeRunInfo) {
    lines.push(`Runtime : ${activeRunInfo}`);
  }
  if (brief.featureTitle) {
    lines.push(`Feature : ${brief.featureTitle}${brief.featureStatus ? ` [${brief.featureStatus}]` : ""}`);
  }
  if (brief.activeWaveTitle) {
    lines.push(`Wave    : ${brief.activeWaveTitle}`);
  }
  if (brief.stageStatus) {
    lines.push(`Stage   : ${brief.stageStatus}${brief.nextAgent ? ` \u2192 next: ${brief.nextAgent}` : ""}`);
  }
  if (brief.currentPhase) {
    lines.push(`Phase   : ${brief.currentPhase}`);
  }
  if (brief.currentTask) {
    lines.push(`Task    : ${brief.currentTask}${brief.currentStepStatus ? ` [${brief.currentStepStatus}]` : ""}`);
  }
  if (brief.milestoneState && brief.milestoneState !== "none") {
    const ms = brief.milestoneKind && brief.milestoneKind !== "none" ? `${brief.milestoneState} (${brief.milestoneKind})` : brief.milestoneState;
    lines.push(`Milestone: ${ms}${brief.milestoneSummary ? ` \u2014 ${brief.milestoneSummary}` : ""}`);
  }
  if (brief.executionMode) {
    lines.push(`Mode    : ${brief.executionMode}`);
  }
  if (brief.updatedAt) {
    lines.push(`Updated : ${brief.updatedAt}`);
  }
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  return lines.join("\n");
}
async function syncPipelineExecutionMode(targetPath, executionMode) {
  const pipelineStatePath = resolvePipelineStatePath(targetPath);
  const raw = await readFile4(pipelineStatePath, "utf8");
  const updated = /^\s*execution_mode:\s*/m.test(raw) ? raw.replace(/^\s*execution_mode:\s*.*$/m, `execution_mode: "${executionMode}"`) : raw.replace(/^approval_mode:\s*.*$/m, (line) => `${line}
execution_mode: "${executionMode}"`);
  if (updated !== raw) {
    await writeFile4(pipelineStatePath, updated, "utf8");
  }
  return {
    pipelineStatePath,
    executionMode
  };
}

// src/openclaw/backend/acp-native/acp-config.ts
var ACP_NATIVE_BACKEND_KIND = "acp-native";
var ACP_DEFAULT_AGENT = "claude";
function asRuntimeApi(api) {
  if (!api || typeof api !== "object") {
    return;
  }
  const candidate = api;
  if (!candidate.runtime || typeof candidate.runtime !== "object") {
    return;
  }
  return candidate;
}
function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function normalizeAcpAgentId(agent) {
  const candidate = (agent ?? ACP_DEFAULT_AGENT).trim().toLowerCase();
  const normalized = candidate.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return normalized || ACP_DEFAULT_AGENT;
}
function resolveOpenClawConfig(runtimeApi) {
  const candidate = runtimeApi?.config;
  if (!candidate || typeof candidate !== "object") {
    return void 0;
  }
  return candidate;
}
function resolveAcpConfig(runtimeApi) {
  const config = resolveOpenClawConfig(runtimeApi);
  if (!config) {
    return;
  }
  const candidate = config.acp;
  if (!candidate || typeof candidate !== "object") {
    return;
  }
  return candidate;
}
function resolveAcpBackendId(runtimeApi, runtimeConfig) {
  return normalizeOptionalString(runtimeConfig?.acpBackend) ?? normalizeOptionalString(resolveAcpConfig(runtimeApi)?.backend);
}
function resolveAcpAgentId(runtimeApi, runtimeConfig) {
  return normalizeAcpAgentId(
    normalizeOptionalString(runtimeConfig?.acpAgent) ?? ACP_DEFAULT_AGENT
  );
}
function resolveRuntimeTasksFlows(runtimeApi) {
  return runtimeApi?.runtime?.tasks?.flows;
}
function resolveLegacyTaskFlow(runtimeApi) {
  return runtimeApi?.runtime?.taskFlow;
}
function buildAcpRuntimeSummary(runtimeApi, runtimeConfig) {
  return {
    backendId: resolveAcpBackendId(runtimeApi, runtimeConfig),
    defaultAgent: resolveAcpAgentId(runtimeApi, runtimeConfig),
    flowViewsAvailable: Boolean(resolveRuntimeTasksFlows(runtimeApi)),
    taskFlowLegacyAvailable: Boolean(resolveLegacyTaskFlow(runtimeApi))
  };
}
function collectAcpRuntimeOptionCaveatNotes(runtimeConfig) {
  const notes = [];
  if (runtimeConfig?.subagentModel?.trim()) {
    notes.push("ACP-native runtime does not guarantee a direct mapping for `subagentModel`; the configured value is currently best-effort.");
  }
  if (runtimeConfig?.effortLevel?.trim()) {
    notes.push("ACP-native runtime does not guarantee a direct mapping for `effortLevel`; the configured value is currently best-effort.");
  }
  return notes;
}
function buildAcpRuntimeOptionPatch(targetPath, runtimeConfig) {
  return {
    model: runtimeConfig?.model?.trim() || void 0,
    cwd: targetPath
  };
}
function resolveOwnerSessionKey(context, fallbackSessionKey) {
  return normalizeOptionalString(context?.toolContext?.sessionKey) ?? fallbackSessionKey;
}

// src/openclaw/backend/acp-native/acp-native-backend.ts
import { randomUUID } from "node:crypto";

// src/openclaw/state/active-runs.ts
import { execFile } from "node:child_process";
import { mkdir as mkdir3, readFile as readFile5, writeFile as writeFile5 } from "node:fs/promises";
import path7 from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var ACTIVE_RUNS_RELATIVE_PATH = path7.join("tools", "dwemr", "active-runs.json");
var STOP_GRACE_PERIOD_MS = 3e3;
var STOP_POLL_INTERVAL_MS = 200;
function resolveProjectPath2(projectPath) {
  return path7.resolve(projectPath);
}
function normalizeRunIdentity(raw) {
  if (typeof raw !== "object" || raw === null) {
    return;
  }
  const candidate = raw;
  if (typeof candidate.backendKind !== "string" || candidate.backendKind.trim().length === 0) {
    return;
  }
  if (typeof candidate.runId !== "string" || candidate.runId.trim().length === 0) {
    return;
  }
  return {
    backendKind: candidate.backendKind.trim(),
    runId: candidate.runId.trim(),
    flowId: typeof candidate.flowId === "string" && candidate.flowId.trim().length > 0 ? candidate.flowId.trim() : void 0,
    taskId: typeof candidate.taskId === "string" && candidate.taskId.trim().length > 0 ? candidate.taskId.trim() : void 0,
    childSessionKey: typeof candidate.childSessionKey === "string" && candidate.childSessionKey.trim().length > 0 ? candidate.childSessionKey.trim() : void 0,
    ownerSessionKey: typeof candidate.ownerSessionKey === "string" && candidate.ownerSessionKey.trim().length > 0 ? candidate.ownerSessionKey.trim() : void 0,
    pid: typeof candidate.pid === "number" && Number.isInteger(candidate.pid) && candidate.pid > 0 ? candidate.pid : void 0
  };
}
function parseOptionalPid(raw) {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    return void 0;
  }
  return raw;
}
function normalizeActiveRun(raw) {
  if (typeof raw.projectPath !== "string" || raw.projectPath.trim().length === 0) {
    return;
  }
  if (typeof raw.startedAt !== "string" || raw.startedAt.trim().length === 0) {
    return;
  }
  if (typeof raw.action !== "string" || raw.action.trim().length === 0) {
    return;
  }
  const parsedPid = parseOptionalPid(raw.pid);
  const normalizedIdentity = normalizeRunIdentity(raw.identity);
  if (!normalizedIdentity) {
    return;
  }
  const effectivePid = parsedPid ?? normalizedIdentity.pid;
  const identityWithPid = effectivePid && !normalizedIdentity.pid ? { ...normalizedIdentity, pid: effectivePid } : normalizedIdentity;
  return {
    projectPath: resolveProjectPath2(raw.projectPath),
    startedAt: raw.startedAt,
    action: raw.action.trim(),
    executionMode: raw.executionMode === "autonomous" || raw.executionMode === "checkpointed" ? raw.executionMode : void 0,
    identity: identityWithPid,
    pid: effectivePid,
    claudeCommand: typeof raw.claudeCommand === "string" && raw.claudeCommand.trim().length > 0 ? raw.claudeCommand.trim() : void 0,
    sessionName: typeof raw.sessionName === "string" && raw.sessionName.trim().length > 0 ? raw.sessionName.trim() : void 0
  };
}
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const execError = error;
    return execError.code === "EPERM";
  }
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await sleep(STOP_POLL_INTERVAL_MS);
  }
  return !isProcessRunning(pid);
}
async function readActiveRunsRaw(stateDir) {
  try {
    const raw = await readFile5(resolveActiveRunsPath(stateDir), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}
async function writeActiveRuns(stateDir, runs) {
  const targetPath = resolveActiveRunsPath(stateDir);
  await mkdir3(path7.dirname(targetPath), { recursive: true });
  await writeFile5(targetPath, `${JSON.stringify({ runs }, null, 2)}
`, "utf8");
}
function isActiveRun(run) {
  const pid = run.pid ?? run.identity.pid;
  if (typeof pid !== "number") {
    return true;
  }
  return isProcessRunning(pid);
}
function resolveActiveRunsPath(stateDir) {
  return path7.join(stateDir, ACTIVE_RUNS_RELATIVE_PATH);
}
async function loadActiveRuns(stateDir, options = {}) {
  const normalized = (await readActiveRunsRaw(stateDir)).map((run) => normalizeActiveRun(run)).filter((run) => Boolean(run));
  const pruneStale = options.pruneStale ?? true;
  const baseRuns = pruneStale ? normalized.filter(isActiveRun) : normalized;
  if (pruneStale && baseRuns.length !== normalized.length) {
    await writeActiveRuns(stateDir, baseRuns);
  }
  if (!options.backendKind) {
    return baseRuns;
  }
  return baseRuns.filter((run) => run.identity.backendKind === options.backendKind);
}
async function registerActiveRun(stateDir, run) {
  const normalized = normalizeActiveRun(run);
  if (!normalized) {
    return;
  }
  const existing = await loadActiveRuns(stateDir);
  const next = [
    ...existing.filter((entry) => entry.projectPath !== normalized.projectPath && entry.identity.runId !== normalized.identity.runId),
    normalized
  ].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  await writeActiveRuns(stateDir, next);
}
async function clearActiveRun(stateDir, projectPath, options = {}) {
  const normalizedProjectPath = resolveProjectPath2(projectPath);
  const existing = await loadActiveRuns(stateDir, { pruneStale: false });
  const next = existing.filter((entry) => {
    if (entry.projectPath !== normalizedProjectPath) {
      return true;
    }
    if (options.backendKind && entry.identity.backendKind !== options.backendKind) {
      return true;
    }
    if (options.runId && entry.identity.runId !== options.runId) {
      return true;
    }
    if (options.pid !== void 0) {
      const entryPid = entry.pid ?? entry.identity.pid;
      if (entryPid !== options.pid) {
        return true;
      }
    }
    if (options.pid === void 0 && !options.runId && !options.backendKind) {
      return false;
    }
    return false;
  });
  await writeActiveRuns(stateDir, next);
}
async function findActiveRun(stateDir, projectPath, options = {}) {
  const normalizedProjectPath = resolveProjectPath2(projectPath);
  const runs = await loadActiveRuns(stateDir, { backendKind: options.backendKind });
  return runs.find((run) => run.projectPath === normalizedProjectPath);
}
async function killProcessWithEscalation(pid) {
  if (!isProcessRunning(pid)) {
    return { status: "already_exited" };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    const execError = error;
    if (execError.code === "ESRCH") {
      return { status: "already_exited" };
    }
    return { status: "failed", error: String(error) };
  }
  if (await waitForProcessExit(pid, STOP_GRACE_PERIOD_MS)) {
    return { status: "killed", signal: "SIGTERM" };
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    const execError = error;
    if (execError.code === "ESRCH") {
      return { status: "killed", signal: "SIGTERM" };
    }
    return { status: "failed", error: String(error) };
  }
  if (await waitForProcessExit(pid, STOP_GRACE_PERIOD_MS)) {
    return { status: "killed", signal: "SIGKILL" };
  }
  return { status: "failed", error: `Process ${pid} did not exit after SIGTERM and SIGKILL.` };
}
async function snapshotChildPids(filter) {
  if (process.platform === "win32") {
    return [];
  }
  try {
    const { stdout } = await execFileAsync("pgrep", ["-f", filter]);
    return stdout.trim().split("\n").map(Number).filter((pid) => pid > 0 && Number.isInteger(pid));
  } catch {
    return [];
  }
}
async function resolveCwdForPid(pid) {
  if (process.platform === "win32") {
    return void 0;
  }
  try {
    const { stdout } = await execFileAsync("lsof", ["-a", "-d", "cwd", "-p", String(pid), "-Fn"]);
    for (const line of stdout.split("\n")) {
      if (line.startsWith("n/")) {
        return line.slice(1);
      }
    }
    return void 0;
  } catch {
    return void 0;
  }
}

// src/openclaw/backend/acp-native/acp-keys.ts
import { createHash } from "node:crypto";
function buildAcpSessionKey(params) {
  const baseKey = buildBaseScopeKey(params.targetPath, params.agentId, params.runtimeConfig);
  switch (params.scope.kind) {
    case "scope":
      return baseKey;
    case "command": {
      const runSuffix = createHash("sha256").update(`${params.scope.requestId}:${params.targetPath}`).digest("hex").slice(0, 8);
      return `${baseKey}:run-${runSuffix}`;
    }
    case "doctor":
      return `${baseKey}-doctor`;
  }
}
function buildBaseScopeKey(targetPath, agentId, runtimeConfig) {
  const suffixSource = [
    targetPath,
    runtimeConfig?.model?.trim(),
    runtimeConfig?.subagentModel?.trim(),
    runtimeConfig?.effortLevel?.trim()
  ].filter(Boolean).join("|");
  const hash = createHash("sha256").update(suffixSource || targetPath).digest("hex").slice(0, 12);
  return `agent:${normalizeAcpAgentId(agentId)}:acp:dwemr-${hash}`;
}

// src/openclaw/backend/acp-native/acp-output.ts
import { isAcpRuntimeError } from "openclaw/plugin-sdk/acp-runtime";
function collectAcpRuntimeOutput(events) {
  let lastToolCallIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "tool_call") {
      lastToolCallIndex = i;
      break;
    }
  }
  let output = "";
  for (let i = lastToolCallIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.type === "text_delta" && event.stream !== "thought" && event.text) {
      output += event.text;
    }
  }
  return output.trim();
}
function formatAcpLifecycleError(error) {
  return isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
}

// src/openclaw/backend/acp-native/acp-flow-tracking.ts
var NOOP_FLOW_TRACKING = { async finish() {
} };
function createAcpFlowTracking(params) {
  const flowViews = resolveRuntimeTasksFlows(params.runtimeApi);
  const boundFlowViews = flowViews?.bindSession({
    sessionKey: params.ownerSessionKey,
    requesterOrigin: params.requesterOrigin
  });
  const legacyTaskFlow = resolveLegacyTaskFlow(params.runtimeApi);
  if (!legacyTaskFlow) {
    return NOOP_FLOW_TRACKING;
  }
  const bound = legacyTaskFlow.bindSession({
    sessionKey: params.ownerSessionKey,
    requesterOrigin: params.requesterOrigin
  });
  if (!bound?.createManaged || !bound.runTask) {
    return NOOP_FLOW_TRACKING;
  }
  let flowId;
  let flowRevision;
  let taskId;
  try {
    const flow = bound.createManaged({
      controllerId: "dwemr/acp-native",
      goal: `DWEMR ${params.action}: ${params.claudeCommand}`,
      status: "running",
      currentStep: params.action,
      stateJson: {
        requestId: params.requestId
      }
    });
    if (flow?.flowId) {
      flowId = flow.flowId;
      flowRevision = flow.revision;
      const persisted = boundFlowViews?.get?.(flow.flowId);
      if (!persisted) {
        flowId = void 0;
        flowRevision = void 0;
      }
    }
  } catch {
  }
  if (flowId) {
    try {
      const taskResult = bound.runTask({
        flowId,
        runtime: "acp",
        sourceId: params.requestId,
        childSessionKey: params.childSessionKey,
        runId: params.requestId,
        label: `DWEMR ${params.action}`,
        task: params.claudeCommand,
        status: "running",
        startedAt: Date.now()
      });
      if (taskResult?.flow?.revision !== void 0) {
        flowRevision = taskResult.flow.revision;
      }
      if (taskResult?.task?.taskId) {
        taskId = taskResult.task.taskId;
      }
      const summary = boundFlowViews?.getTaskSummary?.(flowId);
      if (!summary) {
        taskId = void 0;
      }
    } catch {
    }
  }
  return {
    flowId,
    flowRevision,
    taskId,
    async finish({ failed, error }) {
      if (!flowId || typeof flowRevision !== "number") {
        return;
      }
      try {
        if (failed && bound.fail) {
          bound.fail({
            flowId,
            expectedRevision: flowRevision,
            blockedSummary: error,
            endedAt: Date.now()
          });
          return;
        }
        if (!failed && bound.finish) {
          bound.finish({
            flowId,
            expectedRevision: flowRevision,
            endedAt: Date.now()
          });
          return;
        }
      } catch {
      }
    }
  };
}

// src/openclaw/backend/acp-native/acp-readiness.ts
import { getAcpRuntimeBackend } from "openclaw/plugin-sdk/acp-runtime";
function isAcpRuntimeReady(runtimeApi, runtimeConfig) {
  const blockingNotes = [];
  const warningNotes = [];
  const acpSummary = buildAcpRuntimeSummary(runtimeApi, runtimeConfig);
  const acpConfig = resolveAcpConfig(runtimeApi);
  const backendId = resolveAcpBackendId(runtimeApi, runtimeConfig);
  if (!runtimeApi || !resolveOpenClawConfig(runtimeApi)) {
    blockingNotes.push("OpenClaw plugin runtime context is unavailable. ACP-native execution requires a live gateway runtime context.");
  }
  if (!acpSummary.flowViewsAvailable) {
    blockingNotes.push("Missing required runtime seam: `api.runtime.tasks.flows`.");
  }
  if (!acpSummary.taskFlowLegacyAvailable) {
    warningNotes.push("Compatibility seam `api.runtime.taskFlow` is unavailable; DWEMR will run without flow/task mutation ledger writes.");
  }
  if (acpConfig?.enabled === false) {
    blockingNotes.push("ACP is disabled in OpenClaw config (`acp.enabled=false`).");
  }
  const backend = getAcpRuntimeBackend(backendId);
  if (!backend) {
    blockingNotes.push(
      backendId ? `ACP backend \`${backendId}\` is not registered in this OpenClaw runtime.` : "No ACP backend is currently registered in this OpenClaw runtime."
    );
  }
  warningNotes.push(...collectAcpRuntimeOptionCaveatNotes(runtimeConfig));
  const notes = [...blockingNotes, ...warningNotes];
  return {
    backendKind: ACP_NATIVE_BACKEND_KIND,
    ready: blockingNotes.length === 0,
    acp: acpSummary,
    notes
  };
}

// src/openclaw/backend/acp-native/acp-session-lifecycle.ts
import path8 from "node:path";
import { getAcpSessionManager, readAcpSessionEntry } from "openclaw/plugin-sdk/acp-runtime";
var ACP_LIFECYCLE_REASONS = {
  commandCleanup: "dwemr-command-cleanup",
  stop: "dwemr-stop",
  stopCleanup: "dwemr-stop-cleanup",
  sessionsClear: "dwemr-sessions-clear",
  onboardingComplete: "dwemr-onboarding-complete"
};
async function discoverAcpAgentPid(beforePids, targetPath) {
  try {
    const afterPids = await snapshotChildPids("claude");
    const beforeSet = new Set(beforePids);
    const newPids = afterPids.filter((pid) => !beforeSet.has(pid));
    for (const pid of newPids) {
      const cwd = await resolveCwdForPid(pid);
      if (cwd && path8.resolve(cwd) === path8.resolve(targetPath)) {
        return pid;
      }
    }
  } catch {
  }
  return void 0;
}
function closeAcpSession(sessionManager, cfg, sessionKey, reason, opts) {
  return sessionManager.closeSession({
    cfg,
    sessionKey,
    reason,
    discardPersistentState: true,
    allowBackendUnavailable: true,
    ...opts?.clearMeta ? { clearMeta: true } : {}
  });
}
async function closeAcpCommandSession(params) {
  const before = params.manager.resolveSession({
    cfg: params.cfg,
    sessionKey: params.sessionKey
  });
  if (before.kind === "none") {
    const storeEntry2 = readAcpSessionEntry({
      sessionKey: params.sessionKey,
      cfg: params.cfg
    });
    if (!storeEntry2?.acp) {
      return { status: "closed" };
    }
    return {
      status: "stale",
      error: "ACP session metadata still exists after runtime reported no active session."
    };
  }
  try {
    await closeAcpSession(params.manager, params.cfg, params.sessionKey, ACP_LIFECYCLE_REASONS.commandCleanup, { clearMeta: true });
  } catch (error) {
    return {
      status: "still_active",
      error: `DWEMR could not close ACP session \`${params.sessionKey}\` cleanly: ${formatAcpLifecycleError(error)}`
    };
  }
  const after = params.manager.resolveSession({
    cfg: params.cfg,
    sessionKey: params.sessionKey
  });
  const storeEntry = readAcpSessionEntry({
    sessionKey: params.sessionKey,
    cfg: params.cfg
  });
  if (after.kind === "none" && !storeEntry?.acp) {
    return { status: "closed" };
  }
  return {
    status: "still_active",
    error: `ACP session \`${params.sessionKey}\` still appears active after DWEMR cleanup attempted to close it.`
  };
}
async function reconcileTrackedAcpRun(params) {
  const sessionKey = params.run.identity.childSessionKey ?? params.run.sessionName;
  if (!sessionKey) {
    return params.run;
  }
  const cfg = resolveOpenClawConfig(params.runtimeApi);
  if (!cfg) {
    return params.run;
  }
  const manager = getAcpSessionManager();
  const resolution = manager.resolveSession({
    cfg,
    sessionKey
  });
  if (resolution.kind !== "none") {
    return params.run;
  }
  const storeEntry = readAcpSessionEntry({
    sessionKey,
    cfg
  });
  if (storeEntry?.acp) {
    return params.run;
  }
  await clearActiveRun(params.stateDir, params.projectPath, { runId: params.run.identity.runId, backendKind: ACP_NATIVE_BACKEND_KIND });
  return void 0;
}

// src/openclaw/backend/acp-native/acp-stop.ts
async function attemptFlowCancel(params) {
  const legacyTaskFlow = resolveLegacyTaskFlow(params.runtimeApi);
  const boundTaskFlow = legacyTaskFlow?.bindSession({
    sessionKey: params.ownerSessionKey,
    requesterOrigin: params.requesterOrigin
  });
  if (!boundTaskFlow?.cancel) {
    return { outcome: "skipped" };
  }
  try {
    await boundTaskFlow.cancel({ flowId: params.flowId, cfg: params.cfg });
    return { outcome: "stopped", mechanism: { kind: "runtime_cancel", detail: "taskFlow.cancel" } };
  } catch (error) {
    return { outcome: "failed", error: formatAcpLifecycleError(error) };
  }
}
async function attemptSessionCancel(params) {
  try {
    await params.manager.cancelSession({ cfg: params.cfg, sessionKey: params.sessionKey, reason: ACP_LIFECYCLE_REASONS.stop });
    try {
      await closeAcpSession(params.manager, params.cfg, params.sessionKey, ACP_LIFECYCLE_REASONS.stopCleanup);
    } catch {
    }
    return {
      outcome: "stopped",
      mechanism: {
        kind: "runtime_cancel",
        detail: params.flowCancelFailed ? "acp.cancelSession (after taskFlow.cancel failed)" : "acp.cancelSession"
      }
    };
  } catch (error) {
    return { outcome: "failed", error: formatAcpLifecycleError(error) };
  }
}
async function attemptOsKill(pid) {
  if (!pid || !isProcessRunning(pid)) {
    return { outcome: "skipped" };
  }
  const killResult = await killProcessWithEscalation(pid);
  if (killResult.status === "killed" || killResult.status === "already_exited") {
    return {
      outcome: "stopped",
      mechanism: {
        kind: "signal",
        detail: `OS-level ${killResult.status === "killed" ? killResult.signal : "process already exited"} (after ACP cancel failed)`
      }
    };
  }
  return { outcome: "skipped" };
}

// src/openclaw/backend/acp-native/acp-turn-result.ts
import { isAcpRuntimeError as isAcpRuntimeError2 } from "openclaw/plugin-sdk/acp-runtime";
function createAcpEventCollector() {
  const events = [];
  function collect(event) {
    events.push({
      type: event.type,
      text: "text" in event ? event.text : void 0,
      stream: event.type === "text_delta" ? event.stream : void 0
    });
  }
  return { events, collect };
}
function buildTurnEventHandler(collector) {
  const turnDiag = [];
  const turnStartedAt = Date.now();
  function onEvent(event) {
    collector.collect(event);
    if (event.type === "done") {
      turnDiag.push({
        type: "done",
        detail: "stopReason" in event ? String(event.stopReason ?? "none") : "no-field",
        at: Date.now() - turnStartedAt
      });
    } else if (event.type === "error") {
      turnDiag.push({
        type: "error",
        detail: "message" in event ? String(event.message ?? "") : "unknown",
        at: Date.now() - turnStartedAt
      });
    } else if (event.type === "tool_call") {
      turnDiag.push({
        type: "tool_call",
        detail: "title" in event ? String(event.title ?? "") : void 0,
        at: Date.now() - turnStartedAt
      });
    }
  }
  function summarize() {
    const turnDurationMs = Date.now() - turnStartedAt;
    const textDeltaCount = collector.events.filter((e) => e.type === "text_delta" && e.stream !== "thought").length;
    const toolCallCount = collector.events.filter((e) => e.type === "tool_call").length;
    return [
      `[DWEMR-DIAG] runTurn completed in ${Math.round(turnDurationMs / 1e3)}s`,
      `events: ${collector.events.length} total, ${textDeltaCount} text_delta, ${toolCallCount} tool_call`,
      `done-events: ${JSON.stringify(turnDiag.filter((d) => d.type === "done"))}`,
      turnDiag.some((d) => d.type === "error") ? `errors: ${JSON.stringify(turnDiag.filter((d) => d.type === "error"))}` : void 0
    ].filter(Boolean).join(" | ");
  }
  return { onEvent, summarize };
}
function buildSuccessResult(collector, diagSummary) {
  const stdout = collectAcpRuntimeOutput(collector.events);
  return {
    exitCode: 0,
    stdout,
    stderr: stdout ? "" : diagSummary,
    timedOut: false
  };
}
function buildErrorResult(error, collector) {
  const timedOut = isAcpRuntimeError2(error) && /\btimed out\b/i.test(error.message);
  return {
    exitCode: timedOut ? 124 : 1,
    stdout: collectAcpRuntimeOutput(collector.events),
    stderr: formatAcpLifecycleError(error),
    timedOut
  };
}

// src/openclaw/backend/acp-native/acp-native-backend.ts
import { getAcpSessionManager as getAcpSessionManager2, readAcpSessionEntry as readAcpSessionEntry2 } from "openclaw/plugin-sdk/acp-runtime";
var ACP_NATIVE_DOCTOR_PROMPT_TEXT = "Say only: DWEMR_READY";
var ACP_NATIVE_DOCTOR_PROMPT_EXPECTED = "DWEMR_READY";
var MISSING_OPENCLAW_CONFIG_CONTEXT_MESSAGE = "DWEMR ACP-native runtime is missing OpenClaw config context.";
async function initAcpOneshotSession(params) {
  await params.manager.initializeSession({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    agent: params.agentId,
    mode: "oneshot",
    cwd: params.targetPath,
    ...params.backendId ? { backendId: params.backendId } : {}
  });
  await params.manager.updateSessionRuntimeOptions({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
    patch: buildAcpRuntimeOptionPatch(params.targetPath, params.runtimeConfig)
  });
}
function applySessionMeta(info, meta) {
  info.state = meta.state ?? info.state;
  info.mode = meta.mode ?? info.mode;
  info.agent = meta.agent ?? info.agent;
  info.backend = meta.backend ?? info.backend;
  info.cwd = meta.cwd ?? info.cwd;
  info.lastActivityAt = meta.lastActivityAt ?? info.lastActivityAt;
  info.lastError = meta.lastError ?? info.lastError;
}
function resolveRunPid(run) {
  return run.pid ?? run.identity.pid;
}
function findAcpActiveRun(stateDir, projectPath) {
  return findActiveRun(stateDir, projectPath, { backendKind: ACP_NATIVE_BACKEND_KIND });
}
function loadAcpActiveRuns(stateDir) {
  return loadActiveRuns(stateDir, { backendKind: ACP_NATIVE_BACKEND_KIND, pruneStale: false });
}
function clearAcpActiveRun(stateDir, projectPath, runId) {
  return clearActiveRun(stateDir, projectPath, { runId, backendKind: ACP_NATIVE_BACKEND_KIND });
}
function uniqueRunsByChildSessionKey(runs) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const run of runs) {
    const key = run.identity.childSessionKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ run, key });
  }
  return result;
}
function planAcpRun(deps) {
  const { request, runtimeApi, context } = deps;
  const runtimeState = request.runtimeState ?? isAcpRuntimeReady(runtimeApi, request.runtimeConfig ?? {});
  if (!runtimeState.ready) {
    throw new Error(`DWEMR ACP-native runtime is not ready.
${runtimeState.notes?.join("\n") ?? ""}`.trim());
  }
  const cfg = resolveOpenClawConfig(runtimeApi);
  if (!cfg) {
    throw new Error(MISSING_OPENCLAW_CONFIG_CONTEXT_MESSAGE);
  }
  const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
  const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
  const requestId = `dwemr-${randomUUID()}`;
  const sessionKey = buildAcpSessionKey({
    targetPath: request.targetPath,
    agentId,
    runtimeConfig: request.runtimeConfig,
    scope: { kind: "command", requestId }
  });
  const ownerSessionKey = resolveOwnerSessionKey(context, sessionKey);
  return { cfg, agentId, backendId, requestId, sessionKey, ownerSessionKey };
}
async function startAcpRun(params) {
  const { manager, plan, request, runtimeApi, context } = params;
  const beforePids = await snapshotChildPids("claude");
  await initAcpOneshotSession({
    manager,
    cfg: plan.cfg,
    sessionKey: plan.sessionKey,
    agentId: plan.agentId,
    backendId: plan.backendId,
    targetPath: request.targetPath,
    runtimeConfig: request.runtimeConfig
  });
  const discoveredPid = await discoverAcpAgentPid(beforePids, request.targetPath);
  const flowTracking = createAcpFlowTracking({
    runtimeApi,
    ownerSessionKey: plan.ownerSessionKey,
    childSessionKey: plan.sessionKey,
    requesterOrigin: context?.toolContext?.deliveryContext,
    action: request.options?.action ?? "unknown",
    claudeCommand: request.claudeCommand,
    requestId: plan.requestId
  });
  await tryRegisterAcpActiveRun({ request, plan, discoveredPid, flowTracking });
  return flowTracking;
}
async function tryRegisterAcpActiveRun(params) {
  const { request, plan, discoveredPid, flowTracking } = params;
  if (!request.options?.stateDir) return;
  try {
    await registerActiveRun(request.options.stateDir, {
      projectPath: request.targetPath,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      action: request.options.action ?? "unknown",
      executionMode: request.options.executionMode,
      claudeCommand: request.claudeCommand,
      sessionName: plan.sessionKey,
      pid: discoveredPid,
      identity: {
        backendKind: ACP_NATIVE_BACKEND_KIND,
        runId: plan.requestId,
        flowId: flowTracking.flowId,
        taskId: flowTracking.taskId,
        childSessionKey: plan.sessionKey,
        ownerSessionKey: plan.ownerSessionKey,
        pid: discoveredPid
      }
    });
  } catch {
  }
}
async function executeAcpTurn(params) {
  const { manager, plan, request, collector } = params;
  const handler = buildTurnEventHandler(collector);
  await manager.runTurn({
    cfg: plan.cfg,
    sessionKey: plan.sessionKey,
    text: request.claudeCommand,
    mode: "prompt",
    requestId: plan.requestId,
    onEvent: handler.onEvent
  });
  return handler.summarize();
}
async function cleanupAcpRun(params) {
  const { manager, plan, request } = params;
  const cleanup = await closeAcpCommandSession({ cfg: plan.cfg, manager, sessionKey: plan.sessionKey });
  if (cleanup.status === "closed" && request.options?.stateDir) {
    try {
      await clearAcpActiveRun(request.options.stateDir, request.targetPath, plan.requestId);
    } catch {
    }
  }
  if (cleanup.status !== "closed") {
    return { stderrSuffix: cleanup.error };
  }
  return {};
}
async function runAcpClaudeCommand(deps) {
  const { request, runtimeApi, manager, context } = deps;
  const plan = planAcpRun(deps);
  const collector = createAcpEventCollector();
  let flowTracking;
  let result = { exitCode: 1, stdout: "", stderr: "", timedOut: false };
  try {
    flowTracking = await startAcpRun({ manager, plan, request, runtimeApi, context });
    const diagSummary = await executeAcpTurn({ manager, plan, request, collector });
    await flowTracking.finish({ failed: false });
    result = buildSuccessResult(collector, diagSummary);
  } catch (error) {
    if (flowTracking) await flowTracking.finish({ failed: true, error: String(error) });
    result = buildErrorResult(error, collector);
  } finally {
    const { stderrSuffix } = await cleanupAcpRun({ manager, plan, request });
    if (stderrSuffix) {
      result.stderr = result.stderr ? `${result.stderr}
${stderrSuffix}` : stderrSuffix;
    }
  }
  return result;
}
function createAcpNativeRuntimeBackend(context) {
  const runtimeApi = asRuntimeApi(context?.api);
  const manager = getAcpSessionManager2();
  return {
    kind: ACP_NATIVE_BACKEND_KIND,
    async inspectRuntime(config) {
      return isAcpRuntimeReady(runtimeApi, config);
    },
    async ensureRuntime(config) {
      return isAcpRuntimeReady(runtimeApi, config);
    },
    async runClaudeCommand(request) {
      return runAcpClaudeCommand({ request, runtimeApi, manager, context });
    },
    async probeClaudeRuntime(request) {
      if (!request.project.exists) {
        return { status: "skipped", detail: "Skipped because the target project path does not exist." };
      }
      if (request.project.installState === "missing") {
        return { status: "skipped", detail: "Skipped because DWEMR project assets are not installed yet." };
      }
      if (request.project.installState === "unsupported_contract") {
        return {
          status: "skipped",
          detail: "Skipped because the project uses an unsupported DWEMR state contract. Re-run `/dwemr init <path> --overwrite --confirm-overwrite` first."
        };
      }
      const runtimeState = request.runtimeState ?? isAcpRuntimeReady(runtimeApi, request.runtimeConfig ?? {});
      if (!runtimeState.ready) {
        return { status: "skipped", detail: "Skipped because ACP-native runtime is not ready yet." };
      }
      const cfg = resolveOpenClawConfig(runtimeApi);
      if (!cfg) {
        return { status: "failed", detail: MISSING_OPENCLAW_CONFIG_CONTEXT_MESSAGE };
      }
      const agentId = resolveAcpAgentId(runtimeApi, request.runtimeConfig);
      const backendId = resolveAcpBackendId(runtimeApi, request.runtimeConfig);
      const sessionKey = buildAcpSessionKey({
        targetPath: request.targetPath,
        agentId,
        runtimeConfig: request.runtimeConfig,
        scope: { kind: "doctor" }
      });
      const requestId = `dwemr-doctor-${randomUUID()}`;
      const collector = createAcpEventCollector();
      let probeResult;
      try {
        await initAcpOneshotSession({
          manager,
          cfg,
          sessionKey,
          agentId,
          backendId,
          targetPath: request.targetPath,
          runtimeConfig: request.runtimeConfig
        });
        await manager.runTurn({
          cfg,
          sessionKey,
          text: ACP_NATIVE_DOCTOR_PROMPT_TEXT,
          mode: "prompt",
          requestId,
          onEvent: collector.collect
        });
        const output = collectAcpRuntimeOutput(collector.events);
        if (output.trim() !== ACP_NATIVE_DOCTOR_PROMPT_EXPECTED) {
          probeResult = {
            status: "failed",
            detail: output || "ACP runtime returned an unexpected health-check response."
          };
        } else {
          probeResult = {
            status: "ok",
            detail: `ACP runtime is reachable, session \`${sessionKey}\` is healthy, and a probe prompt returned \`DWEMR_READY\`.`,
            result: {
              exitCode: 0,
              stdout: output,
              stderr: "",
              timedOut: false
            }
          };
        }
      } catch (error) {
        probeResult = {
          status: "failed",
          detail: formatAcpLifecycleError(error)
        };
      } finally {
        const cleanup = await closeAcpCommandSession({ cfg, manager, sessionKey });
        if (cleanup.status !== "closed") {
          probeResult = {
            status: "failed",
            detail: probeResult ? `${probeResult.detail}
${cleanup.error}` : cleanup.error
          };
        }
      }
      return probeResult ?? { status: "failed", detail: "ACP probe finished without producing a result." };
    },
    findActiveRun(stateDir, projectPath) {
      return findAcpActiveRun(stateDir, projectPath).then((run) => {
        if (!run) {
          return void 0;
        }
        return reconcileTrackedAcpRun({
          stateDir,
          projectPath,
          run,
          runtimeApi
        });
      });
    },
    async stopActiveRun(stateDir, projectPath) {
      const run = await findAcpActiveRun(stateDir, projectPath);
      if (!run) {
        return { status: "not_found", projectPath };
      }
      const cfg = resolveOpenClawConfig(runtimeApi);
      const sessionKey = run.identity.childSessionKey ?? run.sessionName;
      const flowId = run.identity.flowId;
      const ownerSessionKey = run.identity.ownerSessionKey ?? sessionKey;
      const errors = [];
      if (cfg && flowId && ownerSessionKey) {
        const r = await attemptFlowCancel({ runtimeApi, cfg, flowId, ownerSessionKey, requesterOrigin: context?.toolContext?.deliveryContext });
        if (r.outcome === "stopped") {
          await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
          return { status: "stopped", run, mechanism: r.mechanism };
        }
        if (r.outcome === "failed") errors.push(`Flow cancellation error: ${r.error}`);
      }
      if (!cfg || !sessionKey) {
        errors.push("ACP-native run is missing session context; runtime-level cancellation was skipped.");
      } else {
        const sessionResult = await attemptSessionCancel({ manager, cfg, sessionKey, flowCancelFailed: errors.length > 0 });
        if (sessionResult.outcome === "stopped") {
          await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
          return { status: "stopped", run, mechanism: sessionResult.mechanism };
        }
        if (sessionResult.outcome === "failed") errors.push(`Session cancellation error: ${sessionResult.error}`);
      }
      const osResult = await attemptOsKill(resolveRunPid(run));
      if (osResult.outcome === "stopped") {
        await clearAcpActiveRun(stateDir, projectPath, run.identity.runId);
        return { status: "stopped", run, mechanism: osResult.mechanism };
      }
      return { status: "failed", run, error: errors.join(" ") };
    },
    async listSessions(stateDir) {
      const cfg = resolveOpenClawConfig(runtimeApi);
      const sessions = [];
      const trackedRuns = await loadAcpActiveRuns(stateDir);
      const runs = [];
      for (const run of trackedRuns) {
        const reconciled = await reconcileTrackedAcpRun({
          stateDir,
          projectPath: run.projectPath,
          run,
          runtimeApi
        });
        if (reconciled) {
          runs.push(reconciled);
        }
      }
      for (const { run, key } of uniqueRunsByChildSessionKey(runs)) {
        const info = {
          sessionKey: key,
          state: "none",
          source: "active-run",
          projectPath: run.projectPath,
          action: run.action,
          pid: resolveRunPid(run)
        };
        if (cfg) {
          const resolution = manager.resolveSession({ cfg, sessionKey: key });
          if (resolution.kind === "ready" && resolution.meta) {
            applySessionMeta(info, resolution.meta);
          } else if (resolution.kind !== "ready") {
            info.state = resolution.kind;
          }
        }
        const storeEntry = readAcpSessionEntry2({ sessionKey: key, cfg: cfg ?? void 0 });
        if (storeEntry?.acp && info.state === "none") {
          applySessionMeta(info, storeEntry.acp);
        }
        sessions.push(info);
      }
      let aggregate = { activeSessions: 0, evictedTotal: 0 };
      if (cfg) {
        const snapshot = manager.getObservabilitySnapshot(cfg);
        aggregate = {
          activeSessions: snapshot.runtimeCache.activeSessions,
          evictedTotal: snapshot.runtimeCache.evictedTotal
        };
      }
      return { sessions, aggregate };
    },
    async clearSessions(stateDir) {
      const cfg = resolveOpenClawConfig(runtimeApi);
      let closed = 0;
      let failed = 0;
      const runs = await loadAcpActiveRuns(stateDir);
      for (const { run, key } of uniqueRunsByChildSessionKey(runs)) {
        let sessionClosed = false;
        if (cfg) {
          try {
            await manager.cancelSession({ cfg, sessionKey: key, reason: ACP_LIFECYCLE_REASONS.sessionsClear });
            sessionClosed = true;
          } catch {
          }
          try {
            await closeAcpSession(manager, cfg, key, ACP_LIFECYCLE_REASONS.sessionsClear, { clearMeta: true });
            sessionClosed = true;
          } catch {
          }
        }
        if (!sessionClosed) {
          const osResult = await attemptOsKill(resolveRunPid(run));
          if (osResult.outcome === "stopped") sessionClosed = true;
        }
        if (sessionClosed) {
          closed += 1;
          try {
            await clearAcpActiveRun(stateDir, run.projectPath, run.identity.runId);
          } catch {
          }
        } else {
          failed += 1;
        }
      }
      return { closed, failed };
    }
  };
}

// src/openclaw/backend/runtime-backend.ts
var runtimeBackendRegistry = /* @__PURE__ */ new Map();
runtimeBackendRegistry.set(ACP_NATIVE_BACKEND_KIND, createAcpNativeRuntimeBackend);
var runtimeBackendOverride;
function getDefaultRuntimeBackend(options = {}) {
  void options.runtimeConfig;
  const selectedKind = runtimeBackendOverride ?? normalizeOptionalString(options.preferredKind) ?? ACP_NATIVE_BACKEND_KIND;
  const factory = runtimeBackendRegistry.get(selectedKind);
  if (!factory) {
    throw new Error(`DWEMR runtime backend "${selectedKind}" is not registered.`);
  }
  return factory(options.runtimeContext);
}

// src/openclaw/diagnostics/doctor.ts
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function cloneRecord(value) {
  return isRecord(value) ? { ...value } : {};
}
function normalizeOptionalString2(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : void 0;
}
function normalizeReloadMode(value) {
  const normalized = normalizeOptionalString2(value)?.toLowerCase();
  if (normalized === "hybrid" || normalized === "hot" || normalized === "restart" || normalized === "off") {
    return normalized;
  }
  return normalized ? "unknown" : "hybrid";
}
function normalizeOptionalPositiveNumber(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return void 0;
}
function resolveRuntimeConfigApi(api) {
  const candidate = isRecord(api) ? api.runtime : void 0;
  if (!isRecord(candidate)) {
    return void 0;
  }
  const config = candidate.config;
  if (!isRecord(config) || typeof config.loadConfig !== "function" || typeof config.writeConfigFile !== "function") {
    return void 0;
  }
  return config;
}
function isAcpNativePermissionFailure(detail) {
  const text = detail?.toLowerCase() ?? "";
  return text.includes("permission prompt unavailable in non-interactive mode") || text.includes("could not apply acp runtime options before turn execution") || text.includes("approval_policy") || text.includes("session/set_config_option");
}
function isClaudeAgentPolicyFailure(detail) {
  const text = detail?.toLowerCase() ?? "";
  return text.includes("agent") && text.includes("claude") && text.includes("not allowed by policy");
}
function isAcpRuntimeOptionSetupFailure(detail) {
  const text = detail?.toLowerCase() ?? "";
  return text.includes("could not apply acp runtime options before turn execution") || text.includes("session/set_config_option") || text.includes("runtime options");
}
function formatRuntimeSource(runtime) {
  return `${runtime.backendKind} runtime (${runtime.ready ? "ready" : "not ready"})`;
}
function buildRuntimeRecoveryNotes(runtime) {
  return runtime.notes?.length ? runtime.notes : ["The selected runtime backend is not ready. Check backend runtime prerequisites and re-run `/dwemr doctor`."];
}
function formatActiveProjectCommand(command, args = "", projectPath) {
  const suffix = args ? ` ${args}` : "";
  return projectPath ? `/dwemr ${command}${suffix}` : `/dwemr ${command} <path>${suffix}`;
}
function appendRuntimeSection(lines, runtime) {
  lines.push(`- Runtime backend: ${runtime.backendKind}`);
  lines.push(`- Runtime ready: ${runtime.ready ? "yes" : "no"}`);
  if (runtime.acp) {
    lines.push(`- ACP flow seam (tasks.flows): ${runtime.acp.flowViewsAvailable ? "available" : "missing"}`);
    lines.push(`- ACP taskFlow seam (compat): ${runtime.acp.taskFlowLegacyAvailable ? "available" : "missing"}`);
  }
  if (runtime.notes?.length) {
    lines.push(...runtime.notes.map((note) => `- Runtime note: ${note}`));
  }
}
function buildRuntimeLedgerNotes(activeRun, pipelineMilestoneKind) {
  if (!activeRun) {
    if (pipelineMilestoneKind === "user_input_required") {
      return ["No active runtime owner is expected right now; workflow is waiting on user input from saved DWEMR state."];
    }
    return ["No active runtime owner is currently registered for this project."];
  }
  const notes = [
    `Active runtime owner: ${activeRun.identity.backendKind} run ${activeRun.identity.runId}`
  ];
  if (activeRun.identity.flowId && !activeRun.identity.taskId) {
    notes.push("Active run has a flow id but no task id; this can happen on degraded compatibility seams.");
  }
  if (activeRun.identity.backendKind === "acp-native" && !activeRun.identity.childSessionKey) {
    notes.push("Active ACP-native run is missing child session identity; stop/cancel reliability may be degraded.");
  }
  return notes;
}
function buildAcpxPermissionPreviewNotes(projectPath, repair) {
  if (!repair?.needsRepair) {
    return [];
  }
  return [
    "DWEMR found an ACPX automation permission mismatch. ACPX, not `.claude/settings.json`, controls shell and file-write permissions for ACP-native runs.",
    `Choose one repair path: \`${formatActiveProjectCommand("doctor", "--fix --restart", projectPath)}\``,
    `Or repair only and restart manually: \`${formatActiveProjectCommand("doctor", "--fix --no-restart", projectPath)}\``
  ];
}
function buildAcpxAutomationNotes(runtime, claudeProbe, repair) {
  const notes = [];
  const relevantRuntime = runtime.backendKind === "acp-native" || Boolean(runtime.acp);
  if (!relevantRuntime) {
    return notes;
  }
  const permissionIssue = isAcpNativePermissionFailure(claudeProbe.detail);
  if (permissionIssue || repair?.needsRepair) {
    notes.push("ACPX owns shell and file-write permissions for ACP-native DWEMR runs; `.claude/settings.json` does not override ACPX harness policy.");
  }
  if (repair?.configAccess === "missing") {
    notes.push("This OpenClaw runtime does not expose `api.runtime.config`, so DWEMR can diagnose ACPX permission issues but cannot repair host config automatically.");
  } else if (repair?.configAccess === "error" && repair.error) {
    notes.push(`DWEMR could not inspect or update OpenClaw config automatically: ${repair.error}`);
  }
  if (repair?.enabled === false) {
    notes.push("The ACPX plugin is disabled in OpenClaw config, so ACP-native DWEMR automation cannot be repaired through ACPX permission settings yet.");
  }
  if (isClaudeAgentPolicyFailure(claudeProbe.detail)) {
    notes.push("The remaining blocker is ACP policy for the `claude` agent. DWEMR will not auto-edit `acp.allowedAgents` or `acp.defaultAgent`.");
  }
  if (!repair?.needsRepair && permissionIssue) {
    notes.push("ACPX permission config already matches DWEMR's required `approve-all` + `fail` policy, so the remaining ACP-native failure is outside the permission scope doctor is allowed to auto-repair.");
  }
  return notes;
}
function patchAcpxPermissionConfig(config) {
  const next = { ...config };
  const plugins = cloneRecord(next.plugins);
  const entries = cloneRecord(plugins.entries);
  const acpx = cloneRecord(entries.acpx);
  const acpxConfig = cloneRecord(acpx.config);
  let changed = false;
  if (acpxConfig.permissionMode !== "approve-all") {
    acpxConfig.permissionMode = "approve-all";
    changed = true;
  }
  if (acpxConfig.nonInteractivePermissions !== "fail") {
    acpxConfig.nonInteractivePermissions = "fail";
    changed = true;
  }
  acpx.config = acpxConfig;
  entries.acpx = acpx;
  plugins.entries = entries;
  next.plugins = plugins;
  return { next, changed };
}
async function inspectAcpxPermissionRepair(api, applicable) {
  if (!applicable) {
    return {
      repair: {
        applicable: false,
        configAccess: "missing",
        reloadMode: "unknown",
        needsRepair: false,
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false
      }
    };
  }
  const configApi = resolveRuntimeConfigApi(api);
  if (!configApi) {
    return {
      repair: {
        applicable: true,
        configAccess: "missing",
        reloadMode: "unknown",
        needsRepair: false,
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false
      }
    };
  }
  try {
    const config = await configApi.loadConfig();
    const plugins = cloneRecord(config.plugins);
    const entries = cloneRecord(plugins.entries);
    const acpx = cloneRecord(entries.acpx);
    const acpxConfig = cloneRecord(acpx.config);
    const permissionMode = normalizeOptionalString2(acpxConfig.permissionMode);
    const nonInteractivePermissions = normalizeOptionalString2(acpxConfig.nonInteractivePermissions);
    const timeoutSeconds = normalizeOptionalPositiveNumber(acpxConfig.timeoutSeconds);
    const reloadMode = normalizeReloadMode(cloneRecord(config.gateway).reload && cloneRecord(cloneRecord(config.gateway).reload).mode);
    return {
      config,
      repair: {
        applicable: true,
        configAccess: "available",
        enabled: acpx.enabled !== false,
        permissionMode,
        nonInteractivePermissions,
        timeoutSeconds,
        reloadMode,
        needsRepair: permissionMode !== "approve-all" || nonInteractivePermissions !== "fail",
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false
      }
    };
  } catch (error) {
    return {
      repair: {
        applicable: true,
        configAccess: "error",
        reloadMode: "unknown",
        needsRepair: false,
        previewed: false,
        attempted: false,
        changed: false,
        restartExpected: false,
        manualRestartRequired: false,
        error: String(error)
      }
    };
  }
}
async function applyAcpxPermissionRepair(params) {
  const configApi = resolveRuntimeConfigApi(params.api);
  if (!configApi || !params.config) {
    return {
      repair: {
        ...params.current,
        attempted: true,
        error: "OpenClaw config access is unavailable for ACPX permission repair."
      }
    };
  }
  try {
    const { next, changed } = patchAcpxPermissionConfig(params.config);
    if (changed) {
      await configApi.writeConfigFile(next);
    }
    const restartExpected = params.restartBehavior === "restart" && (params.current.reloadMode === "hybrid" || params.current.reloadMode === "restart");
    return {
      repair: {
        ...params.current,
        permissionMode: "approve-all",
        nonInteractivePermissions: "fail",
        attempted: true,
        changed,
        restartBehavior: params.restartBehavior,
        restartExpected,
        manualRestartRequired: params.restartBehavior === "no-restart" || !restartExpected
      }
    };
  } catch (error) {
    return {
      repair: {
        ...params.current,
        attempted: true,
        restartBehavior: params.restartBehavior,
        error: String(error)
      }
    };
  }
}
function formatDoctorText(report, pluginConfig, defaultProjectPath) {
  const lines = ["DWEMR doctor", "", "Runtime:"];
  appendRuntimeSection(lines, report.runtime);
  lines.push(`- Execution runtime: ${formatRuntimeSource(report.runtime)}`);
  lines.push(`- Claude model override: ${pluginConfig.model?.trim() ? pluginConfig.model : "not configured"}`);
  lines.push(`- Claude subagent model: ${pluginConfig.subagentModel?.trim() ? pluginConfig.subagentModel : "not configured"}`);
  lines.push(`- Claude effort override: ${pluginConfig.effortLevel?.trim() ? pluginConfig.effortLevel : "not configured"}`);
  if (report.project) {
    const selectedProfile = report.project.canonicalProfile ?? report.project.onboardingState.selectedProfile ?? "not selected";
    lines.push("", "Project:");
    lines.push(`- Target path: ${report.project.targetPath}`);
    lines.push(`- Exists: ${report.project.exists ? "yes" : "no"}`);
    lines.push(`- DWEMR install state: ${report.project.installState}`);
    if (report.project.contractIssues.length === 0) {
      lines.push(`- DWEMR contract: v${DWEMR_CONTRACT_VERSION}`);
    } else {
      lines.push("- DWEMR contract: unsupported");
      lines.push(...report.project.contractIssues.map((issue) => `- Contract issue: ${issue}`));
    }
    lines.push(`- Onboarding status: ${report.project.onboardingState.status}`);
    lines.push(`- Selected profile: ${selectedProfile}`);
    if (report.project.onboardingState.clarificationSummary) {
      lines.push(`- Clarification summary: ${report.project.onboardingState.clarificationSummary}`);
    }
    if (report.project.onboardingState.clarificationQuestions.length > 0) {
      lines.push(`- Clarification questions: ${report.project.onboardingState.clarificationQuestions.join(" | ")}`);
    }
    if (report.project.expectedPacks.length > 0) {
      lines.push(`- Expected packs: ${report.project.expectedPacks.join(", ")}`);
    }
    if (report.project.missingFiles.length > 0) {
      lines.push(...report.project.missingFiles.map((relativePath) => `- Missing: ${relativePath}`));
    }
  } else {
    lines.push("", "Project:");
    lines.push(`- Target path: ${defaultProjectPath ? `not provided (default is ${defaultProjectPath})` : "not provided"}`);
  }
  lines.push("", "Claude probe:");
  lines.push(`- ${report.claudeProbe.detail}`);
  if (report.acpxPermissionRepair?.applicable) {
    lines.push("", "ACPX permissions:");
    lines.push(`- permissionMode: ${report.acpxPermissionRepair.permissionMode ?? "not set"}`);
    lines.push(`- nonInteractivePermissions: ${report.acpxPermissionRepair.nonInteractivePermissions ?? "not set"}`);
    lines.push(`- timeoutSeconds: ${report.acpxPermissionRepair.timeoutSeconds ?? "not set"}`);
    lines.push(`- Gateway reload mode: ${report.acpxPermissionRepair.reloadMode}`);
  }
  if (report.automationNotes.length > 0) {
    lines.push("", "ACP-native automation:");
    lines.push(...report.automationNotes.map((note) => `- ${note}`));
  }
  if (report.previewNotes.length > 0) {
    lines.push("", "Permission repair preview:");
    lines.push(...report.previewNotes.map((note) => `- ${note}`));
  }
  if (report.fixNotes.length > 0) {
    lines.push("", report.fixApplied ? "Self-heal:" : "Fix suggestions:");
    lines.push(...report.fixNotes.map((note) => `- ${note}`));
  }
  if (report.runtimeLedgerNotes.length > 0) {
    lines.push("", "Runtime ledger:");
    lines.push(...report.runtimeLedgerNotes.map((note) => `- ${note}`));
  }
  lines.push("", "Next:");
  const activeProjectReady = report.project?.exists ? report.project.targetPath : defaultProjectPath;
  if (report.previewNotes.length > 0) {
    lines.push(`- Run \`${formatActiveProjectCommand("doctor", "--fix --restart", activeProjectReady)}\` to repair ACPX permissions and let OpenClaw apply the restart path when supported.`);
    lines.push(`- Run \`${formatActiveProjectCommand("doctor", "--fix --no-restart", activeProjectReady)}\` to repair ACPX permissions now and restart the gateway yourself later.`);
    return lines.join("\n");
  }
  if (report.fixApplied) {
    if (report.project?.installState === "unsupported_contract") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`);
    } else if (!report.runtimeReady) {
      lines.push(...buildRuntimeRecoveryNotes(report.runtime).map((note) => `- ${note}`));
    } else if (report.acpxPermissionRepair?.attempted && report.acpxPermissionRepair.manualRestartRequired) {
      lines.push("- Restart the OpenClaw gateway before retrying DWEMR so ACPX permission changes can take effect.");
    } else if (report.acpxPermissionRepair?.attempted && report.acpxPermissionRepair.restartExpected) {
      lines.push("- Wait for the OpenClaw gateway to reload, then retry your DWEMR command.");
    } else if (report.project?.targetPath) {
      lines.push(`- Retry the original command, for example: ${formatActiveProjectCommand("status", "", activeProjectReady)}`);
    } else {
      lines.push("- Retry your DWEMR command.");
    }
  } else {
    if (!report.runtimeReady) {
      lines.push(...buildRuntimeRecoveryNotes(report.runtime).map((note) => `- ${note}`));
    }
    if (report.project?.installState === "missing") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath}\` to install the DWEMR bootstrap assets.`);
    } else if (report.project?.installState === "unsupported_contract") {
      lines.push(`- Run \`/dwemr init ${report.project.targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`);
    } else if (report.project?.installState === "bootstrap_only" && hasSavedClarificationBatch(report.project.onboardingState)) {
      lines.push(`- Answer the pending onboarding clarification with \`${formatActiveProjectCommand("start", "<response>", activeProjectReady)}\` or \`${formatActiveProjectCommand("plan", "<response>", activeProjectReady)}\`.`);
      lines.push(`- Run \`${formatActiveProjectCommand("what-now", "", activeProjectReady)}\` if you just want to review the saved clarification batch again.`);
    } else if (report.project?.installState === "bootstrap_only" && report.project.onboardingState.status !== "complete") {
      lines.push(`- Run \`${formatActiveProjectCommand("start", "<request>", activeProjectReady)}\` or \`${formatActiveProjectCommand("plan", "<request>", activeProjectReady)}\` to supply the initial onboarding request.`);
    } else if (report.project?.installState === "bootstrap_only") {
      lines.push(`- Run \`${formatActiveProjectCommand("start", "<request>", activeProjectReady)}\` or \`${formatActiveProjectCommand("continue", "", activeProjectReady)}\` to finish profile provisioning.`);
    } else if (!report.project && !defaultProjectPath) {
      lines.push("- Run `/dwemr init <path>` first to initialize and select a project, then retry your DWEMR command.");
    }
    if (report.claudeProbe.status === "failed") {
      const permissionIssue = isAcpNativePermissionFailure(report.claudeProbe.detail);
      const runtimeOptionIssue = isAcpRuntimeOptionSetupFailure(report.claudeProbe.detail);
      const permissionUnset = report.acpxPermissionRepair?.permissionMode !== "approve-all";
      const timeoutTooLowOrMissing = !report.acpxPermissionRepair?.timeoutSeconds || report.acpxPermissionRepair.timeoutSeconds < 7200;
      if (permissionIssue || permissionUnset) {
        lines.push("- If you are seeing ACPX permission errors, run `openclaw config set plugins.entries.acpx.config.permissionMode approve-all` and restart the OpenClaw gateway.");
      }
      if (runtimeOptionIssue || timeoutTooLowOrMissing) {
        lines.push("- If ACPX sessions fail during longer DWEMR turns or die around a repeatable time boundary, run `openclaw config set plugins.entries.acpx.config.timeoutSeconds 7200` and restart the OpenClaw gateway.");
      }
      lines.push("- Run `claude auth status` in your shell and re-authenticate Claude Code if needed.");
    }
  }
  return lines.join("\n");
}
async function runDwemrDoctor(pluginConfig, targetPath, fixMode, runtimeBackend = getDefaultRuntimeBackend({ runtimeConfig: pluginConfig }), options = {}) {
  const runtime = await runtimeBackend.inspectRuntime(pluginConfig);
  const fixNotes = [];
  const runtimeReady = () => runtime.ready;
  const shouldApplyExistingFixes = fixMode !== "inspect";
  let project;
  if (targetPath) {
    project = await inspectProjectHealth(targetPath);
    if (shouldApplyExistingFixes && project.exists && project.installState === "missing") {
      try {
        const repaired = await repairBootstrapAssets(targetPath);
        if (repaired.installedTargets.length > 0) {
          fixNotes.push(`Repaired missing DWEMR bootstrap assets in ${targetPath}: ${repaired.installedTargets.join(", ")}.`);
        } else {
          fixNotes.push(`DWEMR checked ${targetPath} for missing bootstrap assets, but nothing new needed to be installed.`);
        }
        project = await inspectProjectHealth(targetPath);
      } catch (error) {
        fixNotes.push(`Could not repair the project assets automatically: ${String(error)}`);
      }
    } else if (shouldApplyExistingFixes && project.exists && project.installState === "unsupported_contract") {
      fixNotes.push(
        `DWEMR did not auto-upgrade ${targetPath}. Run \`/dwemr init ${targetPath} --overwrite --confirm-overwrite\` to destroy the current target folder contents and adopt the current contract from scratch.`
      );
    } else if (shouldApplyExistingFixes && project.exists && project.installState === "bootstrap_only" && project.onboardingState.status === "complete") {
      try {
        const provisioned = await provisionProjectProfile(targetPath, project.onboardingState);
        fixNotes.push(`Provisioned the selected profile packs in ${targetPath}: ${provisioned.packNames.join(", ")}.`);
        project = await inspectProjectHealth(targetPath);
      } catch (error) {
        fixNotes.push(`Could not finish profile provisioning automatically: ${String(error)}`);
      }
    }
  }
  let runtimeLedgerNotes = [];
  if (targetPath && options.stateDir) {
    const [activeRun, brief] = await Promise.all([
      runtimeBackend.findActiveRun(options.stateDir, targetPath),
      readPipelineStateBrief(targetPath)
    ]);
    runtimeLedgerNotes = buildRuntimeLedgerNotes(activeRun, brief?.milestoneKind);
  }
  let claudeProbe = { status: "skipped", detail: "Skipped because no execution runtime is ready yet." };
  if (runtimeReady() && project) {
    claudeProbe = await runtimeBackend.probeClaudeRuntime({
      targetPath: project.targetPath,
      project,
      runtimeConfig: pluginConfig,
      runtimeState: runtime
    });
  } else if (runtimeReady() && !targetPath) {
    claudeProbe = { status: "skipped", detail: "Skipped because no target project path was provided." };
  }
  const acpxPermissionApplicable = runtime.backendKind === "acp-native" && (runtime.acp?.backendId ?? "acpx") === "acpx";
  const acpxInspection = await inspectAcpxPermissionRepair(options.api, acpxPermissionApplicable);
  let acpxPermissionRepair = acpxInspection.repair;
  const previewNotes = [];
  if (acpxPermissionRepair?.needsRepair) {
    if (fixMode === "apply") {
      const applied = await applyAcpxPermissionRepair({
        api: options.api,
        current: acpxPermissionRepair,
        restartBehavior: options.restartBehavior ?? "no-restart",
        config: acpxInspection.config
      });
      acpxPermissionRepair = applied.repair;
      if (acpxPermissionRepair.error) {
        fixNotes.push(`Could not repair ACPX automation permissions automatically: ${acpxPermissionRepair.error}`);
      } else if (acpxPermissionRepair.changed) {
        fixNotes.push("Updated OpenClaw ACPX permission config to `permissionMode=approve-all` and `nonInteractivePermissions=fail`.");
        if (acpxPermissionRepair.restartExpected) {
          fixNotes.push(`Gateway reload mode is \`${acpxPermissionRepair.reloadMode}\`, so OpenClaw should apply the restart path automatically.`);
        } else {
          fixNotes.push("A manual OpenClaw gateway restart is still required before ACPX permission changes take effect.");
        }
      } else {
        fixNotes.push("OpenClaw ACPX permission config was already set to DWEMR's required automation values.");
      }
    } else if (fixMode === "preview") {
      acpxPermissionRepair = {
        ...acpxPermissionRepair,
        previewed: true,
        restartBehavior: options.restartBehavior
      };
      previewNotes.push(...buildAcpxPermissionPreviewNotes(project?.exists ? project.targetPath : targetPath, acpxPermissionRepair));
    }
  } else if (fixMode === "apply" && acpxPermissionRepair?.applicable && acpxPermissionRepair.configAccess === "available") {
    fixNotes.push("OpenClaw ACPX permission config already matches DWEMR's required automation values.");
  }
  if (!runtimeReady()) {
    fixNotes.push(...buildRuntimeRecoveryNotes(runtime));
  }
  const automationNotes = buildAcpxAutomationNotes(runtime, claudeProbe, acpxPermissionRepair);
  return {
    runtime,
    runtimeReady: runtimeReady(),
    project,
    runtimeLedgerNotes,
    fixApplied: shouldApplyExistingFixes && fixNotes.length > 0,
    fixMode,
    fixNotes,
    previewNotes,
    automationNotes,
    claudeProbe,
    acpxPermissionRepair
  };
}
async function preflightExecution(pluginConfig, targetPath, defaultProjectPath, action, options = {}, runtimeBackend = getDefaultRuntimeBackend({ runtimeConfig: pluginConfig })) {
  const runtime = await runtimeBackend.inspectRuntime(pluginConfig);
  const project = await inspectProjectHealth(targetPath);
  if (runtime.ready && project.exists && project.installState !== "unsupported_contract" && (project.installState === "profile_installed" || options.allowBootstrap && project.installState === "bootstrap_only")) {
    return { runtime };
  }
  const report = {
    runtime,
    runtimeReady: runtime.ready,
    project,
    runtimeLedgerNotes: [],
    fixApplied: false,
    fixMode: "inspect",
    fixNotes: [],
    previewNotes: [],
    automationNotes: [],
    claudeProbe: {
      status: "skipped",
      detail: "Skipped during preflight. Run `/dwemr doctor` to validate Claude auth and session readiness."
    }
  };
  return {
    error: [
      `DWEMR is not ready to run \`${action}\` in ${targetPath}.`,
      "",
      formatDoctorText(report, pluginConfig, defaultProjectPath)
    ].join("\n")
  };
}

// src/control-plane/onboarding-flow.ts
function prepareOnboardingStateForEntry(currentState, entryAction, requestText) {
  const normalizedState = normalizeOnboardingState(currentState);
  const trimmedRequest = requestText?.trim() ?? "";
  if (hasSavedClarificationBatch(normalizedState)) {
    return normalizeOnboardingState({
      ...normalizedState,
      entryAction,
      requestContext: normalizedState.requestContext || trimmedRequest,
      clarificationResponse: trimmedRequest
    });
  }
  return normalizeOnboardingState({
    ...normalizedState,
    entryAction,
    requestContext: trimmedRequest,
    clarificationSummary: "",
    clarificationQuestions: [],
    clarificationResponse: ""
  });
}
function formatProjectUseStatus(targetPath, project) {
  const selectedProfile = project.canonicalProfile ?? project.onboardingState.selectedProfile ?? "unknown";
  if (project.installState === "unsupported_contract") {
    return [
      `Active DWEMR project set to ${targetPath}.`,
      "",
      "This project uses an older DWEMR state contract and must be refreshed before normal commands can run.",
      "",
      ...project.contractIssues.map((issue) => `- ${issue}`),
      "",
      `Next: run \`/dwemr init ${targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`
    ].join("\n");
  }
  if (project.installState === "profile_installed") {
    return [
      `Active DWEMR project set to ${targetPath}.`,
      "",
      `DWEMR is fully installed for the \`${selectedProfile}\` profile.`
    ].join("\n");
  }
  if (project.installState === "bootstrap_only") {
    const onboardingStatusText = project.onboardingState.status === "complete" ? "DWEMR bootstrap assets are installed and onboarding has completed, but the selected profile still needs provisioning." : hasSavedClarificationBatch(project.onboardingState) ? "DWEMR bootstrap assets are installed, and onboarding is waiting on one clarification batch." : "DWEMR bootstrap assets are installed, but onboarding is still pending.";
    return [
      `Active DWEMR project set to ${targetPath}.`,
      "",
      onboardingStatusText
    ].join("\n");
  }
  return [
    `Active DWEMR project set to ${targetPath}.`,
    "",
    "DWEMR assets are not installed in this project yet. Run `/dwemr init` if needed."
  ].join("\n");
}
function formatUnsupportedContract(targetPath, project, action) {
  const intro = action ? `DWEMR cannot run \`${action}\` in ${targetPath} because this project uses an older DWEMR state contract.` : `DWEMR cannot use ${targetPath} as a runnable project because it uses an older DWEMR state contract.`;
  return [
    intro,
    "",
    "This DWEMR runtime uses a clean-break state contract. Older initialized projects must be refreshed before routing can continue.",
    "",
    "Detected contract issues:",
    ...project.contractIssues.map((issue) => `- ${issue}`),
    "",
    "Next:",
    `- Run \`/dwemr init ${targetPath} --overwrite --confirm-overwrite\` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch.`,
    "- Re-run your DWEMR command after the overwrite completes."
  ].join("\n");
}
function formatBootstrapPendingStatus(targetPath, project) {
  const selectedProfile = project.canonicalProfile ?? project.onboardingState.selectedProfile ?? "not selected";
  const lines = [
    `DWEMR status for ${targetPath}`,
    "",
    `- Install state: ${project.installState}`,
    `- Onboarding status: ${project.onboardingState.status}`,
    `- Selected profile: ${selectedProfile}`
  ];
  if (project.onboardingState.selectedPacks.length > 0) {
    lines.push(`- Selected packs: ${project.onboardingState.selectedPacks.join(", ")}`);
  }
  if (project.onboardingState.requiredArtifacts.length > 0) {
    lines.push(`- Required artifacts: ${project.onboardingState.requiredArtifacts.join(", ")}`);
  }
  if (project.onboardingState.clarificationSummary) {
    lines.push(`- Clarification summary: ${project.onboardingState.clarificationSummary}`);
  }
  if (project.onboardingState.clarificationQuestions.length > 0) {
    lines.push(...project.onboardingState.clarificationQuestions.map((question) => `- Clarification question: ${question}`));
  }
  lines.push("", "Next:");
  if (project.onboardingState.status === "complete") {
    lines.push("- Run `/dwemr start <request>` or `/dwemr continue` to finish profile provisioning and continue delivery.");
  } else if (hasSavedClarificationBatch(project.onboardingState)) {
    lines.push("- Answer the pending clarification with `/dwemr start <response>`.");
    lines.push("- `/dwemr continue` and `/dwemr what-now` will only repeat the current clarification batch until onboarding completes.");
  } else {
    lines.push("- Run `/dwemr start <request>` or `/dwemr plan <request>` to supply the initial onboarding request.");
    lines.push("- `/dwemr continue` and `/dwemr what-now` can report onboarding status, but they do not start first-pass project classification.");
  }
  return lines.join("\n");
}
function formatPendingOnboardingEntry(targetPath, action, project) {
  const lines = [
    `DWEMR cannot use \`${action}\` as the first onboarding step for ${targetPath}.`,
    ""
  ];
  if (hasSavedClarificationBatch(project.onboardingState)) {
    lines.push("Onboarding is already waiting on one clarification batch.");
    if (project.onboardingState.clarificationSummary) {
      lines.push("", `Missing context: ${project.onboardingState.clarificationSummary}`);
    }
    if (project.onboardingState.clarificationQuestions.length > 0) {
      lines.push("", "Clarification questions:");
      lines.push(...project.onboardingState.clarificationQuestions.map((question) => `- ${question}`));
    }
    lines.push(
      "",
      "Next:",
      "- Answer the clarification with `/dwemr start <response>`.",
      "- `continue` and `what-now` only surface the saved clarification batch until onboarding completes."
    );
    return lines.join("\n");
  }
  if (project.onboardingState.requestContext) {
    lines.push(
      "DWEMR already has onboarding request context saved, but the last headless onboarding pass did not finish cleanly.",
      "",
      "Next:",
      "- Re-run `/dwemr start <request>` or `/dwemr plan <request>` to resume onboarding with request-bearing input.",
      `- Run \`/dwemr doctor ${targetPath}\` if you suspect the Claude runtime interrupted onboarding.`
    );
    return lines.join("\n");
  }
  lines.push(
    "A brand-new project needs one request-bearing onboarding command so Claude can classify the workflow profile in a single headless pass.",
    "",
    "Next:",
    "- Run `/dwemr start <request>` or `/dwemr plan <request>`.",
    "- `continue` and `what-now` do not carry enough project context to start onboarding from scratch."
  );
  return lines.join("\n");
}
function formatOnboardingBlocked(targetPath, action, project) {
  return [
    `DWEMR cannot run \`${action}\` in ${targetPath} before onboarding is complete.`,
    "",
    "Stage-isolated commands are blocked until the project has a selected workflow profile and the required packs are provisioned.",
    "",
    "Next:",
    hasSavedClarificationBatch(project.onboardingState) ? "- Answer the saved clarification with `/dwemr start <response>` first." : "- Run `/dwemr start <request>` or `/dwemr plan <request>` first."
  ].join("\n");
}

// src/openclaw/state/project-memory.ts
import { mkdir as mkdir4, readFile as readFile6, writeFile as writeFile6 } from "node:fs/promises";
import path9 from "node:path";
var PROJECT_MEMORY_RELATIVE_PATH = path9.join("tools", "dwemr", "projects.json");
function normalizeProjectRecord(raw) {
  if (typeof raw.path !== "string" || raw.path.trim().length === 0) {
    return;
  }
  const normalizedPath = path9.resolve(raw.path);
  return {
    path: normalizedPath,
    addedAt: typeof raw.addedAt === "string" && raw.addedAt.trim().length > 0 ? raw.addedAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    lastUsedAt: typeof raw.lastUsedAt === "string" && raw.lastUsedAt.trim().length > 0 ? raw.lastUsedAt : (/* @__PURE__ */ new Date(0)).toISOString(),
    initialized: raw.initialized === true ? true : void 0
  };
}
function listRememberedProjects(config) {
  const deduped = /* @__PURE__ */ new Map();
  for (const rawProject of config.projects ?? []) {
    const project = normalizeProjectRecord(rawProject);
    if (!project) {
      continue;
    }
    const existing = deduped.get(project.path);
    if (!existing) {
      deduped.set(project.path, project);
      continue;
    }
    deduped.set(project.path, {
      path: project.path,
      addedAt: existing.addedAt < project.addedAt ? existing.addedAt : project.addedAt,
      lastUsedAt: existing.lastUsedAt > project.lastUsedAt ? existing.lastUsedAt : project.lastUsedAt,
      initialized: existing.initialized || project.initialized ? true : void 0
    });
  }
  const activeProjectPath = getActiveProjectPath(config);
  if (activeProjectPath && !deduped.has(activeProjectPath)) {
    const now = (/* @__PURE__ */ new Date(0)).toISOString();
    deduped.set(activeProjectPath, {
      path: activeProjectPath,
      addedAt: now,
      lastUsedAt: now
    });
  }
  return [...deduped.values()].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}
function getActiveProjectPath(config) {
  const active = config.activeProjectPath?.trim();
  if (active) {
    return path9.resolve(active);
  }
  const fallback = config.defaultProjectPath?.trim();
  return fallback ? path9.resolve(fallback) : void 0;
}
function resolveProjectMemoryPath(stateDir) {
  return path9.join(stateDir, PROJECT_MEMORY_RELATIVE_PATH);
}
function normalizeProjectMemory(config) {
  const activeProjectPath = getActiveProjectPath(config);
  const projects = listRememberedProjects(config);
  return {
    activeProjectPath,
    defaultProjectPath: config.defaultProjectPath?.trim() ? path9.resolve(config.defaultProjectPath) : activeProjectPath,
    projects
  };
}
function mergeProjectMemory(primary, fallback) {
  return normalizeProjectMemory({
    activeProjectPath: primary.activeProjectPath ?? fallback.activeProjectPath,
    defaultProjectPath: primary.defaultProjectPath ?? fallback.defaultProjectPath,
    projects: [...primary.projects ?? [], ...fallback.projects ?? []]
  });
}
function rememberProject(config, projectPath, options = {}) {
  const normalizedPath = path9.resolve(projectPath);
  const timestamp = options.usedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const projects = listRememberedProjects(config);
  const existing = projects.find((project) => project.path === normalizedPath);
  const nextProjects = [
    ...projects.filter((project) => project.path !== normalizedPath),
    {
      path: normalizedPath,
      addedAt: existing?.addedAt ?? timestamp,
      lastUsedAt: timestamp,
      initialized: options.initialized === true || existing?.initialized === true ? true : void 0
    }
  ].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
  return {
    ...config,
    projects: nextProjects,
    activeProjectPath: options.setActive ? normalizedPath : getActiveProjectPath(config),
    defaultProjectPath: options.setActive ? normalizedPath : getActiveProjectPath(config) ?? config.defaultProjectPath
  };
}
async function loadProjectMemory(stateDir, fallbackConfig = {}) {
  const targetPath = resolveProjectMemoryPath(stateDir);
  try {
    const raw = await readFile6(targetPath, "utf8");
    const parsed = JSON.parse(raw);
    return mergeProjectMemory(normalizeProjectMemory(parsed), normalizeProjectMemory(fallbackConfig));
  } catch {
    return normalizeProjectMemory(fallbackConfig);
  }
}
async function saveProjectMemory(stateDir, config) {
  const targetPath = resolveProjectMemoryPath(stateDir);
  const normalized = normalizeProjectMemory(config);
  await mkdir4(path9.dirname(targetPath), { recursive: true });
  await writeFile6(targetPath, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
  return normalized;
}

// src/openclaw/state/project-selection.ts
function asPluginApi(api) {
  if (typeof api !== "object" || api === null || !("runtime" in api) || typeof api.runtime !== "object") {
    throw new Error("DWEMR plugin received an invalid API object. Check OpenClaw gateway compatibility.");
  }
  return api;
}
function getPluginConfig(api) {
  return asPluginApi(api).pluginConfig ?? {};
}
async function loadRememberedProjectMemory(api) {
  const pluginApi = asPluginApi(api);
  return loadProjectMemory(pluginApi.runtime.state.resolveStateDir(), pluginApi.pluginConfig ?? {});
}
async function rememberProjectSelection(api, projectPath, options = {}) {
  const pluginApi = asPluginApi(api);
  const current = await loadRememberedProjectMemory(api);
  const next = rememberProject(current, projectPath, {
    initialized: options.initialized,
    setActive: options.setActive ?? true
  });
  const saved = await saveProjectMemory(pluginApi.runtime.state.resolveStateDir(), next);
  pluginApi.pluginConfig = {
    ...pluginApi.pluginConfig ?? {},
    ...saved
  };
  return saved;
}
async function getDefaultProjectPath(api) {
  return getActiveProjectPath(await loadRememberedProjectMemory(api));
}
async function formatProjectsText(api) {
  const projectMemory = await loadRememberedProjectMemory(api);
  const activeProjectPath = getActiveProjectPath(projectMemory);
  const projects = listRememberedProjects(projectMemory);
  if (projects.length === 0) {
    return [
      "DWEMR remembered projects:",
      "- none",
      "",
      "Run `/dwemr init <path>` or `/dwemr use <path>` to remember a project."
    ].join("\n");
  }
  return [
    "DWEMR remembered projects:",
    ...projects.map((project) => {
      const tags = [
        project.path === activeProjectPath ? "active" : void 0,
        project.initialized ? "initialized" : void 0
      ].filter(Boolean);
      return `- ${project.path}${tags.length > 0 ? ` (${tags.join(", ")})` : ""}`;
    })
  ].join("\n");
}

// src/openclaw/cli/action-handlers.ts
var DWEMR_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" }
];
var DWEMR_EFFORT_LEVELS = ["auto", "low", "medium", "high", "max"];
var ACTIONS_THAT_BEGIN_ONBOARDING = /* @__PURE__ */ new Set(["start", "plan"]);
var ACTIONS_THAT_SURFACE_PENDING_ONBOARDING = /* @__PURE__ */ new Set(["continue", "what-now"]);
var ACTIONS_THAT_MAY_PROVISION_BOOTSTRAP_PROJECT = /* @__PURE__ */ new Set(["start", "continue", "plan", "what-now"]);
var ACTIONS_BLOCKED_UNTIL_ONBOARDING = /* @__PURE__ */ new Set(["implement", "release", "pr"]);
var RELEASE_LANE_ACTIONS = /* @__PURE__ */ new Set(["release", "pr"]);
var EXECUTION_MODE_REFRESH_ACTIONS = /* @__PURE__ */ new Set(["start", "continue"]);
var ACTIONS_THAT_KEEP_STANDARD_TIMEOUT = /* @__PURE__ */ new Set(["status", "what-now"]);
function resolveRuntimeBackend(ctx) {
  return ctx.runtimeBackend ?? getDefaultRuntimeBackend({
    runtimeContext: ctx.runtimeContext ?? { api: ctx.api },
    runtimeConfig: ctx.pluginConfig
  });
}
function formatStopResult(result) {
  const commandText = result.status === "not_found" ? void 0 : result.run.claudeCommand;
  const translatedCommand = commandText ? translateClaudeCommandSurface(commandText) : void 0;
  const runIdText = result.status === "not_found" ? void 0 : result.run.identity.runId;
  const runtimeOwner = result.status === "not_found" ? void 0 : formatRuntimeOwnerDescriptor(result.run);
  if (result.status === "not_found") {
    return [
      `No active OpenClaw-managed DWEMR run is currently registered for ${result.projectPath}.`,
      "",
      "If work is still in progress, wait for the current command to checkpoint or try `/dwemr continue` later."
    ].join("\n");
  }
  if (result.status === "already_exited") {
    return [
      `No active DWEMR runtime owner was still in flight for ${result.run.projectPath}.`,
      `Cleared the stale active-run record for \`${translatedCommand ?? runIdText ?? "unknown run"}\`.`
    ].join("\n");
  }
  if (result.status === "failed") {
    return [
      `DWEMR could not stop the active run for ${result.run.projectPath}.`,
      "",
      translatedCommand ? `Claude command: \`${translatedCommand}\`` : `Run ID: \`${runIdText}\``,
      `Runtime owner: \`${runtimeOwner ?? result.run.identity.backendKind}\``,
      "",
      String(result.error)
    ].join("\n");
  }
  return [
    `Stopped the active DWEMR run for ${result.run.projectPath}.`,
    `Action: \`${result.run.action}\``,
    translatedCommand ? `Claude command: \`${translatedCommand}\`` : `Run ID: \`${runIdText}\``,
    `Runtime owner: \`${runtimeOwner ?? result.run.identity.backendKind}\``,
    `Stop mechanism: \`${result.mechanism.kind}${result.mechanism.detail ? ` (${result.mechanism.detail})` : ""}\``,
    "",
    "Resume later with `/dwemr continue` or a narrower `/dwemr` command from the last saved checkpoint."
  ].join("\n");
}
function formatRuntimeOwnerDescriptor(run) {
  const parts = [`${run.identity.backendKind} run ${run.identity.runId}`];
  if (run.identity.flowId) {
    parts.push(`flow ${run.identity.flowId}`);
  }
  if (run.identity.taskId) {
    parts.push(`task ${run.identity.taskId}`);
  }
  return parts.join(" \xB7 ");
}
async function resolveClaudeRunOptions(stateDir, targetPath, action) {
  let executionMode;
  try {
    executionMode = await readProjectExecutionMode(targetPath);
  } catch {
    executionMode = void 0;
  }
  return {
    stateDir,
    action,
    executionMode,
    timeoutMs: executionMode === "autonomous" && !ACTIONS_THAT_KEEP_STANDARD_TIMEOUT.has(action) ? null : void 0
  };
}
async function ensureBootstrapReady(pluginConfig, targetPath, defaultProjectPath, action, runtimeBackend) {
  return preflightExecution(pluginConfig, targetPath, defaultProjectPath, action, { allowBootstrap: true }, runtimeBackend);
}
async function runWithPreflight(pluginConfig, stateDir, targetPath, defaultProjectPath, action, claudeCommand, runtimeBackend, options = {}) {
  const preflight = await preflightExecution(pluginConfig, targetPath, defaultProjectPath, action, {
    allowBootstrap: options.allowBootstrap
  }, runtimeBackend);
  if ("error" in preflight) {
    return preflight.error;
  }
  const projectModelConfig = await readProjectModelConfig(targetPath);
  const effectiveConfig = { ...pluginConfig, ...projectModelConfig };
  const result = await runtimeBackend.runClaudeCommand({
    targetPath,
    claudeCommand,
    runtimeConfig: effectiveConfig,
    options: await resolveClaudeRunOptions(stateDir, targetPath, action),
    runtimeState: preflight.runtime
  });
  return formatRunnerResult(claudeCommand, result.exitCode, result.stdout, result.stderr, result.timedOut);
}
async function ensureProfileProvisioned(pluginConfig, stateDir, targetPath, defaultProjectPath, action, runtimeBackend, requestText) {
  let project = await inspectProjectHealth(targetPath);
  if (project.installState === "profile_installed") {
    return { project };
  }
  if (project.installState === "unsupported_contract") {
    return { error: formatUnsupportedContract(targetPath, project, action) };
  }
  const preflight = await ensureBootstrapReady(pluginConfig, targetPath, defaultProjectPath, "onboarding", runtimeBackend);
  if ("error" in preflight && typeof preflight.error === "string") {
    return { error: preflight.error };
  }
  if (project.onboardingState.status !== "complete") {
    if (ACTIONS_THAT_BEGIN_ONBOARDING.has(action)) {
      const preparedState = prepareOnboardingStateForEntry(project.onboardingState, action, requestText);
      await writeOnboardingState(targetPath, {
        ...preparedState,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const onboardingResult = await runtimeBackend.runClaudeCommand({
      targetPath,
      claudeCommand: "/delivery-driver onboarding",
      runtimeConfig: pluginConfig,
      options: {
        stateDir,
        action: "onboarding"
      },
      runtimeState: preflight.runtime
    });
    const formatted = formatRunnerResult(
      "/delivery-driver onboarding",
      onboardingResult.exitCode,
      onboardingResult.stdout,
      onboardingResult.stderr,
      onboardingResult.timedOut
    );
    project = await inspectProjectHealth(targetPath);
    if (project.onboardingState.status !== "complete") {
      return { error: formatted };
    }
  }
  try {
    await provisionProjectProfile(targetPath, project.onboardingState);
  } catch (error) {
    return {
      error: [
        `DWEMR completed onboarding in ${targetPath} but could not provision the selected profile packs.`,
        "",
        String(error)
      ].join("\n")
    };
  }
  const refreshed = await inspectProjectHealth(targetPath);
  if (refreshed.installState !== "profile_installed") {
    return {
      error: [
        `DWEMR attempted to provision the selected profile in ${targetPath}, but the project is still not fully installed.`,
        "",
        ...refreshed.missingFiles.map((relativePath) => `- Missing: ${relativePath}`)
      ].join("\n")
    };
  }
  return { project: refreshed };
}
async function refreshPipelineExecutionMode(targetPath) {
  const executionMode = await readProjectExecutionMode(targetPath);
  await syncPipelineExecutionMode(targetPath, executionMode);
  return executionMode;
}
async function runWithEnoentFallback(ctx, targetPath, action, claudeCommand, runtimeBackend, options) {
  try {
    const text = await runWithPreflight(
      ctx.pluginConfig,
      ctx.stateDir,
      targetPath,
      ctx.defaultProjectPath,
      action,
      claudeCommand,
      runtimeBackend,
      options
    );
    return textResult((options?.prefixText ?? "") + text);
  } catch (error) {
    const execError = error;
    if (execError.code === "ENOENT") {
      const report = await runDwemrDoctor(ctx.pluginConfig, targetPath, "inspect", runtimeBackend, { stateDir: ctx.stateDir, api: ctx.api });
      return textResult(formatDoctorText(report, ctx.pluginConfig, ctx.defaultProjectPath));
    }
    return textResult(`DWEMR failed to run \`${claudeCommand}\` in ${targetPath}.

${String(error)}`);
  }
}
async function handleEmptyCommand(ctx) {
  return textResult(buildRunnerHelp(ctx.defaultProjectPath));
}
async function handleHelp(ctx) {
  return textResult(formatHelpText(ctx.defaultProjectPath));
}
async function handleProjects(ctx) {
  return textResult(await formatProjectsText(ctx.api));
}
async function handleUse(ctx, tokens) {
  const useTokens = tokens.slice(1);
  if (useTokens.length !== 1) {
    return textResult(buildUseHelp(ctx.defaultProjectPath));
  }
  const targetPath = path10.resolve(useTokens[0]);
  if (!await pathExists(targetPath)) {
    return textResult(`Project path does not exist: ${targetPath}`);
  }
  const project = await inspectProjectHealth(targetPath);
  await rememberProjectSelection(ctx.api, targetPath, { initialized: project.installState !== "missing", setActive: true });
  return textResult(formatProjectUseStatus(targetPath, project));
}
async function handleStop(ctx, tokens) {
  const runtimeBackend = resolveRuntimeBackend(ctx);
  const stopTokens = tokens.slice(1);
  if (stopTokens.length > 1) {
    return textResult("Too many positional arguments for `stop`.\n" + buildRunnerHelp(ctx.defaultProjectPath));
  }
  const targetPath = stopTokens[0] ? path10.resolve(stopTokens[0]) : ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult("Project path is required.\n" + buildRunnerHelp(ctx.defaultProjectPath));
  }
  return textResult(formatStopResult(await runtimeBackend.stopActiveRun(ctx.stateDir, targetPath)));
}
async function handleInit(ctx, tokens) {
  const initTokens = tokens.slice(1);
  const overwrite = initTokens.includes("--overwrite") || initTokens.includes("-f");
  const confirmOverwrite = initTokens.includes("--confirm-overwrite");
  const pathTokens = initTokens.filter(
    (token) => token !== "--overwrite" && token !== "-f" && token !== "--confirm-overwrite"
  );
  const targetPath = pathTokens[0] ? path10.resolve(pathTokens[0]) : ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult(buildInitHelp(ctx.defaultProjectPath));
  }
  const validation = await validateInitTargetPath(targetPath);
  if (!validation.ok) {
    return textResult(validation.error);
  }
  if (overwrite && !confirmOverwrite) {
    return textResult(formatOverwriteConfirmation(targetPath));
  }
  const summary = await initializeProject(targetPath, overwrite);
  await rememberProjectSelection(ctx.api, targetPath, { initialized: true, setActive: true });
  return textResult(`${summary}

Remembered ${targetPath} as the active DWEMR project.`);
}
async function handleDoctor(ctx, tokens) {
  const runtimeBackend = resolveRuntimeBackend(ctx);
  const action = tokens[0];
  const doctorTokens = tokens.slice(1);
  const applyFix = action === "repair" || doctorTokens.includes("--fix");
  const restartRequested = action === "repair" || doctorTokens.includes("--restart");
  const noRestartRequested = doctorTokens.includes("--no-restart");
  if (restartRequested && noRestartRequested) {
    return textResult("Choose only one ACPX repair mode: `--restart` or `--no-restart`.");
  }
  const pathTokens = doctorTokens.filter((token) => token !== "--fix" && token !== "--restart" && token !== "--no-restart");
  if (pathTokens.length > 1) {
    return textResult("Too many positional arguments for `doctor`.\n" + buildRunnerHelp(ctx.defaultProjectPath));
  }
  const targetPath = pathTokens[0] ? path10.resolve(pathTokens[0]) : ctx.defaultProjectPath;
  if (targetPath && await pathExists(targetPath)) {
    const project = await inspectProjectHealth(targetPath);
    await rememberProjectSelection(ctx.api, targetPath, { initialized: project.installState !== "missing", setActive: true });
  }
  const report = await runDwemrDoctor(
    ctx.pluginConfig,
    targetPath,
    applyFix ? restartRequested || noRestartRequested ? "apply" : "preview" : "inspect",
    runtimeBackend,
    {
      stateDir: ctx.stateDir,
      api: ctx.api,
      restartBehavior: restartRequested ? "restart" : "no-restart"
    }
  );
  return textResult(formatDoctorText(report, ctx.pluginConfig, ctx.defaultProjectPath));
}
async function handleGit(ctx, tokens) {
  const subAction = tokens[1];
  if (subAction !== "disable") {
    return textResult("Usage: /dwemr git disable\nDisables git for the active DWEMR project.");
  }
  const targetPath = ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult("No active project. Run `/dwemr use <path>` or `/dwemr init <path>` first.");
  }
  const project = await inspectProjectHealth(targetPath);
  if (project.installState === "missing") {
    return textResult(`DWEMR project not initialized at ${targetPath}. Run \`/dwemr init ${targetPath}\` first.`);
  }
  await disableProjectGit(targetPath);
  return textResult(
    `Git has been disabled for ${targetPath}.

All \`scm.*\` fields in \`.dwemr/project-config.yaml\` have been set to disabled/not_available.
The delivery workflow will continue without git operations.`
  );
}
async function handleMode(ctx, tokens) {
  const modeTokens = tokens.slice(1);
  if (modeTokens.length !== 1) {
    return textResult(buildModeHelp(ctx.defaultProjectPath));
  }
  const executionMode = normalizeExecutionModeInput(modeTokens[0]);
  if (!executionMode) {
    return textResult(`Unknown execution mode: ${modeTokens[0]}
` + buildModeHelp(ctx.defaultProjectPath));
  }
  const targetPath = ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult(
      [
        "DWEMR cannot set an execution mode yet because there is no active project.",
        "",
        "Run `/dwemr init <path>` or `/dwemr use <path>` first, then retry `/dwemr mode <auto|checkpointed>`."
      ].join("\n")
    );
  }
  if (!await pathExists(targetPath)) {
    return textResult(
      [
        `The active DWEMR project path no longer exists: ${targetPath}`,
        "",
        "Run `/dwemr projects` to review remembered paths, then `/dwemr use <path>` or `/dwemr init <path>` before changing execution mode."
      ].join("\n")
    );
  }
  const project = await inspectProjectHealth(targetPath);
  if (project.installState === "missing") {
    return textResult(
      [
        `DWEMR cannot set execution mode in ${targetPath} because this project is not initialized yet.`,
        "",
        `Next: run \`/dwemr init ${targetPath}\` first.`
      ].join("\n")
    );
  }
  if (project.installState === "unsupported_contract") {
    return textResult(formatUnsupportedContract(targetPath, project, "mode"));
  }
  await updateProjectExecutionMode(targetPath, executionMode);
  await syncPipelineExecutionMode(targetPath, executionMode);
  await rememberProjectSelection(ctx.api, targetPath, { initialized: true, setActive: true });
  return textResult(
    [
      `DWEMR execution mode for ${targetPath} is now \`${executionMode}\`.`,
      executionMode === "autonomous" ? "CLI shorthand `auto` maps to the stored mode `autonomous`." : "DWEMR will now run until the next milestone, then stop and report before waiting for `/dwemr continue`."
    ].join("\n")
  );
}
function formatSessionState(state) {
  switch (state) {
    case "idle":
      return "idle";
    case "running":
      return "running";
    case "error":
      return "ERROR";
    case "stale":
      return "stale";
    case "none":
      return "not found";
    default:
      return state;
  }
}
function formatSessionInfo(session) {
  const parts = [
    `- \`${session.sessionKey}\``,
    `  State: **${formatSessionState(session.state)}**` + (session.pid ? ` | PID: ${session.pid}` : "") + (session.mode ? ` | Mode: ${session.mode}` : "") + (session.agent ? ` | Agent: ${session.agent}` : "")
  ];
  if (session.projectPath) {
    parts.push(`  Project: ${session.projectPath}` + (session.action ? ` (${session.action})` : ""));
  }
  if (session.lastActivityAt) {
    const ago = Math.round((Date.now() - session.lastActivityAt) / 1e3);
    parts.push(`  Last activity: ${ago}s ago`);
  }
  if (session.lastError) {
    parts.push(`  Last error: ${session.lastError}`);
  }
  return parts.join("\n");
}
async function handleSessions(ctx, tokens) {
  const runtimeBackend = resolveRuntimeBackend(ctx);
  if (!runtimeBackend.listSessions || !runtimeBackend.clearSessions) {
    return textResult("Session listing is only available with the ACP-native runtime backend.");
  }
  const subcommand = tokens[1]?.toLowerCase();
  if (subcommand === "clear") {
    const result = await runtimeBackend.clearSessions(ctx.stateDir);
    return textResult(
      result.closed > 0 || result.failed > 0 ? `Cleared ${result.closed} tracked DWEMR session(s).` + (result.failed > 0 ? ` ${result.failed} tracked session(s) failed to close.` : "") + " Unrelated ACP/ACPX sessions were not touched." : "No tracked DWEMR sessions to clear. Unrelated ACP/ACPX sessions were not touched."
    );
  }
  const { sessions, aggregate } = await runtimeBackend.listSessions(ctx.stateDir);
  const lines = [];
  lines.push(`ACP runtime cache: ${aggregate.activeSessions} active session(s), ${aggregate.evictedTotal} evicted total.`);
  lines.push("DWEMR lists only sessions it currently tracks for DWEMR-owned runs. Unrelated ACP/ACPX sessions are not shown here.");
  if (sessions.length === 0) {
    lines.push("", "No tracked DWEMR sessions.");
  } else {
    lines.push("", `Tracked DWEMR sessions (${sessions.length}):`);
    for (const session of sessions) {
      lines.push("", formatSessionInfo(session));
    }
  }
  lines.push("", "To clear tracked DWEMR sessions only: `/dwemr sessions clear`");
  return textResult(lines.join("\n"));
}
async function handleModelConfig(ctx, tokens) {
  const action = tokens[0];
  const targetPath = ctx.defaultProjectPath;
  if (!targetPath) {
    return textResult("No active project. Run `/dwemr use <path>` or `/dwemr init <path>` first.");
  }
  const isEffort = action === "effort";
  const items = isEffort ? DWEMR_EFFORT_LEVELS : DWEMR_MODELS.map((m) => m.id);
  const configKey = action === "model" ? "main" : action === "subagents" ? "subagents" : "effort";
  const fieldLabel = action === "model" ? "main model" : action === "subagents" ? "subagent model" : "effort level";
  const current = await readProjectModelConfig(targetPath);
  const currentValue = action === "model" ? current.model : action === "subagents" ? current.subagentModel : current.effortLevel;
  const selectionToken = tokens[1];
  if (!selectionToken) {
    const listLines = [
      `DWEMR ${fieldLabel} for ${targetPath}:`,
      `Current: ${currentValue ?? "(openclaw default)"}`,
      "",
      ...items.map((item, i) => {
        const label = isEffort ? item : `${DWEMR_MODELS[i].label} (${item})`;
        return `${i + 1}. ${label}${item === currentValue ? " \u2713" : ""}`;
      }),
      "",
      `Use \`/dwemr ${action} <number>\` to select, or \`/dwemr ${action} unset\` to clear.`
    ];
    return textResult(listLines.join("\n"));
  }
  if (selectionToken === "unset") {
    await updateProjectModelField(targetPath, configKey, void 0);
    return textResult(`Cleared ${fieldLabel} for ${targetPath}. Will use openclaw default.`);
  }
  const selectionIndex = parseInt(selectionToken, 10) - 1;
  if (isNaN(selectionIndex) || selectionIndex < 0 || selectionIndex >= items.length) {
    return textResult(`Invalid selection. Choose a number between 1 and ${items.length}, or \`unset\` to clear.`);
  }
  const selected = items[selectionIndex];
  await updateProjectModelField(targetPath, configKey, selected);
  const selectedLabel = isEffort ? selected : `${DWEMR_MODELS[selectionIndex].label} (${selected})`;
  return textResult(`DWEMR ${fieldLabel} for ${targetPath} is now \`${selectedLabel}\`.`);
}
async function handleGenericRouted(ctx, tokens) {
  const runtimeBackend = resolveRuntimeBackend(ctx);
  const action = tokens[0];
  const mapped = mapActionToClaudeCommand(action, void 0, tokens, ctx.defaultProjectPath);
  if ("error" in mapped) {
    return textResult(mapped.error);
  }
  let project = await inspectProjectHealth(mapped.targetPath);
  if (project.exists) {
    await rememberProjectSelection(ctx.api, mapped.targetPath, { initialized: project.installState !== "missing", setActive: true });
  }
  if (project.installState === "unsupported_contract") {
    return textResult(formatUnsupportedContract(mapped.targetPath, project, action));
  }
  if (project.installState === "bootstrap_only") {
    if (action === "status") {
      const activeRun = await runtimeBackend.findActiveRun(ctx.stateDir, mapped.targetPath);
      let activeRunInfo = "";
      if (activeRun) {
        const startedAt = new Date(activeRun.startedAt).toLocaleTimeString();
        const descriptor = formatRuntimeOwnerDescriptor(activeRun);
        activeRunInfo = `

Active runtime owner: ${descriptor} (${activeRun.action}) \u2014 started ${startedAt}`;
      } else if (project.onboardingState.status === "awaiting_clarification") {
        activeRunInfo = "\n\nActive runtime owner: none (waiting on onboarding clarification from saved DWEMR state)";
      } else {
        activeRunInfo = "\n\nActive runtime owner: none";
      }
      return textResult(formatBootstrapPendingStatus(mapped.targetPath, project) + activeRunInfo);
    }
    if (ACTIONS_BLOCKED_UNTIL_ONBOARDING.has(action)) {
      return textResult(formatOnboardingBlocked(mapped.targetPath, action, project));
    }
    if (project.onboardingState.status !== "complete" && ACTIONS_THAT_SURFACE_PENDING_ONBOARDING.has(action)) {
      return textResult(formatPendingOnboardingEntry(mapped.targetPath, action, project));
    }
    if (ACTIONS_THAT_MAY_PROVISION_BOOTSTRAP_PROJECT.has(action)) {
      const ensured = await ensureProfileProvisioned(
        ctx.pluginConfig,
        ctx.stateDir,
        mapped.targetPath,
        ctx.defaultProjectPath,
        action,
        runtimeBackend,
        mapped.requestText
      );
      if ("error" in ensured) {
        return textResult(ensured.error);
      }
      project = ensured.project;
      await rememberProjectSelection(ctx.api, mapped.targetPath, { initialized: true, setActive: true });
    }
  }
  if (RELEASE_LANE_ACTIONS.has(action) && project.installState === "profile_installed") {
    const scmConfig = await readProjectScmConfig(mapped.targetPath);
    if (!isGitEnabled(scmConfig)) {
      return textResult(
        [
          `Git is not enabled for ${mapped.targetPath}.`,
          "",
          `The \`${action}\` command requires git to be enabled in \`.dwemr/project-config.yaml\`.`,
          "",
          "To enable git, re-run onboarding with `/dwemr start <request>` and select a git-enabled workflow."
        ].join("\n")
      );
    }
  }
  if (action === "status" && project.installState === "profile_installed") {
    const [brief, activeRun] = await Promise.all([
      readPipelineStateBrief(mapped.targetPath),
      runtimeBackend.findActiveRun(ctx.stateDir, mapped.targetPath)
    ]);
    let activeRunInfo;
    if (activeRun) {
      const startedAt = new Date(activeRun.startedAt).toLocaleTimeString();
      const descriptor = formatRuntimeOwnerDescriptor(activeRun);
      activeRunInfo = `${descriptor} (${activeRun.action}) \u2014 started ${startedAt}`;
    } else if (brief?.milestoneKind === "user_input_required") {
      activeRunInfo = "none (waiting on user input from saved DWEMR state)";
    } else {
      activeRunInfo = "none (no runtime owner in flight)";
    }
    const snapshot = brief ? formatPipelineStateBrief(brief, activeRunInfo) : `Runtime owner: ${activeRunInfo}`;
    const claudeText = await runWithPreflight(
      ctx.pluginConfig,
      ctx.stateDir,
      mapped.targetPath,
      ctx.defaultProjectPath,
      action,
      mapped.claudeCommand,
      runtimeBackend
    );
    return textResult(`${snapshot}

${claudeText}`);
  }
  if (action === "continue" && project.installState === "profile_installed") {
    const brief = await readPipelineStateBrief(mapped.targetPath);
    if (brief?.milestoneKind === "user_input_required") {
      const pendingQuestion = brief.milestoneSummary || "User input required";
      const injectedContext = `## Pending user input
Question: ${pendingQuestion}

Use AskUserQuestion to get the user's answer in this session before continuing the pipeline.

`;
      if (EXECUTION_MODE_REFRESH_ACTIONS.has(action) && project.installState === "profile_installed") {
        await refreshPipelineExecutionMode(mapped.targetPath);
      }
      return runWithEnoentFallback(ctx, mapped.targetPath, action, mapped.claudeCommand, runtimeBackend, { prefixText: injectedContext });
    }
  }
  if (EXECUTION_MODE_REFRESH_ACTIONS.has(action) && project.installState === "profile_installed") {
    await refreshPipelineExecutionMode(mapped.targetPath);
  }
  return runWithEnoentFallback(ctx, mapped.targetPath, action, mapped.claudeCommand, runtimeBackend);
}

// index.ts
function toRuntimeToolContext(toolContext) {
  if (!toolContext) {
    return void 0;
  }
  return {
    sessionKey: toolContext.sessionKey,
    deliveryContext: toolContext.deliveryContext
  };
}
var index_default = definePluginEntry({
  id: "dwemr",
  name: "Delivery Workflow Engine & Memory Relay (DWEMR)",
  description: "DWEMR is an OpenClaw-to-Claude delivery bridge that initializes projects, routes `/dwemr` actions, and lets Claude Code own the internal workflow.",
  register(api) {
    api.registerTool((toolContext) => ({
      name: "dwemr_command",
      label: "DWEMR Command",
      description: "Deterministic /dwemr command dispatcher.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string" },
          commandName: { type: "string" },
          skillName: { type: "string" }
        }
      },
      async execute(_id, params) {
        const pluginConfig = getPluginConfig(api);
        const stateDir = api.runtime.state.resolveStateDir();
        const defaultProjectPath = await getDefaultProjectPath(api);
        const tokens = tokenizeRawArgs(params.command ?? "");
        const ctx = {
          pluginConfig,
          stateDir,
          defaultProjectPath,
          api,
          runtimeContext: {
            api,
            toolContext: toRuntimeToolContext(toolContext)
          }
        };
        if (tokens.length === 0) return handleEmptyCommand(ctx);
        const action = tokens[0];
        if (action === "help") return handleHelp(ctx);
        if (action === "projects") return handleProjects(ctx);
        if (action === "mode") return handleMode(ctx, tokens);
        if (action === "sessions") return handleSessions(ctx, tokens);
        if (action === "use") return handleUse(ctx, tokens);
        if (action === "doctor" || action === "repair") return handleDoctor(ctx, tokens);
        if (action === "stop") return handleStop(ctx, tokens);
        if (action === "init") return handleInit(ctx, tokens);
        if (action === "model" || action === "subagents" || action === "effort") return handleModelConfig(ctx, tokens);
        if (action === "git") return handleGit(ctx, tokens);
        return handleGenericRouted(ctx, tokens);
      }
    }));
    api.registerTool((_toolContext) => ({
      name: "dwemr_init",
      label: "DWEMR Init",
      description: "Initialize a target project with the DWEMR Claude-native bootstrap assets from this package.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          targetPath: {
            type: "string",
            description: "Absolute or relative path to the project to initialize."
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite existing installed DWEMR bootstrap files when true."
          },
          confirmOverwrite: {
            type: "boolean",
            description: "Required confirmation when overwrite is true because destructive init recreates the target folder from scratch."
          }
        },
        required: ["targetPath"]
      },
      async execute(_id, params) {
        const targetPath = path11.resolve(params.targetPath);
        const overwrite = params.overwrite ?? false;
        const confirmOverwrite = params.confirmOverwrite ?? false;
        const validation = await validateInitTargetPath(targetPath);
        if (!validation.ok) {
          return textResult(validation.error);
        }
        if (overwrite && !confirmOverwrite) {
          return textResult(formatOverwriteConfirmation(targetPath));
        }
        const summary = await initializeProject(targetPath, overwrite);
        await rememberProjectSelection(api, targetPath, { initialized: true, setActive: true });
        return textResult(`${summary}

Remembered ${targetPath} as the active DWEMR project.`);
      }
    }));
  }
});
export {
  index_default as default
};
