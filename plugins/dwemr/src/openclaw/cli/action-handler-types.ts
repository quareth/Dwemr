import type { DwemrPluginConfig } from "../state/project-selection";
import type { DwemrRuntimeBackend, DwemrRuntimeContext } from "../backend/runtime-backend-types";

export type HandlerContext = {
  pluginConfig: DwemrPluginConfig;
  stateDir: string;
  defaultProjectPath: string | undefined;
  api: unknown;
  runtimeContext?: DwemrRuntimeContext;
  runtimeBackend?: DwemrRuntimeBackend;
};

export type HandlerResult = {
  content: [{ type: "text"; text: string }];
  details: {
    kind: "text";
    text: string;
  };
};

export function textResult(text: string): HandlerResult {
  return {
    content: [{ type: "text", text }],
    details: {
      kind: "text",
      text,
    },
  };
}
