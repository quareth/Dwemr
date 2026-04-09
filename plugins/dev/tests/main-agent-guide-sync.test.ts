import assert from "node:assert/strict";
import test from "node:test";
import { getPackDefinition } from "../../dwemr/install-packs";

test("bootstrap pack ships the template CLAUDE.md into project root", () => {
  const bootstrap = getPackDefinition("bootstrap");
  const entry = bootstrap.entries.find((candidate) => candidate.targetPath === "CLAUDE.md");

  assert.ok(entry);
  assert.equal(entry.type, "copy");
});

test("bootstrap pack no longer ships AGENTS.md", () => {
  const bootstrap = getPackDefinition("bootstrap");
  const entry = bootstrap.entries.find((candidate) => candidate.targetPath === "AGENTS.md");

  assert.equal(entry, undefined);
});
