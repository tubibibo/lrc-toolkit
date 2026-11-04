import * as vscode from "vscode";

export interface ToolkitSettings {
  gapThresholdSeconds: number;
  spaceAfterTimestamp: boolean;
}

function sanitizeThreshold(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 8;
}

/** Read the `lrcToolkit.*` configuration section. */
export function getSettings(): ToolkitSettings {
  const config = vscode.workspace.getConfiguration("lrcToolkit");
  return {
    gapThresholdSeconds: sanitizeThreshold(config.get<number>("gapThresholdSeconds")),
    spaceAfterTimestamp: config.get<boolean>("format.spaceAfterTimestamp", false),
  };
}
