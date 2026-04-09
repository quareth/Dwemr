import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getPackDefinition,
  getProfileQualityRunbookEntry,
  getInstalledQualityRunbookPath,
  normalizeSelectedPacks,
  type WorkflowProfile,
  type InstallEntry,
  type InstallPackName,
  type ProjectInstallState,
} from "../../install-packs";
import { readOnboardingState, writeOnboardingState, type OnboardingState } from "./onboarding-state";
import { isGitEnabled, readProjectScmConfig, readProjectSize, updateProjectSize } from "./project-config";
import {
  AUTHORITATIVE_STATE_RELATIVE_PATHS,
  DWEMR_CONTRACT_VERSION,
  extractFrontmatter,
  parseDwemrContractVersion,
} from "./state-contract";
import { createReleaseStateSeed } from "./seed-data";

export type ProjectHealth = {
  targetPath: string;
  exists: boolean;
  installState: ProjectInstallState;
  onboardingState: OnboardingState;
  canonicalProfile?: WorkflowProfile;
  expectedPacks: InstallPackName[];
  missingFiles: string[];
  contractIssues: string[];
};

export type InitPathValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export function formatOverwriteConfirmation(targetPath: string) {
  return [
    `DWEMR refused to run destructive overwrite init for \`${targetPath}\` without explicit confirmation.`,
    "",
    "Using `/dwemr init --overwrite` deletes the existing target project folder contents and recreates a brand-new DWEMR bootstrap install there.",
    "",
    "This removes the current DWEMR runtime state, memory, generated guides, and any other files already inside that target folder.",
    "",
    "If you really want that reset, rerun:",
    `- /dwemr init ${targetPath} --overwrite --confirm-overwrite`,
  ].join("\n");
}

function getBootstrapRequiredPaths() {
  return getPackDefinition("bootstrap").requiredPaths;
}

function getBootstrapEntries() {
  return getPackDefinition("bootstrap").entries;
}

function resolveCanonicalProfile(onboardingState: OnboardingState, configProjectSize: WorkflowProfile | undefined) {
  return configProjectSize ?? onboardingState.selectedProfile;
}

function getExpectedPacks(onboardingState: OnboardingState, configProjectSize: WorkflowProfile | undefined) {
  const selectedPacks =
    onboardingState.status === "complete"
      ? normalizeSelectedPacks(onboardingState.selectedPacks, resolveCanonicalProfile(onboardingState, configProjectSize))
      : [];
  const canonicalProfile = resolveCanonicalProfile(onboardingState, configProjectSize);
  const expectedPaths = [
    ...selectedPacks.flatMap((packName) => getPackDefinition(packName).requiredPaths),
    ...(canonicalProfile ? [getInstalledQualityRunbookPath()] : []),
  ];

  return {
    expectedPacks: ["bootstrap", ...selectedPacks] satisfies InstallPackName[],
    selectedPacks,
    expectedPaths,
  };
}

export async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function editDistance(left: string, right: string) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => (rowIndex === 0 ? colIndex : colIndex === 0 ? rowIndex : 0)),
  );

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost,
      );
    }
  }

  return matrix[a.length][b.length];
}

