import * as vscode from "vscode";

export interface ToolkitSettings {
  gapThresholdSeconds: number;
  spaceAfterTimestamp: boolean;
  sortKeepSectionLabels: boolean;
}

function sanitizeThreshold(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 8;
}

function sanitizeFlag(value: boolean | undefined): boolean {
  return value === true;
}

/** Read the `lrcToolkit.*` configuration section. */
export function getSettings(): ToolkitSettings {
  const config = vscode.workspace.getConfiguration("lrcToolkit");
  return {
    gapThresholdSeconds: sanitizeThreshold(config.get<number>("gapThresholdSeconds")),
    spaceAfterTimestamp: config.get<boolean>("format.spaceAfterTimestamp", false),
    sortKeepSectionLabels: sanitizeFlag(config.get<boolean>("sort.keepSectionLabels")),
  };
}
