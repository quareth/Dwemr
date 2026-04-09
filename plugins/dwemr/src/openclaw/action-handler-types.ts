import type { DwemrPluginConfig } from "./project-selection";

export type HandlerContext = {
  pluginConfig: DwemrPluginConfig;
  stateDir: string;
  defaultProjectPath: string | undefined;
  api: unknown;
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
