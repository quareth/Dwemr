import type { DwemrExecutionMode } from "../control-plane/project-config";
import type { ProjectHealth } from "../control-plane/project-assets";

export type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type ClaudeRuntimeProbe =
  | { status: "skipped"; detail: string }
  | { status: "ok"; detail: string; result: ProcessResult }
  | { status: "failed"; detail: string; result?: ProcessResult };

export type DwemrClaudeModelConfig = {
  model?: string;
  subagentModel?: string;
  effortLevel?: string;
};

export type ClaudeCommandRunOptions = {
  timeoutMs?: number | null;
  stateDir?: string;
  action?: string;
  executionMode?: DwemrExecutionMode;
};

const deliveryToDwemrLiteralTranslations: Array<[RegExp, string]> = [
  [/\/delivery-driver onboarding\b/g, "DWEMR onboarding"],
  [/\/delivery-driver\b/g, "DWEMR driver"],
  [/\/delivery-pr\b/g, "/dwemr pr"],
  [/\/delivery-what-now\b/g, "/dwemr what-now"],
  [/\/delivery-continue\b/g, "/dwemr continue"],
  [/\/delivery-implement\b/g, "/dwemr implement"],
  [/\/delivery-release\b/g, "/dwemr release"],
  [/\/delivery-status\b/g, "/dwemr status"],
];

const LEGACY_SPAWN_DISABLED_MESSAGE =
  "Legacy spawn runtime execution is disabled in this secure DWEMR build. "
  + "Use ACP-native runtime (runtimeBackend: \"acp-native\").";

function translateParameterizedDeliveryCommand(text: string, commandName: "start" | "plan", publicPrefix: string) {
  return text.replace(new RegExp(String.raw`/delivery-${commandName}(?:(\s+)([^\n\r` + "`" + String.raw`]+))?`, "g"), (_match, spacing?: string, args?: string) => {
    const trimmedArgs = args?.trim();
    if (!trimmedArgs) {
      return `${publicPrefix} <request>`;
    }
    return `${publicPrefix}${spacing ?? " "}${trimmedArgs}`;
  });
}

export function translateClaudeCommandSurface(text: string) {
  let translated = translateParameterizedDeliveryCommand(text, "start", "/dwemr start");
  translated = translateParameterizedDeliveryCommand(translated, "plan", "/dwemr plan");

  for (const [pattern, replacement] of deliveryToDwemrLiteralTranslations) {
    translated = translated.replace(pattern, replacement);
  }

  return translated;
}

export async function probeClaudeRuntime(_command: string, _targetPath: string, project: ProjectHealth, _config: DwemrClaudeModelConfig = {}): Promise<ClaudeRuntimeProbe> {
  if (!project.exists) {
    return { status: "skipped", detail: "Skipped because the target project path does not exist." };
  }
  if (project.installState === "missing") {
    return { status: "skipped", detail: "Skipped because DWEMR project assets are not installed yet." };
  }
  if (project.installState === "unsupported_contract") {
    return {
      status: "skipped",
      detail: "Skipped because the project uses an unsupported DWEMR state contract. Re-run `/dwemr init <path> --overwrite --confirm-overwrite` first.",
    };
  }

  const result: ProcessResult = {
    exitCode: 1,
    stdout: "",
    stderr: LEGACY_SPAWN_DISABLED_MESSAGE,
    timedOut: false,
  };

  return {
    status: "failed",
    detail: LEGACY_SPAWN_DISABLED_MESSAGE,
    result,
  };
}

export async function runClaudeCommand(
  _command: string,
  _targetPath: string,
  _claudeCommand: string,
  _config: DwemrClaudeModelConfig = {},
  _options: ClaudeCommandRunOptions = {},
): Promise<ProcessResult> {
  return {
    exitCode: 1,
    stdout: "",
    stderr: LEGACY_SPAWN_DISABLED_MESSAGE,
    timedOut: false,
  };
}

export function formatRunnerResult(claudeCommand: string, exitCode: number, stdout: string, stderr: string, timedOut: boolean) {
  const publicCommand = translateClaudeCommandSurface(claudeCommand);

  if (exitCode === 0 && !timedOut && stdout) {
    return translateClaudeCommandSurface(stdout);
  }

  const lines = [`DWEMR failed to run \`${publicCommand}\` in Claude.`, `Exit code: \`${exitCode}\``];

  if (timedOut) {
    lines.push("The command timed out before Claude returned a final response.");
  }

  if (stdout) {
    lines.push(`Stdout:\n${translateClaudeCommandSurface(stdout)}`);
  } else {
    lines.push("Stdout: (empty)");
  }

  if (stderr) {
    lines.push(`Stderr:\n${translateClaudeCommandSurface(stderr)}`);
  }

  return lines.join("\n\n");
}
