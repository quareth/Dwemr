import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InstallPackName, InstallStage, WorkflowProfile } from "../../install-packs";
import { DWEMR_CONTRACT_VERSION, extractFrontmatter } from "./state-contract";

export type OnboardingStatus = "pending" | "awaiting_clarification" | "complete";
type PersistedOnboardingStatus = OnboardingStatus | "active";

export type OnboardingState = {
  contractVersion: number;
  status: OnboardingStatus;
  entryAction: string;
  requestContext: string;
  clarificationSummary: string;
  clarificationQuestions: string[];
  clarificationResponse: string;
  selectedProfile?: WorkflowProfile;
  planningMode: string;
  docsMode: string;
  qaMode: string;
  needsProductFraming: boolean;
  selectedPacks: InstallPackName[];
  requiredArtifacts: string[];
  installStage: InstallStage;
  updatedAt: string;
};

export const ONBOARDING_STATE_RELATIVE_PATH = path.join(".dwemr", "state", "onboarding-state.md");

const ONBOARDING_STATE_DEFAULTS: OnboardingState = {
  contractVersion: DWEMR_CONTRACT_VERSION,
  status: "pending",
  entryAction: "",
  requestContext: "",
  clarificationSummary: "",
  clarificationQuestions: [],
  clarificationResponse: "",
  selectedProfile: undefined,
  planningMode: "",
  docsMode: "",
  qaMode: "",
  needsProductFraming: false,
  selectedPacks: [],
  requiredArtifacts: [],
  installStage: "bootstrap_only",
  updatedAt: "",
};

function stripWrappingQuotes(value: string) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [];
    }
  }

  return stripWrappingQuotes(trimmed);
}

export function hasSavedClarificationBatch(state: Pick<OnboardingState, "clarificationSummary" | "clarificationQuestions">) {
  return state.clarificationSummary.trim().length > 0 || state.clarificationQuestions.some((value) => value.trim().length > 0);
}

export function normalizeOnboardingState(raw: Partial<OnboardingState> | undefined): OnboardingState {
  const normalizedProfile =
    raw?.selectedProfile === "minimal_tool" || raw?.selectedProfile === "standard_app"
      ? raw.selectedProfile
      : undefined;
  const clarificationQuestions = Array.isArray(raw?.clarificationQuestions)
    ? raw?.clarificationQuestions.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const selectedPacks = Array.isArray(raw?.selectedPacks)
    ? raw?.selectedPacks.filter((value): value is InstallPackName => typeof value === "string" && value.trim().length > 0)
    : [];
  const requiredArtifacts = Array.isArray(raw?.requiredArtifacts)
    ? raw?.requiredArtifacts.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const normalizedState: OnboardingState = {
    contractVersion: raw?.contractVersion === DWEMR_CONTRACT_VERSION ? raw.contractVersion : ONBOARDING_STATE_DEFAULTS.contractVersion,
    status: ONBOARDING_STATE_DEFAULTS.status,
    entryAction: typeof raw?.entryAction === "string" ? raw.entryAction : ONBOARDING_STATE_DEFAULTS.entryAction,
    requestContext: typeof raw?.requestContext === "string" ? raw.requestContext : ONBOARDING_STATE_DEFAULTS.requestContext,
    clarificationSummary:
      typeof raw?.clarificationSummary === "string" ? raw.clarificationSummary : ONBOARDING_STATE_DEFAULTS.clarificationSummary,
    clarificationQuestions,
    clarificationResponse:
      typeof raw?.clarificationResponse === "string" ? raw.clarificationResponse : ONBOARDING_STATE_DEFAULTS.clarificationResponse,
    selectedProfile: normalizedProfile,
    planningMode: typeof raw?.planningMode === "string" ? raw.planningMode : ONBOARDING_STATE_DEFAULTS.planningMode,
    docsMode: typeof raw?.docsMode === "string" ? raw.docsMode : ONBOARDING_STATE_DEFAULTS.docsMode,
    qaMode: typeof raw?.qaMode === "string" ? raw.qaMode : ONBOARDING_STATE_DEFAULTS.qaMode,
    needsProductFraming: raw?.needsProductFraming === true,
    selectedPacks,
    requiredArtifacts,
    installStage: raw?.installStage === "profile_installed" ? "profile_installed" : ONBOARDING_STATE_DEFAULTS.installStage,
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : ONBOARDING_STATE_DEFAULTS.updatedAt,
  };
  const persistedStatus = typeof raw?.status === "string" ? (raw.status as PersistedOnboardingStatus) : ONBOARDING_STATE_DEFAULTS.status;

  if (normalizedState.selectedProfile || persistedStatus === "complete") {
    if (normalizedState.selectedProfile) {
      return {
        ...normalizedState,
        status: "complete",
        clarificationSummary: "",
        clarificationQuestions: [],
        clarificationResponse: "",
        installStage: normalizedState.installStage === "profile_installed" ? "profile_installed" : "provisioning_pending",
      };
    }
  }

  if (hasSavedClarificationBatch(normalizedState)) {
    return {
      ...normalizedState,
      status: "awaiting_clarification",
      planningMode: "",
      docsMode: "",
      qaMode: "",
      needsProductFraming: false,
      selectedPacks: [],
      requiredArtifacts: [],
      installStage: "bootstrap_only",
    };
  }

  return {
    ...normalizedState,
    status: "pending",
    clarificationSummary: "",
    clarificationQuestions: [],
    clarificationResponse: "",
    planningMode: "",
    docsMode: "",
    qaMode: "",
    needsProductFraming: false,
    selectedPacks: [],
    requiredArtifacts: [],
    installStage: "bootstrap_only",
  };
}

