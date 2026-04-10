import type { DwemrClaudeModelConfig } from "../backend/claude-runner";
import { getActiveProjectPath, listRememberedProjects, loadProjectMemory, rememberProject, saveProjectMemory, type DwemrProjectMemoryConfig } from "./project-memory";
import type { DwemrRuntimeConfig } from "../backend/runtime";

export type DwemrPluginConfig = DwemrRuntimeConfig & DwemrClaudeModelConfig & DwemrProjectMemoryConfig;

export type DwemrPluginApi = {
  pluginConfig?: DwemrPluginConfig;
  runtime: {
    state: {
      resolveStateDir: () => string;
    };
  };
};

function asPluginApi(api: unknown): DwemrPluginApi {
  if (
    typeof api !== "object" || api === null ||
    !("runtime" in api) ||
    typeof (api as Record<string, unknown>).runtime !== "object"
  ) {
    throw new Error("DWEMR plugin received an invalid API object. Check OpenClaw gateway compatibility.");
  }
  return api as DwemrPluginApi;
}

export function getPluginConfig(api: unknown) {
  return asPluginApi(api).pluginConfig ?? {};
}

export async function loadRememberedProjectMemory(api: unknown) {
  const pluginApi = asPluginApi(api);
  return loadProjectMemory(pluginApi.runtime.state.resolveStateDir(), pluginApi.pluginConfig ?? {});
}

export async function rememberProjectSelection(api: unknown, projectPath: string, options: { initialized?: boolean; setActive?: boolean } = {}) {
  const pluginApi = asPluginApi(api);
  const current = await loadRememberedProjectMemory(api);
  const next = rememberProject(current, projectPath, {
    initialized: options.initialized,
    setActive: options.setActive ?? true,
  });
  const saved = await saveProjectMemory(pluginApi.runtime.state.resolveStateDir(), next);
  pluginApi.pluginConfig = {
    ...(pluginApi.pluginConfig ?? {}),
    ...saved,
  };
  return saved;
}

export async function getDefaultProjectPath(api: unknown) {
  return getActiveProjectPath(await loadRememberedProjectMemory(api));
}

export async function formatProjectsText(api: unknown) {
  const projectMemory = await loadRememberedProjectMemory(api);
  const activeProjectPath = getActiveProjectPath(projectMemory);
  const projects = listRememberedProjects(projectMemory);

  if (projects.length === 0) {
    return [
      "DWEMR remembered projects:",
      "- none",
      "",
      "Run `/dwemr init <path>` or `/dwemr use <path>` to remember a project.",
    ].join("\n");
  }

  return [
    "DWEMR remembered projects:",
    ...projects.map((project) => {
      const tags = [
        project.path === activeProjectPath ? "active" : undefined,
        project.initialized ? "initialized" : undefined,
      ].filter(Boolean);
      return `- ${project.path}${tags.length > 0 ? ` (${tags.join(", ")})` : ""}`;
    }),
  ].join("\n");
}
