import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formatDoctorText } from "../../dwemr/src/openclaw/doctor";
import { formatBootstrapPendingStatus, prepareOnboardingStateForEntry } from "../../dwemr/src/control-plane/onboarding-flow";
import { formatOnboardingState, normalizeOnboardingState } from "../../dwemr/src/control-plane/onboarding-state";
import type { DwemrPluginConfig } from "../../dwemr/src/openclaw/project-selection";
import type { DwemrRuntimeInspection } from "../../dwemr/src/openclaw/runtime";
import type { DwemrRuntimeState } from "../../dwemr/src/openclaw/runtime-backend";
import { DWEMR_CONTRACT_VERSION } from "../../dwemr/src/control-plane/state-contract";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateClaudeCommandSurface } from "../../dwemr/src/openclaw/claude-runner";
import { buildProjectHealth } from "./fixtures/builders";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dwemr");

function readRelative(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

const runtimeInspection: DwemrRuntimeInspection = {
  openclawPackageRoot: "/tmp/openclaw",
  openclawAcpxExtensionPath: "/tmp/openclaw/dist/extensions/acpx",
  openclawAcpxExtensionDetected: true,
  managedRuntimeDir: "/tmp/dwemr-runtime",
  managedCommandPath: "/tmp/dwemr-runtime/bin/acpx",
  managedMetadataPath: "/tmp/dwemr-runtime/runtime.json",
  managedReady: false,
  overrideReady: false,
  readyCommandPath: undefined,
  readySource: undefined,
  bootstrapSourcePath: undefined,
  bootstrapSourceKind: undefined,
  overrideCommandPath: undefined,
};

const runtimeState: DwemrRuntimeState = {
  backendKind: "spawn",
  ready: false,
  shellInspection: runtimeInspection,
};

test("normalizeOnboardingState canonicalizes saved clarification batches", () => {
  const state = normalizeOnboardingState({
    status: "pending",
    requestContext: "Build an internal tool.",
    clarificationSummary: "Need one product-shaping answer before profile selection.",
    clarificationQuestions: ["Is this a one-off tool or something expected to grow into a multi-feature app?"],
    planningMode: "full",
    selectedPacks: ["profile-minimal-tool"],
    requiredArtifacts: ["implementation_guide"],
  });

  assert.equal(state.status, "awaiting_clarification");
  assert.equal(state.requestContext, "Build an internal tool.");
  assert.deepEqual(state.selectedPacks, []);
  assert.deepEqual(state.requiredArtifacts, []);
  assert.equal(state.installStage, "bootstrap_only");
});

test("normalizeOnboardingState keeps legacy active readable but never persists it", () => {
  const state = normalizeOnboardingState({
    status: "active" as never,
    requestContext: "Build a calculator utility.",
  });

  assert.equal(state.status, "pending");
  assert.match(formatOnboardingState(state), /Onboarding request context is recorded/);
  assert.doesNotMatch(formatOnboardingState(state), /"active"/);
});

test("normalizeOnboardingState treats complete as valid only when a selected profile exists", () => {
  const incomplete = normalizeOnboardingState({
    status: "complete",
  });
  const complete = normalizeOnboardingState({
    status: "pending",
    selectedProfile: "minimal_tool",
    selectedPacks: ["profile-minimal-tool"],
    requiredArtifacts: ["implementation_guide"],
  });

  assert.equal(incomplete.status, "pending");
  assert.equal(complete.status, "complete");
  assert.equal(complete.installStage, "provisioning_pending");
});

test("prepareOnboardingStateForEntry captures a brand-new request-bearing onboarding command", () => {
  const prepared = prepareOnboardingStateForEntry(normalizeOnboardingState(undefined), "start", "Build a calculator utility.");

  assert.equal(prepared.status, "pending");
  assert.equal(prepared.entryAction, "start");
  assert.equal(prepared.requestContext, "Build a calculator utility.");
  assert.equal(prepared.clarificationResponse, "");
});

test("prepareOnboardingStateForEntry preserves the original request when answering clarification", () => {
  const prepared = prepareOnboardingStateForEntry(
    normalizeOnboardingState({
      status: "pending",
      requestContext: "Build an internal tool.",
      clarificationSummary: "Need one answer before profile selection.",
      clarificationQuestions: ["Will this stay bounded to one workflow or grow into a multi-feature app?"],
    }),
    "plan",
    "It should stay a bounded internal tool.",
  );

  assert.equal(prepared.status, "awaiting_clarification");
  assert.equal(prepared.entryAction, "plan");
  assert.equal(prepared.requestContext, "Build an internal tool.");
  assert.equal(prepared.clarificationResponse, "It should stay a bounded internal tool.");
});

test("formatBootstrapPendingStatus points pending clarification back to start", () => {
  const text = formatBootstrapPendingStatus(
    "/tmp/dwemr-project",
    buildProjectHealth({
      onboardingState: normalizeOnboardingState({
        status: "pending",
        requestContext: "Build an internal tool.",
        clarificationSummary: "Need one answer before profile selection.",
        clarificationQuestions: ["Will this stay bounded to one workflow or grow into a multi-feature app?"],
      }),
    }),
  );

  assert.match(text, /Answer the pending clarification with `\/dwemr start <response>`\./);
  assert.match(text, /`\/dwemr continue` and `\/dwemr what-now` will only repeat the current clarification batch/);
});

test("formatBootstrapPendingStatus keeps brand-new pending onboarding on request-bearing commands", () => {
  const text = formatBootstrapPendingStatus("/tmp/dwemr-project", buildProjectHealth());

  assert.match(text, /Run `\/dwemr start <request>` or `\/dwemr plan <request>` to supply the initial onboarding request\./);
  assert.match(text, /do not start first-pass project classification/);
});

test("formatDoctorText points clarification follow-up to start and keeps what-now read-only", () => {
  const text = formatDoctorText(
    {
      runtime: runtimeState,
      runtimeReady: false,
      runtimeLedgerNotes: [],
      project: buildProjectHealth({
        onboardingState: normalizeOnboardingState({
          status: "pending",
          requestContext: "Build an internal tool.",
          clarificationSummary: "Need one answer before profile selection.",
          clarificationQuestions: ["Will this stay bounded to one workflow or grow into a multi-feature app?"],
        }),
      }),
      fixApplied: false,
      fixNotes: [],
      claudeProbe: { status: "skipped", detail: "Skipped because no execution runtime is ready yet." },
    },
    {} satisfies DwemrPluginConfig,
    undefined,
  );

  assert.match(text, /Answer the pending onboarding clarification with `\/dwemr start <response>` or `\/dwemr plan <response>`\./);
  assert.match(text, /Run `\/dwemr what-now` if you just want to review the saved clarification batch again\./);
});

test("formatDoctorText points unsupported contracts to init overwrite", () => {
  const text = formatDoctorText(
    {
      runtime: runtimeState,
      runtimeReady: false,
      runtimeLedgerNotes: [],
      project: buildProjectHealth({
        installState: "unsupported_contract",
        contractIssues: [`.dwemr/state/pipeline-state.md: missing \`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}\``],
      }),
      fixApplied: true,
      fixNotes: [
        "DWEMR did not auto-upgrade /tmp/dwemr-project. Run `/dwemr init /tmp/dwemr-project --overwrite --confirm-overwrite` to destroy the current target folder contents and adopt the current contract from scratch.",
      ],
      claudeProbe: { status: "skipped", detail: "Skipped because no execution runtime is ready yet." },
    },
    {} satisfies DwemrPluginConfig,
    undefined,
  );

  assert.match(text, /DWEMR contract: unsupported/);
  assert.ok(text.includes(`Contract issue: .dwemr/state/pipeline-state.md: missing \`dwemr_contract_version: ${DWEMR_CONTRACT_VERSION}\``));
  assert.match(
    text,
    /Run `\/dwemr init \/tmp\/dwemr-project --overwrite --confirm-overwrite` to destroy the existing target folder contents and reinstall the current DWEMR contract from scratch\./,
  );
  assert.match(text, /DWEMR did not auto-upgrade \/tmp\/dwemr-project/);
});

test("formatDoctorText gives ACPX recovery guidance when runtime bootstrap still cannot find a command", () => {
  const text = formatDoctorText(
    {
      runtime: runtimeState,
      runtimeReady: false,
      runtimeLedgerNotes: [],
      project: buildProjectHealth(),
      fixApplied: true,
      fixNotes: [
        "Could not bootstrap the managed ACPX runtime automatically.",
        "OpenClaw's ACPX runtime plugin is installed, but DWEMR could not find a runnable ACPX command from that install.",
      ],
      claudeProbe: { status: "skipped", detail: "Skipped because no execution runtime is ready yet." },
    },
    {} satisfies DwemrPluginConfig,
    undefined,
  );

  assert.match(text, /Legacy ACPX compatibility diagnostics:/);
  assert.match(text, /Try `openclaw plugins install acpx`, then restart the gateway and rerun `\/dwemr doctor --fix`\./);
  assert.match(text, /set `plugins\.entries\.dwemr\.config\.acpxPath` to the executable path/);
  assert.doesNotMatch(text, /PATH-based `acpx` executable/);
  assert.doesNotMatch(text, /Retry the original command/);
});

test("formatDoctorText no-extension ACPX guidance does not mention PATH fallback", () => {
  const text = formatDoctorText(
    {
      runtime: {
        backendKind: "spawn",
        ready: false,
        shellInspection: {
          ...runtimeInspection,
          openclawAcpxExtensionDetected: false,
          openclawAcpxExtensionPath: undefined,
        },
      },
      runtimeReady: false,
      runtimeLedgerNotes: [],
      project: buildProjectHealth(),
      fixApplied: true,
      fixNotes: [
        "Could not bootstrap the managed ACPX runtime automatically.",
      ],
      claudeProbe: { status: "skipped", detail: "Skipped because no execution runtime is ready yet." },
    },
    {} satisfies DwemrPluginConfig,
    undefined,
  );

  assert.match(text, /No OpenClaw ACPX runtime was detected for DWEMR bootstrap\./);
  assert.doesNotMatch(text, /PATH-based `acpx` executable/);
});

test("formatOnboardingState renders clarification and plain pending states differently", () => {
  const clarification = formatOnboardingState(
    normalizeOnboardingState({
      clarificationSummary: "Need one answer before profile selection.",
      clarificationQuestions: ["Will this stay bounded to one workflow or grow into a multi-feature app?"],
    }),
  );
  const pending = formatOnboardingState(
    normalizeOnboardingState({
      requestContext: "Build a calculator utility.",
    }),
  );

  assert.match(clarification, /Onboarding is waiting on one clarification batch/);
  assert.match(pending, /Onboarding request context is recorded and ready for the next headless onboarding pass/);
});

test("delivery-driver onboarding owns the strict interviewer invocation contract", () => {
  const text = readRelative("templates/.claude/commands/delivery-driver.md");

  assert.match(text, /\/delivery-driver onboarding/);
  assert.match(text, /dispatch `interviewer` with only the raw saved onboarding request text from `request_context`/);
  assert.match(text, /STOP_ON=onboarding_complete\|blocked_waiting_human\|explicit_block/);
  assert.doesNotMatch(text, /STOP_ON=.*awaiting_clarification/);
  assert.match(text, /dispatch `interviewer` with only:/);
  assert.match(text, /saved `clarification_questions`/);
  assert.match(text, /exact user answer text from `clarification_response`/);
  assert.match(text, /do not prepend analysis/i);
  assert.match(text, /dispatch `prompt-enhancer` with only:/);
  assert.match(text, /same saved `clarification_questions`/);
  assert.match(text, /same exact user answer text from the saved `clarification_response`/);
  assert.match(text, /`prompt-enhancer` must not change onboarding state or config/i);
  assert.match(text, /If onboarding completed without a clarification-response pass, do not run `prompt-enhancer`/);
  assert.match(text, /Do not route to `product-manager`, `delivery-manager`, `planning-manager`/i);
});

test("interviewer prompt resolves bootstrap unset config through one bundled clarification batch", () => {
  const text = readRelative("templates/.claude/agents/interviewer.md");

  assert.match(text, /project\.size: unset/);
  assert.match(text, /delivery\.execution_mode: unset/);
  assert.match(text, /any `scm\.\*: unset` value/i);
  assert.match(text, /one bundled clarification batch that resolves project size, execution mode, and SCM capability/i);
  assert.match(text, /You are a technical translator:/i);
  assert.match(text, /do not present a menu of guessed technical features/i);
  assert.match(text, /infer the simplest coherent MVP and high-level design hints from the prompt/i);
  assert.match(text, /never exceed eight total onboarding questions in one bundled clarification batch/i);
  assert.match(text, /What real-life task or problem do you want this tool to help with\? One example is enough\./);
  assert.match(text, /that first question is the only allowed free-form question in onboarding/i);
  assert.match(text, /every other question must be answerable with a single letter choice/i);
  assert.match(text, /each question must have between 2 and 4 predefined options, never more/i);
  assert.match(text, /the user should be able to answer tersely like `1: I need to test webhook payloads before release 2B 3A 4C`/i);
  assert.match(text, /do not add long explanatory paragraphs, feature menus, or mini-essays under the questions/i);
  assert.match(text, /one short free-form use-case question plus up to four short multiple-choice scope questions/i);
  assert.match(text, /## Onboarding clarification pending/);
  assert.match(text, /To finalize the project profile and workflow, please answer these questions:/);
  assert.match(text, /\*\*1\. <free-form use-case question>\*\*/);
  assert.match(text, /\*\*2\. <multiple-choice scope question>\*\*/);
  assert.match(text, /- A: <short option>/);
  assert.match(
    text,
    /To continue, send your answers back through the outer runtime's next request-bearing onboarding entrypoint \(you can answer tersely, e\.g\., `1: <short free-form answer> 2B 3A 4A 5A 6A`\)\./,
  );
  assert.match(text, /do not include internal narration, tool logs, or state-update commentary inside the clarification batch/i);
  assert.match(text, /do not hardcode one product-specific example question set into the template itself/i);
  assert.match(text, /adapt the actual scope questions and answer options to the current request/i);
  assert.match(text, /6\. How should the workflow run while building this\?/);
  assert.match(text, /A\. Keep going until blocked/);
  assert.match(text, /7\. What code workflow do you want\?/);
  assert.match(text, /C\. Use GitHub with automatic pull requests and auto-merge/);
  assert.match(text, /If the user responds with one short free-text answer followed by compact codes like `1: I need to test webhook payloads before release 2B 3A 4C 5B 6A 7C`, treat that as a complete valid clarification response/i);
  assert.match(text, /Do not present raw config labels such as `autonomous`, `checkpointed`, `git_mode`/i);
  assert.match(text, /set `project\.size` to the same value as the selected profile/i);
  assert.match(text, /do not leave `project\.size`, `delivery\.execution_mode`, or any `scm\.\*` field as `unset`/i);
  assert.match(text, /For every profile, `qa_mode` shapes quality strictness in planning, guides, and reviewer expectations only/i);
  assert.doesNotMatch(text, /minimal_qa/);
});

test("prompt-enhancer is shipped as a bootstrap agent with a narrow contract", () => {
  const text = readRelative("templates/.claude/agents/prompt-enhancer.md");

  assert.match(text, /Post-onboarding prompt translator/i);
  assert.match(text, /write `\.dwemr\/memory\/global\/prompt\.md`/i);
  assert.match(text, /do not modify `\.dwemr\/project-config\.yaml`/i);
  assert.match(text, /do not modify `\.dwemr\/state\/onboarding-state\.md`/i);
  assert.match(text, /do not read the repo to infer extra scope/i);
  assert.match(text, /Original request preserved verbatim: yes\/no/);
});

test("delivery-driver onboarding is translated away from user-facing command output", () => {
  const translated = translateClaudeCommandSurface("Run /delivery-driver onboarding and stop.");

  assert.doesNotMatch(translated, /\/delivery-driver/);
  assert.match(translated, /DWEMR onboarding/);
});
