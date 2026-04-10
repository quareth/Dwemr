import { isAcpRuntimeError } from "openclaw/plugin-sdk/acp-runtime";

export function collectAcpRuntimeOutput(events: Array<{ type: string; text?: string; stream?: string }>) {
  let lastToolCallIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "tool_call") {
      lastToolCallIndex = i;
      break;
    }
  }
  let output = "";
  for (let i = lastToolCallIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.type === "text_delta" && event.stream !== "thought" && event.text) {
      output += event.text;
    }
  }
  return output.trim();
}

export function formatAcpLifecycleError(error: unknown) {
  return isAcpRuntimeError(error) ? `${error.code}: ${error.message}` : String(error);
}
