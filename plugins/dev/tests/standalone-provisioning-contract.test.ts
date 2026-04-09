import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPackDefinition } from "../../dwemr/install-packs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dwemr");

function readRelative(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("shared CLAUDE guide documents provisioning_pending as a standalone stop condition", () => {
  const text = readRelative("templates/CLAUDE.md");

  assert.match(text, /install_stage/);
  assert.match(text, /profile_installed/);
  assert.match(text, /\/dwemr continue/);
  assert.match(text, /\/dwemr start <request>/);
});

test("bootstrap pack does not ship local Claude settings (permissions are set via ACP session API)", () => {
  const bootstrap = getPackDefinition("bootstrap");
  const targets = bootstrap.entries.map((entry) => entry.targetPath);

  assert.ok(!targets.includes(".claude/settings.json"));
});

test("bootstrap pack ships delivery-driver and no longer treats delivery-onboard as a bootstrap command", () => {
  const bootstrap = getPackDefinition("bootstrap");
  const targets = bootstrap.entries.map((entry) => entry.targetPath);

  assert.ok(targets.includes(".claude/commands/delivery-driver.md"));
  assert.ok(!targets.includes(".claude/commands/delivery-onboard.md"));
});

for (const relativePath of [
  "templates/.claude/commands/delivery-driver.md",
  "templates/.claude/commands/delivery-start.md",
  "templates/.claude/commands/delivery-plan.md",
  "templates/.claude/commands/delivery-continue.md",
  "templates/.claude/commands/delivery-what-now.md",
  "templates/.claude/commands/delivery-status.md",
  "templates/.claude/commands/delivery-pr.md",
]) {
  test(`${relativePath} documents the provisioning-pending standalone gate`, () => {
    const text = readRelative(relativePath);

    assert.match(text, /install_stage/);
    assert.match(text, /profile_installed/);
    assert.match(text, /\/dwemr/);
  });
}

test("delivery-start and delivery-plan force standalone onboarding through delivery-driver and stop with plain clarification output", () => {
  const start = readRelative("templates/.claude/commands/delivery-start.md");
  const plan = readRelative("templates/.claude/commands/delivery-plan.md");

  for (const text of [start, plan]) {
    assert.match(text, /invoke `\/delivery-driver onboarding` exactly/);
    assert.match(text, /do not dispatch `interviewer` directly/i);
    assert.match(text, /present the saved clarification batch verbatim as plain final output and stop/i);
    assert.match(text, /do not turn onboarding clarification into an interactive questionnaire, form, wizard, live interview step, or answer-collection flow/i);
  }

  assert.doesNotMatch(plan, /\/delivery-onboard/);
});
