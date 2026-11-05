import * as vscode from "vscode";

import { computeStats, formatStatsReport, formatStatsSummary, runCommand } from "../core";
import type { CommandId, CommandOptions, TextEdit } from "../core";
import { getSettings } from "./config";
import type { DocumentStore } from "./documentStore";

const DELTA_PATTERN = /^-?\d+$/;

/** The active editor when it holds an `.lrc` document, or null with no nagging. */
function activeLrcEditor(): vscode.TextEditor | null {
  const editor = vscode.window.activeTextEditor;
  return editor && editor.document.languageId === "lrc" ? editor : null;
}

/** Register every user-facing command declared in `package.json`. */
export function registerCommands(store: DocumentStore): vscode.Disposable[] {
  const channel = vscode.window.createOutputChannel("LRC Toolkit");

  const execute = async (commandId: CommandId, extra: CommandOptions = {}): Promise<void> => {
    const editor = activeLrcEditor();
    if (!editor) {
      void vscode.window.showInformationMessage("Open a .lrc file to use LRC Toolkit commands.");
      return;
    }
    const settings = getSettings();
    const outcome = runCommand(commandId, editor.document.getText(), {
      gapThresholdSeconds: settings.gapThresholdSeconds,
      ...extra,
    });
    if (outcome.edits.length > 0) {
      const applied = await applyEdits(editor, outcome.edits);
      if (!applied) {
        // applyEdit fails silently on read-only (or externally changed)
        // documents — never report success for edits that did not land.
        void vscode.window.showWarningMessage(
          "LRC Toolkit: the edits could not be applied — the document may be read-only.",
        );
        return;
      }
    }
    for (const message of outcome.messages) {
      void vscode.window.showInformationMessage(message);
    }
  };

  const executeShift = async (): Promise<void> => {
    const input = await vscode.window.showInputBox({
      title: "Shift all timestamps",
      prompt:
        "Enter the shift in milliseconds. Negative values move lyrics earlier, positive values move them later.",
      placeHolder: "e.g. -250 or 500",
      validateInput: (value) =>
        DELTA_PATTERN.test(value.trim()) ? null : "Enter an integer number of milliseconds.",
    });
    if (input === undefined) {
      return;
    }
    await execute("shiftTimestamps", { deltaMs: Number(input.trim()) });
  };

  const executeNormalizePrecision = async (): Promise<void> => {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "2 digits (centiseconds)", value: 2 as const },
        { label: "3 digits (milliseconds)", value: 3 as const },
      ],
      { title: "Normalize timestamp precision" },
    );
    if (!choice) {
      return;
    }
    await execute("normalizePrecision", { precision: choice.value });
  };

  const executeStats = async (): Promise<void> => {
    const editor = activeLrcEditor();
    if (!editor) {
      void vscode.window.showInformationMessage("Open a .lrc file to use LRC Toolkit commands.");
      return;
    }
    const settings = getSettings();
    const doc = store.get(editor.document);
    const stats = computeStats(doc, settings.gapThresholdSeconds);
    channel.clear();
    channel.appendLine(`${editor.document.uri.fsPath}`);
    for (const line of formatStatsReport(stats, settings.gapThresholdSeconds)) {
      channel.appendLine(line);
    }
    channel.show(true);
    void vscode.window.showInformationMessage(
      formatStatsSummary(stats, settings.gapThresholdSeconds),
    );
  };

  const registrations: Array<[string, () => Promise<void> | void]> = [
    ["lrcToolkit.sortByTimestamp", () => execute("sortByTimestamp")],
    ["lrcToolkit.shiftTimestamps", executeShift],
    ["lrcToolkit.applyOffsetTag", () => execute("applyOffsetTag")],
    ["lrcToolkit.normalizePrecision", executeNormalizePrecision],
    ["lrcToolkit.stripWordTimings", () => execute("stripWordTimings")],
    ["lrcToolkit.expandMultiStampLines", () => execute("expandMultiStampLines")],
    ["lrcToolkit.showStats", executeStats],
  ];

  return [
    channel,
    ...registrations.map(([id, handler]) => vscode.commands.registerCommand(id, handler)),
  ];
}

async function applyEdits(editor: vscode.TextEditor, edits: TextEdit[]): Promise<boolean> {
  const workspaceEdit = new vscode.WorkspaceEdit();
  const uri = editor.document.uri;
  for (const edit of edits) {
    workspaceEdit.replace(
      uri,
      new vscode.Range(
        editor.document.positionAt(edit.start),
        editor.document.positionAt(edit.end),
      ),
      edit.newText,
    );
  }
  return vscode.workspace.applyEdit(workspaceEdit);
}
