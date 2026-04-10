import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DwemrExecutionMode } from "./project-config";

export type PipelineMilestoneState = "none" | "waiting_for_continue";
export type PipelineMilestoneKind =
  | "none"
  | "implementation_ready"
  | "phase_complete"
  | "feature_complete"
  | "release_checkpoint"
  | "blocked_decision"
  | "user_input_required";
export type PipelineMilestoneOwner = "none" | "product-manager" | "delivery-manager" | "release-manager";

export const PIPELINE_STATE_RELATIVE_PATH = path.join(".dwemr", "state", "pipeline-state.md");

export function resolvePipelineStatePath(targetPath: string) {
  return path.join(targetPath, PIPELINE_STATE_RELATIVE_PATH);
}

export type PipelineStateBrief = {
  featureTitle?: string;
  featureStatus?: string;
  stageStatus?: string;
  currentOwner?: string;
  nextAgent?: string;
  activeWaveTitle?: string;
  currentPhase?: string;
  currentTask?: string;
  currentStepStatus?: string;
  milestoneState?: string;
  milestoneKind?: string;
  milestoneSummary?: string;
  executionMode?: string;
  updatedAt?: string;
};

function parseFrontmatterField(lines: string[], key: string): string | undefined {
  for (const line of lines) {
    const match = line.match(new RegExp(`^${key}:\\s*["']?([^"'\\n#]+?)["']?\\s*$`));
    if (match) {
      const value = match[1].trim();
      return value === "" || value === '""' || value === "''" ? undefined : value;
    }
  }
  return undefined;
}

export async function readPipelineStateBrief(targetPath: string): Promise<PipelineStateBrief | null> {
  try {
    const raw = await readFile(resolvePipelineStatePath(targetPath), "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      return null;
    }
    const lines = fmMatch[1].split("\n");
    return {
      featureTitle: parseFrontmatterField(lines, "feature_title"),
      featureStatus: parseFrontmatterField(lines, "feature_status"),
      stageStatus: parseFrontmatterField(lines, "stage_status"),
      currentOwner: parseFrontmatterField(lines, "current_owner"),
      nextAgent: parseFrontmatterField(lines, "next_agent"),
      activeWaveTitle: parseFrontmatterField(lines, "active_wave_title"),
      currentPhase: parseFrontmatterField(lines, "current_phase"),
      currentTask: parseFrontmatterField(lines, "current_task"),
      currentStepStatus: parseFrontmatterField(lines, "current_step_status"),
      milestoneState: parseFrontmatterField(lines, "milestone_state"),
      milestoneKind: parseFrontmatterField(lines, "milestone_kind"),
      milestoneSummary: parseFrontmatterField(lines, "milestone_summary"),
      executionMode: parseFrontmatterField(lines, "execution_mode"),
      updatedAt: parseFrontmatterField(lines, "updated_at"),
    };
  } catch {
    return null;
  }
}

export function formatPipelineStateBrief(brief: PipelineStateBrief, activeRunInfo?: string): string {
  const lines: string[] = ["── DWEMR Pipeline Snapshot ──────────────────────"];

  if (activeRunInfo) {
    lines.push(`Runtime : ${activeRunInfo}`);
  }

  if (brief.featureTitle) {
    lines.push(`Feature : ${brief.featureTitle}${brief.featureStatus ? ` [${brief.featureStatus}]` : ""}`);
  }
  if (brief.activeWaveTitle) {
    lines.push(`Wave    : ${brief.activeWaveTitle}`);
  }
  if (brief.stageStatus) {
    lines.push(`Stage   : ${brief.stageStatus}${brief.nextAgent ? ` → next: ${brief.nextAgent}` : ""}`);
  }
  if (brief.currentPhase) {
    lines.push(`Phase   : ${brief.currentPhase}`);
  }
  if (brief.currentTask) {
    lines.push(`Task    : ${brief.currentTask}${brief.currentStepStatus ? ` [${brief.currentStepStatus}]` : ""}`);
  }
  if (brief.milestoneState && brief.milestoneState !== "none") {
    const ms = brief.milestoneKind && brief.milestoneKind !== "none" ? `${brief.milestoneState} (${brief.milestoneKind})` : brief.milestoneState;
    lines.push(`Milestone: ${ms}${brief.milestoneSummary ? ` — ${brief.milestoneSummary}` : ""}`);
  }
  if (brief.executionMode) {
    lines.push(`Mode    : ${brief.executionMode}`);
  }
  if (brief.updatedAt) {
    lines.push(`Updated : ${brief.updatedAt}`);
  }

  lines.push("─────────────────────────────────────────────────");
  return lines.join("\n");
}

export async function syncPipelineExecutionMode(targetPath: string, executionMode: DwemrExecutionMode) {
  const pipelineStatePath = resolvePipelineStatePath(targetPath);
  const raw = await readFile(pipelineStatePath, "utf8");
  const updated = /^\s*execution_mode:\s*/m.test(raw)
    ? raw.replace(/^\s*execution_mode:\s*.*$/m, `execution_mode: "${executionMode}"`)
    : raw.replace(/^approval_mode:\s*.*$/m, (line) => `${line}\nexecution_mode: "${executionMode}"`);

  if (updated !== raw) {
    await writeFile(pipelineStatePath, updated, "utf8");
  }

  return {
    pipelineStatePath,
    executionMode,
  };
}
