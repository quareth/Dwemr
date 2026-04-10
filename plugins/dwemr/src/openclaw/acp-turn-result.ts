import type { ProcessResult } from "./claude-runner";
import { collectAcpRuntimeOutput, formatAcpLifecycleError } from "./acp-config";
import { isAcpRuntimeError } from "openclaw/plugin-sdk/acp-runtime";

export type AcpEventCollector = {
  events: Array<{ type: string; text?: string; stream?: string }>;
  collect: (event: { type: string; [k: string]: unknown }) => void;
};

export function createAcpEventCollector(): AcpEventCollector {
  const events: Array<{ type: string; text?: string; stream?: string }> = [];
  function collect(event: { type: string; [k: string]: unknown }) {
    events.push({
      type: event.type,
      text: "text" in event ? (event.text as string) : undefined,
      stream: event.type === "text_delta" ? (event.stream as string) : undefined,
    });
  }
  return { events, collect };
}

export function buildTurnEventHandler(collector: AcpEventCollector) {
  const turnDiag: Array<{ type: string; detail?: string; at: number }> = [];
  const turnStartedAt = Date.now();

  function onEvent(event: { type: string; [k: string]: unknown }) {
    collector.collect(event);
    if (event.type === "done") {
      turnDiag.push({
        type: "done",
        detail: "stopReason" in event ? String((event as { stopReason?: string }).stopReason ?? "none") : "no-field",
        at: Date.now() - turnStartedAt,
      });
    } else if (event.type === "error") {
      turnDiag.push({
        type: "error",
        detail: "message" in event ? String((event as { message?: string }).message ?? "") : "unknown",
        at: Date.now() - turnStartedAt,
      });
    } else if (event.type === "tool_call") {
      turnDiag.push({
        type: "tool_call",
        detail: "title" in event ? String((event as { title?: string }).title ?? "") : undefined,
        at: Date.now() - turnStartedAt,
      });
    }
  }

  function summarize() {
    const turnDurationMs = Date.now() - turnStartedAt;
    const textDeltaCount = collector.events.filter((e) => e.type === "text_delta" && e.stream !== "thought").length;
    const toolCallCount = collector.events.filter((e) => e.type === "tool_call").length;
    return [
      `[DWEMR-DIAG] runTurn completed in ${Math.round(turnDurationMs / 1000)}s`,
      `events: ${collector.events.length} total, ${textDeltaCount} text_delta, ${toolCallCount} tool_call`,
      `done-events: ${JSON.stringify(turnDiag.filter((d) => d.type === "done"))}`,
      turnDiag.some((d) => d.type === "error") ? `errors: ${JSON.stringify(turnDiag.filter((d) => d.type === "error"))}` : undefined,
    ].filter(Boolean).join(" | ");
  }

  return { onEvent, summarize };
}

export function buildSuccessResult(collector: AcpEventCollector, diagSummary: string): ProcessResult {
  const stdout = collectAcpRuntimeOutput(collector.events);
  return {
    exitCode: 0,
    stdout,
    stderr: stdout ? "" : diagSummary,
    timedOut: false,
  };
}

export function buildErrorResult(error: unknown, collector: AcpEventCollector): ProcessResult {
  const timedOut = isAcpRuntimeError(error) && /\btimed out\b/i.test(error.message);
  return {
    exitCode: timedOut ? 124 : 1,
    stdout: collectAcpRuntimeOutput(collector.events),
    stderr: formatAcpLifecycleError(error),
    timedOut,
  };
}
