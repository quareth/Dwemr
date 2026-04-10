import assert from "node:assert/strict";
import test from "node:test";
import { collectAcpRuntimeOutput, formatAcpLifecycleError } from "../../dwemr/src/openclaw/backend/acp-native/acp-output";
import { AcpRuntimeError } from "./fixtures/acp-runtime-fakes";

test("collectAcpRuntimeOutput returns text deltas after the last tool_call, trimmed", () => {
  const events = [
    { type: "text_delta", text: "before " },
    { type: "tool_call" },
    { type: "text_delta", text: "after-tool " },
    { type: "text_delta", text: "more text" },
  ];
  assert.equal(collectAcpRuntimeOutput(events), "after-tool more text");
});

test("collectAcpRuntimeOutput ignores text_delta events with stream === 'thought'", () => {
  const events = [
    { type: "tool_call" },
    { type: "text_delta", text: "visible " },
    { type: "text_delta", text: "hidden", stream: "thought" },
    { type: "text_delta", text: "and more" },
  ];
  assert.equal(collectAcpRuntimeOutput(events), "visible and more");
});

test("collectAcpRuntimeOutput returns empty string for empty input", () => {
  assert.equal(collectAcpRuntimeOutput([]), "");
});

test("collectAcpRuntimeOutput returns empty string when no text_delta follows the last tool_call", () => {
  const events = [
    { type: "text_delta", text: "ignored" },
    { type: "tool_call" },
  ];
  assert.equal(collectAcpRuntimeOutput(events), "");
});

test("collectAcpRuntimeOutput includes all text_deltas when no tool_call is present", () => {
  const events = [
    { type: "text_delta", text: "hello " },
    { type: "text_delta", text: "world" },
  ];
  assert.equal(collectAcpRuntimeOutput(events), "hello world");
});

test("collectAcpRuntimeOutput skips text_delta entries without text", () => {
  const events = [
    { type: "text_delta" },
    { type: "text_delta", text: "only-this" },
  ];
  assert.equal(collectAcpRuntimeOutput(events), "only-this");
});

test("formatAcpLifecycleError formats AcpRuntimeError as 'code: message'", () => {
  const error = new AcpRuntimeError("ACP_TEST_FAILURE", "something broke");
  assert.equal(formatAcpLifecycleError(error), "ACP_TEST_FAILURE: something broke");
});

test("formatAcpLifecycleError falls back to String(error) for non-AcpRuntimeError values", () => {
  assert.equal(formatAcpLifecycleError(new Error("plain error")), "Error: plain error");
  assert.equal(formatAcpLifecycleError("just a string"), "just a string");
  assert.equal(formatAcpLifecycleError(42), "42");
  assert.equal(formatAcpLifecycleError(null), "null");
});
