import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkflowProfile } from "../../install-packs";

export type DwemrExecutionMode = "autonomous" | "checkpointed";
export type DwemrProjectSize = WorkflowProfile;

export const DEFAULT_EXECUTION_MODE: DwemrExecutionMode = "autonomous";
export const PROJECT_CONFIG_RELATIVE_PATH = path.join(".dwemr", "project-config.yaml");

function splitLines(raw: string) {
  return raw.replace(/\r\n/g, "\n").split("\n");
}

function matchesYamlField(line: string, key: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith(`${key}:`) && line.length - trimmed.length === 2;
}

function extractYamlFieldValue(line: string, key: string): string | undefined {
  if (!matchesYamlField(line, key)) return undefined;
  const raw = line.slice(line.indexOf(":") + 1).trim().replace(/^["']|["']$/g, "").replace(/#.*$/, "").trim();
  return raw || undefined;
}

function isTopLevelSection(line: string) {
  return /^[A-Za-z0-9_-]+:\s*$/.test(line.trim()) && !line.startsWith(" ");
}

function findTopLevelSection(lines: string[], targetKey: string) {
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

function findDeliverySection(lines: string[]) {
  return findTopLevelSection(lines, "delivery");
}

function findProjectSection(lines: string[]) {
  return findTopLevelSection(lines, "project");
}

export function normalizeExecutionModeInput(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  if (normalized === "auto" || normalized === "autonomous") {
    return "autonomous" satisfies DwemrExecutionMode;
  }
  if (normalized === "checkpointed") {
    return "checkpointed" satisfies DwemrExecutionMode;
  }
  return;
}

export function normalizeProjectSizeInput(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "unset") {
    return;
  }
  if (normalized === "minimal_tool" || normalized === "standard_app") {
    return normalized satisfies DwemrProjectSize;
  }
  return;
}

export function parseProjectExecutionMode(raw: string) {
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

export function parseProjectSize(raw: string) {
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

export function setProjectExecutionMode(raw: string, executionMode: DwemrExecutionMode) {
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

export function setProjectSize(raw: string, projectSize: DwemrProjectSize) {
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

export type DwemrProjectModelConfig = {
  model?: string;
  subagentModel?: string;
  effortLevel?: string;
};

function findModelsSection(lines: string[]) {
  return findTopLevelSection(lines, "models");
}

export function parseProjectModelConfig(raw: string): DwemrProjectModelConfig {
  const lines = splitLines(raw);
  const { start, end } = findModelsSection(lines);
  if (start < 0) {
    return {};
  }

  const result: DwemrProjectModelConfig = {};
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

function setModelsField(raw: string, key: string, value: string | undefined): string {
  const lines = splitLines(raw);
  const { start, end } = findModelsSection(lines);

  for (let index = start + 1; index < end; index += 1) {
    if (matchesYamlField(lines[index], key)) {
      if (value === undefined) {
        lines.splice(index, 1);
      } else {
        lines[index] = `  ${key}: ${value}`;
      }
      return lines.join("\n");
    }
  }

  if (value === undefined) {
    return raw;
  }

  if (start < 0) {
    const prefix = lines.length > 0 && lines[lines.length - 1].trim().length > 0 ? [""] : [];
    return [...lines, ...prefix, "models:", `  ${key}: ${value}`].join("\n");
  }

  lines.splice(end, 0, `  ${key}: ${value}`);
  return lines.join("\n");
}

export type DwemrScmConfig = {
  gitMode: string;
  github: string;
  remotePush: string;
  pullRequests: string;
  ci: string;
  merge: string;
};

const SCM_DEFAULTS: DwemrScmConfig = {
  gitMode: "unset",
  github: "unset",
  remotePush: "unset",
  pullRequests: "unset",
  ci: "unset",
  merge: "unset",
};

const SCM_DISABLED: DwemrScmConfig = {
  gitMode: "disabled",
  github: "not_available",
  remotePush: "disabled",
  pullRequests: "disabled",
  ci: "disabled",
  merge: "disabled",
};

function findScmSection(lines: string[]) {
  return findTopLevelSection(lines, "scm");
}

function parseScmField(lines: string[], start: number, end: number, key: string, fallback: string): string {
  for (let index = start + 1; index < end; index += 1) {
    const value = extractYamlFieldValue(lines[index], key);
    if (value) return value;
  }
  return fallback;
}

export function parseProjectScmConfig(raw: string): DwemrScmConfig {
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
    merge: parseScmField(lines, start, end, "merge", "unset"),
  };
}

function setScmField(raw: string, key: string, value: string): string {
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

function setAllScmFields(raw: string, config: DwemrScmConfig): string {
  let result = raw;
  result = setScmField(result, "git_mode", config.gitMode);
  result = setScmField(result, "github", config.github);
  result = setScmField(result, "remote_push", config.remotePush);
  result = setScmField(result, "pull_requests", config.pullRequests);
  result = setScmField(result, "ci", config.ci);
  result = setScmField(result, "merge", config.merge);
  return result;
}

export function resolveProjectConfigPath(targetPath: string) {
  return path.join(targetPath, PROJECT_CONFIG_RELATIVE_PATH);
}

export async function readProjectModelConfig(targetPath: string): Promise<DwemrProjectModelConfig> {
  try {
    const raw = await readFile(resolveProjectConfigPath(targetPath), "utf8");
    return parseProjectModelConfig(raw);
  } catch {
    return {};
  }
}

export async function updateProjectModelField(targetPath: string, key: "main" | "subagents" | "effort", value: string | undefined) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile(configPath, "utf8");
  const next = setModelsField(raw, key, value);
  await writeFile(configPath, next, "utf8");
}

export async function readProjectExecutionMode(targetPath: string) {
  const raw = await readFile(resolveProjectConfigPath(targetPath), "utf8");
  return parseProjectExecutionMode(raw);
}

export async function readProjectSize(targetPath: string) {
  const raw = await readFile(resolveProjectConfigPath(targetPath), "utf8");
  return parseProjectSize(raw);
}

export async function updateProjectExecutionMode(targetPath: string, executionMode: DwemrExecutionMode) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile(configPath, "utf8");
  const next = setProjectExecutionMode(raw, executionMode);
  await writeFile(configPath, next, "utf8");
  return {
    configPath,
    executionMode,
  };
}

export async function updateProjectSize(targetPath: string, projectSize: DwemrProjectSize) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile(configPath, "utf8");
  const next = setProjectSize(raw, projectSize);
  await writeFile(configPath, next, "utf8");
  return {
    configPath,
    projectSize,
  };
}

export async function readProjectScmConfig(targetPath: string): Promise<DwemrScmConfig> {
  try {
    const raw = await readFile(resolveProjectConfigPath(targetPath), "utf8");
    return parseProjectScmConfig(raw);
  } catch {
    return { ...SCM_DEFAULTS };
  }
}

export function isGitEnabled(scmConfig: DwemrScmConfig): boolean {
  return scmConfig.gitMode !== "unset" && scmConfig.gitMode !== "disabled";
}

export async function disableProjectGit(targetPath: string) {
  const configPath = resolveProjectConfigPath(targetPath);
  const raw = await readFile(configPath, "utf8");
  const next = setAllScmFields(raw, SCM_DISABLED);
  await writeFile(configPath, next, "utf8");
  return { configPath };
}
