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
