import assert from "node:assert/strict";
import test from "node:test";
import { formatHelpText, formatUsage, mapActionToClaudeCommand } from "../../dwemr/src/openclaw/command-routing";

test("formatUsage marks release commands as requiring the release lane", () => {
  const text = formatUsage();

  assert.match(text, /\/dwemr mode <auto\|checkpointed>/);
  assert.match(text, /\/dwemr stop \[path\]/);
  assert.doesNotMatch(text, /\/dwemr auto \[path\]/);
  assert.match(text, /\/dwemr release \[path\] \(requires git enabled\)/);
  assert.match(text, /\/dwemr pr \[path\] \(requires git enabled\)/);
  assert.doesNotMatch(text, /\/dwemr qa \[path\]/);
});

test("formatHelpText marks release commands as conditional", () => {
  const text = formatHelpText(undefined);

  assert.match(text, /mode <auto\|checkpointed>: set the execution mode for the active DWEMR project/);
  assert.match(text, /stop \[path\]: stop the active OpenClaw-managed DWEMR run for the project/);
  assert.doesNotMatch(text, /- auto \[path\]:/);
  assert.doesNotMatch(text, /qa \[path\]:/);
  assert.match(text, /release \[path\]: continue the git release lane when git is enabled for the project/);
  assert.match(text, /pr \[path\]: continue the PR\/merge lane when git is enabled for the project/);
});

test("formatHelpText omits path placeholders when an active project exists", () => {
  const text = formatHelpText("/tmp/dwemr-project");

  assert.match(text, /Active DWEMR project: \/tmp\/dwemr-project/);
  assert.match(text, /what-now: show state-aware guidance/);
  assert.match(text, /start <request>: begin a new delivery request/);
  assert.match(text, /continue: resume the active delivery flow from saved state/);
  assert.match(text, /stop: stop the active OpenClaw-managed DWEMR run for the project/);
  assert.doesNotMatch(text, /start \[path\] <request>/);
  assert.doesNotMatch(text, /continue \[path\]/);
});

test("project-scoped actions point users to init first when no active project exists", () => {
  const mapped = mapActionToClaudeCommand("start", undefined, ["start", "Build", "a", "tool"], undefined);

  assert.ok("error" in mapped);
  assert.match(mapped.error, /DWEMR cannot run `start` yet because there is no active project/);
  assert.match(mapped.error, /Run `\/dwemr init <path>` first to initialize a project and make it active/);
});

test("project-scoped actions use the active project when no explicit path is provided", () => {
  const mapped = mapActionToClaudeCommand("start", undefined, ["start", "Build", "a", "tool"], "/tmp/dwemr-project");

  assert.ok(!("error" in mapped));
  assert.equal(mapped.targetPath, "/tmp/dwemr-project");
  assert.equal(mapped.claudeCommand, "/delivery-start Build a tool");
});
