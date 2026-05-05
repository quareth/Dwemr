import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapGlobalMemorySeeds,
  bootstrapStateSeeds,
  standardAppStateSeeds,
} from "./src/control-plane/seed-data";

export type WorkflowProfile = "minimal_tool" | "standard_app";
export type InstallStage = "bootstrap_only" | "provisioning_pending" | "profile_installed";
export type CapabilityPack = "standard-app-focused-planning";
export type InstallPackName =
  | "bootstrap"
  | "profile-minimal-tool"
  | "profile-standard-app"
  | CapabilityPack;
export type ProjectInstallState = "missing" | "bootstrap_only" | "profile_installed" | "unsupported_contract";

export type InstallEntry =
  | {
      type: "copy";
      sourcePath: string;
      targetPath: string;
    }
  | {
      type: "seed";
      targetPath: string;
      content: string;
    };

export type InstallPackDefinition = {
  name: InstallPackName;
  entries: InstallEntry[];
  requiredPaths: string[];
};

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginAssetRoot = path.basename(pluginRoot) === "dist" ? path.dirname(pluginRoot) : pluginRoot;
const templateRoot = path.join(pluginAssetRoot, "templates");
export const ACTIVE_QUALITY_RUNBOOK_PATH = "docs/runbooks/active-quality-runbook.md";

function templateAsset(relativePath: string): InstallEntry {
  return {
    type: "copy",
    sourcePath: path.join(templateRoot, relativePath),
    targetPath: relativePath,
  };
}

function templateAssetAs(sourceRelativePath: string, targetPath: string): InstallEntry {
  return {
    type: "copy",
    sourcePath: path.join(templateRoot, sourceRelativePath),
    targetPath,
  };
}

function pluginAsset(sourceRelativePath: string, targetPath: string): InstallEntry {
  return {
    type: "copy",
    sourcePath: path.join(pluginAssetRoot, sourceRelativePath),
    targetPath,
  };
}

function seedEntries(seedMap: Record<string, string>) {
  return Object.entries(seedMap).map(
    ([targetPath, content]) =>
      ({
        type: "seed",
        targetPath,
        content,
      }) satisfies InstallEntry,
  );
}

function requiredPaths(entries: InstallEntry[]) {
  return entries.map((entry) => entry.targetPath);
}

function definePack(name: InstallPackName, entries: InstallEntry[]): InstallPackDefinition {
  return {
    name,
    entries,
    requiredPaths: requiredPaths(entries),
  };
}

const commandAssets = [
  ".claude/commands/delivery-continue.md",
  ".claude/commands/delivery-driver.md",
  ".claude/commands/delivery-implement.md",
  ".claude/commands/delivery-plan.md",
  ".claude/commands/delivery-pr.md",
  ".claude/commands/delivery-release.md",
  ".claude/commands/delivery-start.md",
  ".claude/commands/delivery-status.md",
  ".claude/commands/delivery-what-now.md",
].map(templateAsset);

const bootstrapEntries = [
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
  ...seedEntries(bootstrapGlobalMemorySeeds),
];

const minimalToolEntries = [
  templateAsset(".claude/agents/delivery-manager.md"),
  templateAsset(".claude/agents/feature-implementer.md"),
  templateAsset(".claude/agents/implementation-fixer.md"),
  templateAsset(".claude/agents/implementation-guide-creator.md"),
  templateAsset(".claude/agents/implementation-manager.md"),
  templateAsset(".claude/agents/implementation-reviewer.md"),
  templateAsset(".claude/agents/orchestrator.md"),
  templateAsset(".claude/agents/planning-manager.md"),
  templateAsset(".claude/agents/release-manager.md"),
];

const standardAppEntries = [
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
  ...seedEntries(standardAppStateSeeds),
];

const standardAppFocusedPlanningEntries = [templateAsset(".claude/agents/architect.md")];

export const PACK_REGISTRY: Record<InstallPackName, InstallPackDefinition> = {
  bootstrap: definePack("bootstrap", bootstrapEntries),
  "profile-minimal-tool": definePack("profile-minimal-tool", minimalToolEntries),
  "profile-standard-app": definePack("profile-standard-app", standardAppEntries),
  "standard-app-focused-planning": definePack("standard-app-focused-planning", standardAppFocusedPlanningEntries),
};

export function getPackDefinition(name: InstallPackName) {
  return PACK_REGISTRY[name];
}

export function getProfilePackChain(profile: WorkflowProfile): InstallPackName[] {
  switch (profile) {
    case "minimal_tool":
      return ["profile-minimal-tool"];
    case "standard_app":
      return ["profile-minimal-tool", "profile-standard-app"];
  }
}

export function normalizeSelectedPacks(selectedPacks: string[] | undefined, selectedProfile: WorkflowProfile | undefined) {
  const normalized = new Set<InstallPackName>();

  if (selectedProfile) {
    for (const packName of getProfilePackChain(selectedProfile)) {
      normalized.add(packName);
    }
  }

  for (const packName of selectedPacks ?? []) {
    if (packName in PACK_REGISTRY && packName !== "bootstrap") {
      normalized.add(packName as InstallPackName);
    }
  }

  return [...normalized];
}

export function getProfileQualityRunbookSourcePath(profile: WorkflowProfile) {
  switch (profile) {
    case "minimal_tool":
      return ".dwemr/runbooks/simple-quality-runbook.md";
    case "standard_app":
      return ".dwemr/runbooks/quality-runbook.md";
  }
}

export function getInstalledQualityRunbookPath() {
  return ACTIVE_QUALITY_RUNBOOK_PATH;
}

export function getProfileQualityRunbookEntry(profile: WorkflowProfile): InstallEntry {
  const sourceRelativePath = getProfileQualityRunbookSourcePath(profile);

  return {
    type: "copy",
    sourcePath: path.join(templateRoot, sourceRelativePath),
    targetPath: ACTIVE_QUALITY_RUNBOOK_PATH,
  };
}
