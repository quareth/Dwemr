export const DWEMR_CONTRACT_VERSION = 3;

export const AUTHORITATIVE_STATE_RELATIVE_PATHS = [
  ".dwemr/state/onboarding-state.md",
  ".dwemr/state/pipeline-state.md",
  ".dwemr/state/execution-state.md",
  ".dwemr/state/implementation-state.md",
] as const;

export function extractFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return match?.[1] ?? "";
}

export function parseDwemrContractVersion(raw: string) {
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
    if (key !== "dwemr_contract_version") {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
