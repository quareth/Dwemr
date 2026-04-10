import assert from "node:assert/strict";
import test from "node:test";
import {
  buildErrorResult,
  buildSuccessResult,
  buildTurnEventHandler,
  createAcpEventCollector,
} from "../../dwemr/src/openclaw/backend/acp-native/acp-turn-result";
import { AcpRuntimeError } from "./fixtures/acp-runtime-fakes";

test("createAcpEventCollector stores normalized events with text and stream fields", () => {
  const collector = createAcpEventCollector();
  collector.collect({ type: "text_delta", text: "hello", stream: "main" });
  collector.collect({ type: "tool_call", title: "ignored" });
  collector.collect({ type: "text_delta", text: "world", stream: "thought" });

  assert.equal(collector.events.length, 3);
  assert.deepEqual(collector.events[0], { type: "text_delta", text: "hello", stream: "main" });
  assert.equal(collector.events[1].type, "tool_call");
  assert.equal(collector.events[1].text, undefined);
  // Non-text_delta events do not capture stream.
  assert.equal(collector.events[1].stream, undefined);
  assert.equal(collector.events[2].stream, "thought");
});

test("buildTurnEventHandler tracks done/error/tool_call diagnostics and forwards to collector", () => {
  const collector = createAcpEventCollector();
  const handler = buildTurnEventHandler(collector);

  handler.onEvent({ type: "tool_call", title: "Read" });
  handler.onEvent({ type: "text_delta", text: "answer" });
  handler.onEvent({ type: "done", stopReason: "end_turn" });

  // Collector receives every event the handler observed.
  assert.equal(collector.events.length, 3);

  const summary = handler.summarize();
  assert.match(summary, /runTurn completed in \d+s/);
  assert.match(summary, /events: 3 total, 1 text_delta, 1 tool_call/);
  assert.match(summary, /done-events: \[.*"detail":"end_turn"/);
  // No error event arrived → summary omits the errors clause.
  assert.doesNotMatch(summary, /errors:/);
});

test("buildTurnEventHandler reports errors in summary when an error event arrives", () => {
  const collector = createAcpEventCollector();
  const handler = buildTurnEventHandler(collector);

  handler.onEvent({ type: "error", message: "boom" });
  handler.onEvent({ type: "done", stopReason: "error" });

  const summary = handler.summarize();
  assert.match(summary, /errors:.*"detail":"boom"/);
});

test("buildTurnEventHandler excludes 'thought' stream from text_delta count", () => {
  const collector = createAcpEventCollector();
  const handler = buildTurnEventHandler(collector);

  handler.onEvent({ type: "text_delta", text: "visible", stream: "main" });
  handler.onEvent({ type: "text_delta", text: "hidden", stream: "thought" });
  handler.onEvent({ type: "done" });

  assert.match(handler.summarize(), /events: 3 total, 1 text_delta, 0 tool_call/);
});

test("buildSuccessResult returns exitCode 0 with stdout populated and stderr empty", () => {
  const collector = createAcpEventCollector();
  collector.collect({ type: "text_delta", text: "final answer" });

  const result = buildSuccessResult(collector, "DIAG-SUMMARY");
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "final answer");
  assert.equal(result.stderr, "");
  assert.equal(result.timedOut, false);
});

test("buildSuccessResult routes diag summary to stderr when stdout is empty", () => {
  const collector = createAcpEventCollector();
  // No text_delta events → stdout will be empty.
  collector.collect({ type: "tool_call" });

  const result = buildSuccessResult(collector, "DIAG-SUMMARY");
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "DIAG-SUMMARY");
  assert.equal(result.timedOut, false);
});

test("buildErrorResult flags timed-out AcpRuntimeError as exitCode 124 with timedOut=true", () => {
  const collector = createAcpEventCollector();
  collector.collect({ type: "text_delta", text: "partial" });

  const error = new AcpRuntimeError("ACP_TURN_FAILED", "Run timed out after 30s");
  const result = buildErrorResult(error, collector);

  assert.equal(result.exitCode, 124);
  assert.equal(result.timedOut, true);
  assert.equal(result.stdout, "partial");
  assert.equal(result.stderr, "ACP_TURN_FAILED: Run timed out after 30s");
});

test("buildErrorResult treats non-timeout errors as exitCode 1 with timedOut=false", () => {
  const collector = createAcpEventCollector();

  const result = buildErrorResult(new Error("plain failure"), collector);
  assert.equal(result.exitCode, 1);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Error: plain failure");
});