async function listChildDirectories(parentPath: string) {
  try {
    const entries = await readdir(parentPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function suggestSimilarPath(existingAncestor: string, requestedSegments: string[], leafName: string) {
  const [firstMissingSegment, ...remainingSegments] = requestedSegments;
  if (!firstMissingSegment) {
    return undefined;
  }

  const siblingDirectories = await listChildDirectories(existingAncestor);
  let bestCandidate: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sibling of siblingDirectories) {
    const distance = editDistance(firstMissingSegment, sibling);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = sibling;
    }
  }

  if (!bestCandidate) {
    return undefined;
  }

  const maxAcceptedDistance = Math.max(2, Math.floor(firstMissingSegment.length * 0.25));
  if (bestDistance > maxAcceptedDistance) {
    return undefined;
  }

  return path.join(existingAncestor, bestCandidate, ...remainingSegments, leafName);
}

export async function validateInitTargetPath(targetPath: string): Promise<InitPathValidationResult> {
  const resolvedTargetPath = path.resolve(targetPath);
  const parentPath = path.dirname(resolvedTargetPath);

  if (await pathExists(parentPath)) {
    return { ok: true };
  }

  const missingSegments: string[] = [];
  let cursor = parentPath;

  while (!(await pathExists(cursor))) {
    const baseName = path.basename(cursor);
    if (!baseName || baseName === "." || baseName === path.sep) {
      break;
    }
    missingSegments.unshift(baseName);
    const nextCursor = path.dirname(cursor);
    if (nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }

  const leafName = path.basename(resolvedTargetPath);
  const suggestion = (await pathExists(cursor))
    ? await suggestSimilarPath(cursor, missingSegments, leafName)
    : undefined;

  const lines = [
    `DWEMR refused to initialize \`${resolvedTargetPath}\` because one or more parent directories do not exist.`,
    "",
    "DWEMR only auto-creates the final project folder. Parent directories must already exist so typos do not silently create the wrong tree.",
  ];

  if (suggestion) {
    lines.push("", `Did you mean:\n- ${suggestion}`);
  }

  lines.push("", "Create the parent directories first or rerun `/dwemr init` with the corrected path.");

  return {
    ok: false,
    error: lines.join("\n"),
  };
}

async function installEntry(targetPath: string, entry: InstallEntry, overwrite: boolean) {
  const destinationPath = path.join(targetPath, entry.targetPath);
  await mkdir(path.dirname(destinationPath), { recursive: true });

  if (entry.type === "copy") {
    if (!(await pathExists(entry.sourcePath))) {
      throw new Error(`Required source asset is missing: ${entry.sourcePath}`);
    }
    await cp(entry.sourcePath, destinationPath, {
      force: overwrite,
      errorOnExist: !overwrite,
    });
    return entry.targetPath;
  }

  if (!overwrite && (await pathExists(destinationPath))) {
    throw new Error(`Refusing to overwrite existing file without overwrite=true: ${destinationPath}`);
  }

  await writeFile(destinationPath, entry.content, "utf8");
  return entry.targetPath;
}

async function installPack(targetPath: string, packName: InstallPackName, overwrite: boolean) {
  const pack = getPackDefinition(packName);
  const installedTargets: string[] = [];

  for (const entry of pack.entries) {
    installedTargets.push(await installEntry(targetPath, entry, overwrite));
  }

  return installedTargets;
}

async function installMissingEntries(targetPath: string, entries: InstallEntry[]) {
  const installedTargets: string[] = [];
  const skippedTargets: string[] = [];

  for (const entry of entries) {
    const destinationPath = path.join(targetPath, entry.targetPath);
    if (await pathExists(destinationPath)) {
      skippedTargets.push(entry.targetPath);
      continue;
    }

    installedTargets.push(await installEntry(targetPath, entry, false));
  }

  return {
    installedTargets,
    skippedTargets,
  };
}

async function ensureReleaseStateForGitEnabledProject(targetPath: string) {
  const scmConfig = await readProjectScmConfig(targetPath);
  if (!isGitEnabled(scmConfig)) {
    return false;
  }

  const releaseStatePath = path.join(targetPath, ".dwemr/state/release-state.md");
  await mkdir(path.dirname(releaseStatePath), { recursive: true });
  await writeFile(
    releaseStatePath,
    createReleaseStateSeed({
      gitEnabled: false,
      gitMode: scmConfig.gitMode,
      updatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  return true;
}

async function inspectContractIssues(targetPath: string) {
  const issues: string[] = [];
  let pipelineStateRaw: string | undefined;

  for (const relativePath of AUTHORITATIVE_STATE_RELATIVE_PATHS) {
    const absolutePath = path.join(targetPath, relativePath);
    try {
      const raw = await readFile(absolutePath, "utf8");
      if (relativePath === ".dwemr/state/pipeline-state.md") {
        pipelineStateRaw = raw;
      }
      const detectedVersion = parseDwemrContractVersion(raw);
      if (detectedVersion !== DWEMR_CONTRACT_VERSION) {
        issues.push(
          detectedVersion === undefined
            ? `${relativePath}: missing \`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}\``
            : `${relativePath}: found contract version ${detectedVersion}, expected ${DWEMR_CONTRACT_VERSION}`,
        );
      }
    } catch {
      issues.push(`${relativePath}: missing authoritative state file`);
    }
  }

  if (pipelineStateRaw) {
    const activeWaveStatePath = readFrontmatterStringField(pipelineStateRaw, "active_wave_state_path");
    if (activeWaveStatePath) {
      const absoluteWaveStatePath = path.resolve(targetPath, activeWaveStatePath);
      try {
        const raw = await readFile(absoluteWaveStatePath, "utf8");
        const detectedVersion = parseDwemrContractVersion(raw);
        if (detectedVersion !== DWEMR_CONTRACT_VERSION) {
          issues.push(
            detectedVersion === undefined
              ? `${activeWaveStatePath}: missing \`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}\``
              : `${activeWaveStatePath}: found contract version ${detectedVersion}, expected ${DWEMR_CONTRACT_VERSION}`,
          );
        }
      } catch {
        issues.push(`${activeWaveStatePath}: missing authoritative active wave-state file`);
      }
    }
  }

  return issues;
}

function readFrontmatterStringField(raw: string, fieldName: string) {
  const frontmatter = extractFrontmatter(raw);
  if (!frontmatter) {
    return undefined;
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
    return value || undefined;
  }

  return undefined;
}

export async function inspectProjectHealth(targetPath: string): Promise<ProjectHealth> {
  const exists = await pathExists(targetPath);
  if (!exists) {
    return {
      targetPath,
      exists: false,
      installState: "missing",
      onboardingState: await readOnboardingState(targetPath),
      expectedPacks: ["bootstrap"],
      missingFiles: [...getBootstrapRequiredPaths()],
      contractIssues: [],
    };
  }

  const onboardingState = await readOnboardingState(targetPath);
  const bootstrapMissing = (
    await Promise.all(
      getBootstrapRequiredPaths().map(async (relativePath) => (await pathExists(path.join(targetPath, relativePath)) ? undefined : relativePath)),
    )
  ).filter((value): value is string => Boolean(value));

  if (bootstrapMissing.length > 0) {
    return {
      targetPath,
      exists: true,
      installState: "missing",
      onboardingState,
      expectedPacks: ["bootstrap"],
      missingFiles: bootstrapMissing,
      contractIssues: [],
    };
  }

  const contractIssues = await inspectContractIssues(targetPath);
  const configProjectSize = await readProjectSize(targetPath).catch(() => undefined);
  const canonicalProfile = resolveCanonicalProfile(onboardingState, configProjectSize);
  const { expectedPacks, selectedPacks, expectedPaths } = getExpectedPacks(onboardingState, configProjectSize);
  const missingFiles = (
    await Promise.all(
      expectedPaths.map(async (relativePath) => (await pathExists(path.join(targetPath, relativePath)) ? undefined : relativePath)),
    )
  ).filter((value): value is string => Boolean(value));

  return {
    targetPath,
    exists: true,
    installState:
      contractIssues.length > 0
        ? "unsupported_contract"
        : onboardingState.status === "complete" &&
            onboardingState.installStage === "profile_installed" &&
            missingFiles.length === 0 &&
            selectedPacks.length > 0
          ? "profile_installed"
          : "bootstrap_only",
    onboardingState,
    canonicalProfile,
    expectedPacks,
    missingFiles,
    contractIssues,
  };
}

export async function initializeProject(targetPath: string, overwrite: boolean) {
  if (overwrite && (await pathExists(targetPath))) {
    await rm(targetPath, { recursive: true, force: true });
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  await mkdir(targetPath, { recursive: true });

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
    "- Use `/dwemr continue` or `/dwemr what-now` later to review any saved onboarding clarification or resume after profile selection.",
  ].join("\n");
}

export async function repairBootstrapAssets(targetPath: string) {
  await mkdir(targetPath, { recursive: true });

  const result = await installMissingEntries(targetPath, getBootstrapEntries());

  return {
    repairedPack: "bootstrap" as const,
    installedTargets: result.installedTargets,
    skippedTargets: result.skippedTargets,
  };
}

export async function provisionProjectProfile(targetPath: string, onboardingState: OnboardingState) {
  const configProjectSize = await readProjectSize(targetPath).catch(() => undefined);
  const canonicalProfile = resolveCanonicalProfile(onboardingState, configProjectSize);
  if (!canonicalProfile) {
    throw new Error("Onboarding completed without any canonical project size or selected profile.");
  }

  const selectedPacks = normalizeSelectedPacks(onboardingState.selectedPacks, canonicalProfile);
  if (selectedPacks.length === 0) {
    throw new Error("Onboarding completed without any provisionable profile packs.");
  }

  const installedTargets = new Set<string>();

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

  const normalizedState: OnboardingState = {
    ...onboardingState,
    selectedProfile: canonicalProfile,
    selectedPacks,
    installStage: "profile_installed",
    updatedAt: new Date().toISOString(),
  };
  if (!configProjectSize) {
    await updateProjectSize(targetPath, canonicalProfile);
  }
  await writeOnboardingState(targetPath, normalizedState);

  return {
    packNames: selectedPacks,
    installedTargets: [...installedTargets].sort(),
    onboardingState: normalizedState,
  };
}
