import { normalizeOnboardingState } from "../../../dwemr/src/control-plane/onboarding-state";
import type { ProjectHealth } from "../../../dwemr/src/control-plane/project-assets";

export function buildProjectHealth(overrides: Partial<ProjectHealth> & { onboardingState?: ProjectHealth["onboardingState"] } = {}): ProjectHealth {
  return {
    targetPath: "/tmp/dwemr-project",
    exists: true,
    installState: "bootstrap_only",
    onboardingState: overrides.onboardingState ?? normalizeOnboardingState(undefined),
    expectedPacks: ["bootstrap"],
    missingFiles: [],
    contractIssues: [],
    ...overrides,
  };
}