export function parseOnboardingState(raw: string) {
  const frontmatter = extractFrontmatter(raw);
  if (!frontmatter) {
    return { ...ONBOARDING_STATE_DEFAULTS };
  }

  // Use Record to allow PersistedOnboardingStatus values (e.g. "active") before normalizeOnboardingState cleans them.
  const parsed: Record<string, unknown> = {};

  for (const line of frontmatter.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = parseInlineValue(line.slice(separatorIndex + 1));

    switch (key) {
      case "status":
        parsed.status = String(value) as PersistedOnboardingStatus;
        break;
      case "dwemr_contract_version":
        parsed.contractVersion = Number.parseInt(String(value), 10);
        break;
      case "entry_action":
        parsed.entryAction = String(value);
        break;
      case "request_context":
        parsed.requestContext = String(value);
        break;
      case "clarification_summary":
        parsed.clarificationSummary = String(value);
        break;
      case "clarification_questions":
        parsed.clarificationQuestions = Array.isArray(value) ? (value as string[]) : [];
        break;
      case "clarification_response":
        parsed.clarificationResponse = String(value);
        break;
      case "selected_profile":
        parsed.selectedProfile = value as WorkflowProfile;
        break;
      case "planning_mode":
        parsed.planningMode = String(value);
        break;
      case "docs_mode":
        parsed.docsMode = String(value);
        break;
      case "qa_mode":
        parsed.qaMode = String(value);
        break;
      case "needs_product_framing":
        parsed.needsProductFraming = value === true;
        break;
      case "selected_packs":
        parsed.selectedPacks = Array.isArray(value) ? (value as InstallPackName[]) : [];
        break;
      case "required_artifacts":
        parsed.requiredArtifacts = Array.isArray(value) ? (value as string[]) : [];
        break;
      case "install_stage":
        parsed.installStage = value as InstallStage;
        break;
      case "updated_at":
        parsed.updatedAt = String(value);
        break;
      default:
        break;
    }
  }

  return normalizeOnboardingState(parsed as Partial<OnboardingState>);

}

export function formatOnboardingState(state: Partial<OnboardingState>) {
  const normalized = normalizeOnboardingState(state);
  const bodyLines = ["# Onboarding state", ""];

  if (normalized.status === "complete") {
    bodyLines.push(`Selected profile: \`${normalized.selectedProfile ?? "none"}\`.`);
  } else if (normalized.status === "awaiting_clarification") {
    bodyLines.push("Onboarding is waiting on one clarification batch before profile selection can complete.");
    if (normalized.clarificationSummary) {
      bodyLines.push("", `Missing context: ${normalized.clarificationSummary}`);
    }
    if (normalized.clarificationQuestions.length > 0) {
      bodyLines.push("", "Clarification questions:");
      for (const question of normalized.clarificationQuestions) {
        bodyLines.push(`- ${question}`);
      }
    }
  } else if (normalized.requestContext) {
    bodyLines.push("Onboarding request context is recorded and ready for the next headless onboarding pass.");
  } else {
    bodyLines.push("Onboarding has not been completed yet.");
  }

  return [
    "---",
    `dwemr_contract_version: ${normalized.contractVersion}`,
    `status: ${JSON.stringify(normalized.status)}`,
    `entry_action: ${JSON.stringify(normalized.entryAction)}`,
    `request_context: ${JSON.stringify(normalized.requestContext)}`,
    `clarification_summary: ${JSON.stringify(normalized.clarificationSummary)}`,
    `clarification_questions: ${JSON.stringify(normalized.clarificationQuestions)}`,
    `clarification_response: ${JSON.stringify(normalized.clarificationResponse)}`,
    `selected_profile: ${normalized.selectedProfile ? JSON.stringify(normalized.selectedProfile) : '""'}`,
    `planning_mode: ${JSON.stringify(normalized.planningMode)}`,
    `docs_mode: ${JSON.stringify(normalized.docsMode)}`,
    `qa_mode: ${JSON.stringify(normalized.qaMode)}`,
    `needs_product_framing: ${normalized.needsProductFraming ? "true" : "false"}`,
    `selected_packs: ${JSON.stringify(normalized.selectedPacks)}`,
    `required_artifacts: ${JSON.stringify(normalized.requiredArtifacts)}`,
    `install_stage: ${JSON.stringify(normalized.installStage)}`,
    `updated_at: ${JSON.stringify(normalized.updatedAt)}`,
    "---",
    "",
    ...bodyLines,
    "",
  ].join("\n");
}

export function resolveOnboardingStatePath(targetPath: string) {
  return path.join(targetPath, ONBOARDING_STATE_RELATIVE_PATH);
}

export async function readOnboardingState(targetPath: string) {
  try {
    const raw = await readFile(resolveOnboardingStatePath(targetPath), "utf8");
    return parseOnboardingState(raw);
  } catch {
    return { ...ONBOARDING_STATE_DEFAULTS };
  }
}

export async function writeOnboardingState(targetPath: string, state: Partial<OnboardingState>) {
  const targetFilePath = resolveOnboardingStatePath(targetPath);
  await mkdir(path.dirname(targetFilePath), { recursive: true });
  await writeFile(targetFilePath, formatOnboardingState(state), "utf8");
  return normalizeOnboardingState(state);
}
