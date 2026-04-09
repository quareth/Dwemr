import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const ACPX_BIN_NAME = process.platform === "win32" ? "acpx.cmd" : "acpx";
const DEFAULT_MANAGED_RUNTIME_SUBDIR = path.join("tools", "dwemr", "runtime");
const MANAGED_RUNTIME_METADATA_NAME = "runtime.json";

export type DwemrRuntimeConfig = {
  acpxPath?: string;
  managedRuntimeDir?: string;
};

type DwemrBootstrapSourceKind = "bundled" | "legacy-path";
type DwemrReadySourceKind = "managed" | "override";

type DwemrManagedRuntimeMetadata = {
  version: 1;
  generatedAt: string;
  sourceKind: DwemrBootstrapSourceKind;
  sourcePath: string;
};

export type DwemrRuntimeInspection = {
  openclawPackageRoot?: string;
  openclawAcpxExtensionPath?: string;
  openclawAcpxExtensionDetected: boolean;
  managedRuntimeDir: string;
  managedCommandPath: string;
  managedMetadataPath: string;
  managedReady: boolean;
  metadata?: DwemrManagedRuntimeMetadata;
  overrideCommandPath?: string;
  overrideReady: boolean;
  readyCommandPath?: string;
  readySource?: DwemrReadySourceKind;
  bootstrapSourcePath?: string;
  bootstrapSourceKind?: DwemrBootstrapSourceKind;
  pathFallbackCommandPath?: string;
};

function resolveStateDir() {
  const configured = process.env.OPENCLAW_STATE_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), ".openclaw");
}

export function resolveManagedRuntimeDir(config: DwemrRuntimeConfig) {
  const configured = config.managedRuntimeDir?.trim();
  return configured ? path.resolve(configured) : path.join(resolveStateDir(), DEFAULT_MANAGED_RUNTIME_SUBDIR);
}

export function resolveManagedAcpxPath(config: DwemrRuntimeConfig) {
  return path.join(resolveManagedRuntimeDir(config), "bin", ACPX_BIN_NAME);
}

