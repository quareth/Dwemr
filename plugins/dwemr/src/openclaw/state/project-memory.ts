import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type DwemrRememberedProject = {
  path: string;
  addedAt: string;
  lastUsedAt: string;
  initialized?: boolean;
};

export type DwemrProjectMemoryConfig = {
  activeProjectPath?: string;
  defaultProjectPath?: string;
  projects?: DwemrRememberedProject[];
};

const PROJECT_MEMORY_RELATIVE_PATH = path.join("tools", "dwemr", "projects.json");

function normalizeProjectRecord(raw: Partial<DwemrRememberedProject>) {
  if (typeof raw.path !== "string" || raw.path.trim().length === 0) {
    return;
  }

  const normalizedPath = path.resolve(raw.path);
  return {
    path: normalizedPath,
    addedAt: typeof raw.addedAt === "string" && raw.addedAt.trim().length > 0 ? raw.addedAt : new Date(0).toISOString(),
    lastUsedAt: typeof raw.lastUsedAt === "string" && raw.lastUsedAt.trim().length > 0 ? raw.lastUsedAt : new Date(0).toISOString(),
    initialized: raw.initialized === true ? true : undefined,
  } satisfies DwemrRememberedProject;
}

export function listRememberedProjects(config: DwemrProjectMemoryConfig) {
  const deduped = new Map<string, DwemrRememberedProject>();

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
      initialized: existing.initialized || project.initialized ? true : undefined,
    });
  }

  const activeProjectPath = getActiveProjectPath(config);
  if (activeProjectPath && !deduped.has(activeProjectPath)) {
    const now = new Date(0).toISOString();
    deduped.set(activeProjectPath, {
      path: activeProjectPath,
      addedAt: now,
      lastUsedAt: now,
    });
  }

  return [...deduped.values()].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}

export function getActiveProjectPath(config: DwemrProjectMemoryConfig) {
  const active = config.activeProjectPath?.trim();
  if (active) {
    return path.resolve(active);
  }

  const fallback = config.defaultProjectPath?.trim();
  return fallback ? path.resolve(fallback) : undefined;
}

export function resolveProjectMemoryPath(stateDir: string) {
  return path.join(stateDir, PROJECT_MEMORY_RELATIVE_PATH);
}

export function normalizeProjectMemory(config: DwemrProjectMemoryConfig) {
  const activeProjectPath = getActiveProjectPath(config);
  const projects = listRememberedProjects(config);

  return {
    activeProjectPath,
    defaultProjectPath: config.defaultProjectPath?.trim() ? path.resolve(config.defaultProjectPath) : activeProjectPath,
    projects,
  } satisfies DwemrProjectMemoryConfig;
}

export function mergeProjectMemory(primary: DwemrProjectMemoryConfig, fallback: DwemrProjectMemoryConfig) {
  return normalizeProjectMemory({
    activeProjectPath: primary.activeProjectPath ?? fallback.activeProjectPath,
    defaultProjectPath: primary.defaultProjectPath ?? fallback.defaultProjectPath,
    projects: [...(primary.projects ?? []), ...(fallback.projects ?? [])],
  });
}

export function rememberProject(
  config: DwemrProjectMemoryConfig,
  projectPath: string,
  options: {
    setActive?: boolean;
    initialized?: boolean;
    usedAt?: string;
  } = {},
) {
  const normalizedPath = path.resolve(projectPath);
  const timestamp = options.usedAt ?? new Date().toISOString();
  const projects = listRememberedProjects(config);
  const existing = projects.find((project) => project.path === normalizedPath);

  const nextProjects = [
    ...projects.filter((project) => project.path !== normalizedPath),
    {
      path: normalizedPath,
      addedAt: existing?.addedAt ?? timestamp,
      lastUsedAt: timestamp,
      initialized: options.initialized === true || existing?.initialized === true ? true : undefined,
    } satisfies DwemrRememberedProject,
  ].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));

  return {
    ...config,
    projects: nextProjects,
    activeProjectPath: options.setActive ? normalizedPath : getActiveProjectPath(config),
    defaultProjectPath: options.setActive ? normalizedPath : getActiveProjectPath(config) ?? config.defaultProjectPath,
  } satisfies DwemrProjectMemoryConfig;
}

export async function loadProjectMemory(stateDir: string, fallbackConfig: DwemrProjectMemoryConfig = {}) {
  const targetPath = resolveProjectMemoryPath(stateDir);

  try {
    const raw = await readFile(targetPath, "utf8");
    const parsed = JSON.parse(raw) as DwemrProjectMemoryConfig;
    return mergeProjectMemory(normalizeProjectMemory(parsed), normalizeProjectMemory(fallbackConfig));
  } catch {
    return normalizeProjectMemory(fallbackConfig);
  }
}

export async function saveProjectMemory(stateDir: string, config: DwemrProjectMemoryConfig) {
  const targetPath = resolveProjectMemoryPath(stateDir);
  const normalized = normalizeProjectMemory(config);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

