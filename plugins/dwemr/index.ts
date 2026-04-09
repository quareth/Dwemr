import path from "node:path";
import { definePluginEntry, type OpenClawPluginApi, type OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { tokenizeRawArgs } from "./src/openclaw/command-routing";
import { textResult, type HandlerContext } from "./src/openclaw/action-handler-types";
import {
  handleEmptyCommand,
  handleHelp,
  handleProjects,
  handleMode,
  handleUse,
  handleDoctor,
  handleStop,
  handleInit,
  handleModelConfig,
  handleGit,
  handleGenericRouted,
} from "./src/openclaw/action-handlers";
import { formatOverwriteConfirmation, initializeProject, validateInitTargetPath } from "./src/control-plane/project-assets";
import { getDefaultProjectPath, getPluginConfig, rememberProjectSelection } from "./src/openclaw/project-selection";

type RawCommandParams = {
  command?: string;
  commandName?: string;
  skillName?: string;
};

type InitToolParams = {
  targetPath: string;
  overwrite?: boolean;
  confirmOverwrite?: boolean;
};

function toRuntimeToolContext(toolContext: OpenClawPluginToolContext | undefined) {
  if (!toolContext) {
    return undefined;
  }
  return {
    sessionKey: toolContext.sessionKey,
    deliveryContext: toolContext.deliveryContext,
  };
}

export default definePluginEntry({
  id: "dwemr",
  name: "Delivery Workflow Engine & Memory Relay (DWEMR)",
  description:
    "DWEMR is an OpenClaw-to-Claude delivery bridge that initializes projects, routes `/dwemr` actions, and lets Claude Code own the internal workflow.",
  register(api: OpenClawPluginApi) {
    api.registerTool((toolContext) => ({
      name: "dwemr_command",
      label: "DWEMR Command",
      description: "Deterministic /dwemr command dispatcher.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string" },
          commandName: { type: "string" },
          skillName: { type: "string" },
        },
      },
      async execute(_id: string, params: RawCommandParams) {
        const pluginConfig = getPluginConfig(api);
        const stateDir = api.runtime.state.resolveStateDir();
        const defaultProjectPath = await getDefaultProjectPath(api);
        const tokens = tokenizeRawArgs(params.command ?? "");
        const ctx: HandlerContext = {
          pluginConfig,
          stateDir,
          defaultProjectPath,
          api,
          runtimeContext: {
            api,
            toolContext: toRuntimeToolContext(toolContext),
          },
        };

        if (tokens.length === 0) return handleEmptyCommand(ctx);

        const action = tokens[0];
        if (action === "help") return handleHelp(ctx);
        if (action === "projects") return handleProjects(ctx);
        if (action === "mode") return handleMode(ctx, tokens);
        if (action === "use") return handleUse(ctx, tokens);
        if (action === "doctor" || action === "repair") return handleDoctor(ctx, tokens);
        if (action === "stop") return handleStop(ctx, tokens);
        if (action === "init") return handleInit(ctx, tokens);
        if (action === "model" || action === "subagents" || action === "effort") return handleModelConfig(ctx, tokens);
        if (action === "git") return handleGit(ctx, tokens);

        return handleGenericRouted(ctx, tokens);
      },
    }));

    api.registerTool((_toolContext) => ({
      name: "dwemr_init",
      label: "DWEMR Init",
      description: "Initialize a target project with the DWEMR Claude-native bootstrap assets from this package.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          targetPath: {
            type: "string",
            description: "Absolute or relative path to the project to initialize.",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite existing installed DWEMR bootstrap files when true.",
          },
          confirmOverwrite: {
            type: "boolean",
            description: "Required confirmation when overwrite is true because destructive init recreates the target folder from scratch.",
          },
        },
        required: ["targetPath"],
      },
      async execute(_id: string, params: InitToolParams) {
        const targetPath = path.resolve(params.targetPath);
        const overwrite = params.overwrite ?? false;
        const confirmOverwrite = params.confirmOverwrite ?? false;
        const validation = await validateInitTargetPath(targetPath);
        if (!validation.ok) {
          return textResult(validation.error);
        }
        if (overwrite && !confirmOverwrite) {
          return textResult(formatOverwriteConfirmation(targetPath));
        }
        const summary = await initializeProject(targetPath, overwrite);
        await rememberProjectSelection(api, targetPath, { initialized: true, setActive: true });

        return textResult(`${summary}\n\nRemembered ${targetPath} as the active DWEMR project.`);
      },
    }));
  },
});