async function isExecutable(targetPath: string) {
  try {
    await access(targetPath, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readManagedRuntimeMetadata(metadataPath: string) {
  try {
    const payload = await readFile(metadataPath, "utf8");
    const parsed = JSON.parse(payload) as Partial<DwemrManagedRuntimeMetadata>;
    if (parsed.version !== 1) {
      return undefined;
    }
    if (parsed.sourceKind !== "bundled" && parsed.sourceKind !== "legacy-path") {
      return undefined;
    }
    if (typeof parsed.generatedAt !== "string" || typeof parsed.sourcePath !== "string") {
      return undefined;
    }
    return parsed as DwemrManagedRuntimeMetadata;
  } catch {
    return undefined;
  }
}

function resolveOpenClawPackageRootFromRequire() {
  try {
    const openclawPackageJson = require.resolve("openclaw/package.json");
    return path.dirname(openclawPackageJson);
  } catch {
    return undefined;
  }
}

async function discoverPathCommand(binaryName: string) {
  const searchEntries = (process.env.PATH ?? "").split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);

  for (const entry of searchEntries) {
    const candidate = path.join(entry, binaryName);
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
}

async function resolveOpenClawPackageRootFromCli() {
  const openclawBinName = process.platform === "win32" ? "openclaw.cmd" : "openclaw";
  const cliPath = await discoverPathCommand(openclawBinName);
  if (!cliPath) {
    return undefined;
  }

  const candidateRoots = new Set<string>();
  candidateRoots.add(path.resolve(path.dirname(cliPath), "..", "lib", "node_modules", "openclaw"));

  try {
    const resolvedCliPath = await realpath(cliPath);
    candidateRoots.add(path.dirname(resolvedCliPath));
    candidateRoots.add(path.resolve(path.dirname(resolvedCliPath), ".."));
  } catch {
    // Fall through to the heuristic paths above.
  }

  for (const candidateRoot of candidateRoots) {
    if (await pathExists(path.join(candidateRoot, "package.json"))) {
      return candidateRoot;
    }
  }

  return undefined;
}

async function resolveOpenClawPackageRoot() {
  return resolveOpenClawPackageRootFromRequire() ?? (await resolveOpenClawPackageRootFromCli());
}

function resolveBundledAcpxCandidates(openclawRoot: string | undefined) {
  if (!openclawRoot) {
    return [];
  }

  return [
    path.join(openclawRoot, "node_modules", ".bin", ACPX_BIN_NAME),
    path.join(openclawRoot, "dist", "extensions", "acpx", "node_modules", ".bin", ACPX_BIN_NAME),
    path.join(openclawRoot, "extensions", "acpx", "node_modules", ".bin", ACPX_BIN_NAME),
  ];
}

async function discoverBundledAcpxSource(openclawRoot: string | undefined) {
  for (const candidate of resolveBundledAcpxCandidates(openclawRoot)) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
}

async function discoverPathAcpxSource() {
  return discoverPathCommand(ACPX_BIN_NAME);
}

function buildUnixWrapperScript(targetPath: string) {
  const escapedTarget = targetPath.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
  return `#!/bin/sh\nexec "${escapedTarget}" "$@"\n`;
}

function buildWindowsWrapperScript(targetPath: string) {
  const normalizedTarget = targetPath.replaceAll("/", "\\");
  return `@echo off\r\n"${normalizedTarget}" %*\r\n`;
}

async function writeManagedWrapper(commandPath: string, targetPath: string) {
  await mkdir(path.dirname(commandPath), { recursive: true });
  const wrapper = process.platform === "win32" ? buildWindowsWrapperScript(targetPath) : buildUnixWrapperScript(targetPath);
  await writeFile(commandPath, wrapper, "utf8");
  if (process.platform !== "win32") {
    await chmod(commandPath, 0o755);
  }
}

async function writeManagedMetadata(metadataPath: string, sourcePath: string, sourceKind: DwemrBootstrapSourceKind) {
  const payload: DwemrManagedRuntimeMetadata = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceKind,
    sourcePath,
  };
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function inspectDwemrRuntime(config: DwemrRuntimeConfig): Promise<DwemrRuntimeInspection> {
  const openclawPackageRoot = await resolveOpenClawPackageRoot();
  const distExtensionPath = openclawPackageRoot ? path.join(openclawPackageRoot, "dist", "extensions", "acpx") : undefined;
  const legacyExtensionPath = openclawPackageRoot ? path.join(openclawPackageRoot, "extensions", "acpx") : undefined;
  const openclawAcpxExtensionPath =
    (distExtensionPath && (await pathExists(distExtensionPath)) ? distExtensionPath : undefined) ??
    (legacyExtensionPath && (await pathExists(legacyExtensionPath)) ? legacyExtensionPath : undefined);
  const managedRuntimeDir = resolveManagedRuntimeDir(config);
  const managedCommandPath = resolveManagedAcpxPath(config);
  const managedMetadataPath = path.join(managedRuntimeDir, MANAGED_RUNTIME_METADATA_NAME);
  const metadata = await readManagedRuntimeMetadata(managedMetadataPath);
  const overrideCommandPath = config.acpxPath?.trim() ? path.resolve(config.acpxPath) : undefined;
  const overrideReady = overrideCommandPath ? await isExecutable(overrideCommandPath) : false;
  const managedWrapperReady = await isExecutable(managedCommandPath);
  const metadataSourceReady = metadata ? await isExecutable(metadata.sourcePath) : false;
  const managedReady = managedWrapperReady && (!metadata || metadataSourceReady);
  const bundledSourcePath = await discoverBundledAcpxSource(openclawPackageRoot);
  const pathFallbackCommandPath = await discoverPathAcpxSource();

  let bootstrapSourcePath: string | undefined = bundledSourcePath;
  let bootstrapSourceKind: DwemrBootstrapSourceKind | undefined = bundledSourcePath ? "bundled" : undefined;

  if (!bootstrapSourcePath && pathFallbackCommandPath) {
    bootstrapSourcePath = pathFallbackCommandPath;
    bootstrapSourceKind = "legacy-path";
  }

  const readyCommandPath = managedReady ? managedCommandPath : overrideReady ? overrideCommandPath : undefined;
  const readySource = managedReady ? "managed" : overrideReady ? "override" : undefined;

  return {
    openclawPackageRoot,
    openclawAcpxExtensionPath,
    openclawAcpxExtensionDetected: Boolean(openclawAcpxExtensionPath),
    managedRuntimeDir,
    managedCommandPath,
    managedMetadataPath,
    managedReady,
    metadata,
    overrideCommandPath,
    overrideReady,
    readyCommandPath,
    readySource,
    bootstrapSourcePath,
    bootstrapSourceKind,
    pathFallbackCommandPath,
  };
}

export async function ensureManagedDwemrRuntime(config: DwemrRuntimeConfig) {
  const inspection = await inspectDwemrRuntime(config);
  if (inspection.overrideReady || inspection.managedReady || !inspection.bootstrapSourcePath || !inspection.bootstrapSourceKind) {
    return inspection;
  }

  await writeManagedWrapper(inspection.managedCommandPath, inspection.bootstrapSourcePath);
  await writeManagedMetadata(inspection.managedMetadataPath, inspection.bootstrapSourcePath, inspection.bootstrapSourceKind);

  return inspectDwemrRuntime(config);
}
