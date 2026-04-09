import path from "node:path";

export type ClaudeCommandMapping = {
  targetPath: string;
  claudeCommand: string;
  requestText?: string;
};

export type ClaudeCommandMappingResult = ClaudeCommandMapping | { error: string };

export function tokenizeRawArgs(input: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
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

export function formatUsage() {
  return formatUsageForProject(undefined);
}

function formatProjectScopedUsage(command: string, suffix: string, defaultProjectPath: string | undefined) {
  return `- /dwemr ${command}${defaultProjectPath ? "" : " [path]"}${suffix ? ` ${suffix}` : ""}`;
}

function formatProjectScopedHelp(command: string, suffix: string, description: string, defaultProjectPath: string | undefined) {
  return `- ${command}${defaultProjectPath ? "" : " [path]"}${suffix ? ` ${suffix}` : ""}: ${description}`;
}

function formatUsageForProject(defaultProjectPath: string | undefined) {
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
    "- /dwemr git disable",
  ].join("\n");
}

export function formatHelpText(defaultProjectPath: string | undefined) {
  const lines = [
    "DWEMR commands:",
    "- doctor [path] [--fix] [--restart|--no-restart]: inspect the DWEMR runtime, preview ACPX permission repair, and optionally self-heal it",
    "- init [path] [--overwrite] [--confirm-overwrite]: install the DWEMR bootstrap kit; overwrite recreates the target folder from scratch",
    "- mode <auto|checkpointed>: set the execution mode for the active DWEMR project",
    "- session <stateless|stateful>: set the ACP session mode for the active DWEMR project",
    "- sessions [clear]: list ACP sessions tracked by DWEMR, or clear them all",
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
    "- git disable: disable git for the active DWEMR project",
  ];

  if (defaultProjectPath) {
    lines.push("", `Active DWEMR project: ${defaultProjectPath}`);
  }

  return lines.join("\n");
}

export function resolveProjectPath(inputPath: string | undefined, defaultProjectPath: string | undefined) {
  if (inputPath) {
    return path.resolve(inputPath);
  }
  return defaultProjectPath;
}

export function buildInitHelp(defaultProjectPath: string | undefined) {
  const lines = [
    "Usage: /dwemr init <path> [--overwrite] [--confirm-overwrite]",
    "Example: /dwemr init /absolute/path/to/project",
    "Behavior: installs the DWEMR bootstrap kit; onboarding provisions the selected workflow profile later.",
    "Overwrite: `--overwrite` is destructive and recreates the target project folder from scratch. It requires `--confirm-overwrite`.",
    "Note: DWEMR creates only the final project folder. Parent directories must already exist.",
  ];
  if (defaultProjectPath) {
    lines.push(`Configured default project path: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}

export function buildModeHelp(defaultProjectPath: string | undefined) {
  const lines = [
    "Usage: /dwemr mode <auto|checkpointed>",
    "Example: /dwemr mode checkpointed",
    "Behavior: updates `.dwemr/project-config.yaml` for the active DWEMR project.",
  ];
  if (defaultProjectPath) {
    lines.push(`Active DWEMR project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}

export function buildSessionHelp(defaultProjectPath: string | undefined) {
  const lines = [
    "Usage: /dwemr session <stateless|stateful>",
    "Example: /dwemr session stateful",
    "Behavior: updates `runtime.session_mode` in `.dwemr/project-config.yaml`.",
    "",
    "- stateless (default): each command creates a fresh ACP session.",
    "- stateful: onboarding uses persistent ACP sessions to maintain conversation context across clarification rounds.",
  ];
  if (defaultProjectPath) {
    lines.push(`Active DWEMR project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}

export function buildRunnerHelp(defaultProjectPath: string | undefined) {
  const lines = [formatUsageForProject(defaultProjectPath), "", "Use `/dwemr help` for a short explanation of each command."];
  if (defaultProjectPath) {
    lines.push("", `Active DWEMR project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}

function looksLikeExplicitPath(token: string) {
  return (
    token === "." ||
    token === ".." ||
    token.startsWith("/") ||
    token.startsWith("./") ||
    token.startsWith("../") ||
    token.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/.test(token)
  );
}

export function buildUseHelp(defaultProjectPath: string | undefined) {
  const lines = [
    "Usage: /dwemr use <path>",
    "Example: /dwemr use /absolute/path/to/project",
  ];
  if (defaultProjectPath) {
    lines.push(`Current active project: ${defaultProjectPath}`);
  }
  return lines.join("\n");
}

function formatMissingActiveProjectError(action: string, defaultProjectPath: string | undefined) {
  if (defaultProjectPath) {
    return "Project path is required.\n" + buildRunnerHelp(defaultProjectPath);
  }

  return [
    `DWEMR cannot run \`${action}\` yet because there is no active project.`,
    "",
    "Run `/dwemr init <path>` first to initialize a project and make it active.",
    "If you already initialized a project earlier, run `/dwemr use <path>` to make it active again.",
    "",
    buildRunnerHelp(defaultProjectPath),
  ].join("\n");
}

export function mapActionToClaudeCommand(action: string, targetPath: string | undefined, tokens: string[], defaultProjectPath: string | undefined): ClaudeCommandMappingResult {
  const separatorIndex = tokens.indexOf("--");
  const afterAction = tokens.slice(1);

  const commandMap: Record<string, string> = {
    status: "/delivery-status",
    "what-now": "/delivery-what-now",
    continue: "/delivery-continue",
    implement: "/delivery-implement",
    release: "/delivery-release",
    pr: "/delivery-pr",
  };

  if (action === "start" || action === "plan") {
    let explicitPath = targetPath;
    let requestTokens: string[] = [];

    if (separatorIndex >= 0) {
      const beforeSeparator = tokens.slice(1, separatorIndex);
      if (beforeSeparator.length > 1) {
        return { error: "Too many positional arguments before `--`.\n" + buildRunnerHelp(defaultProjectPath) };
      }
      explicitPath = explicitPath ?? beforeSeparator[0];
      requestTokens = tokens.slice(separatorIndex + 1);
    } else if (!explicitPath && afterAction.length > 1 && looksLikeExplicitPath(afterAction[0])) {
      explicitPath = afterAction[0];
      requestTokens = afterAction.slice(1);
    } else {
      requestTokens = afterAction;
    }

    const resolvedPath = resolveProjectPath(explicitPath, defaultProjectPath);
    if (!resolvedPath) {
      return { error: formatMissingActiveProjectError(action, defaultProjectPath) };
    }

    const request = requestTokens.join(" ").trim();
    if (!request) {
      return { error: `A request is required for \`${action}\`.\n` + buildRunnerHelp(defaultProjectPath) };
    }
    return {
      targetPath: resolvedPath,
      claudeCommand: action === "start" ? `/delivery-start ${request}` : `/delivery-plan ${request}`,
      requestText: request,
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
    return { error: `Unknown DWEMR action: ${action}\n` + buildRunnerHelp(defaultProjectPath) };
  }

  return { targetPath: resolvedPath, claudeCommand };
}
