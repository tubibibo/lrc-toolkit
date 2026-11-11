import * as vscode from "vscode";
import { basename } from "path";

import {
  computeStats,
  formatStatsReport,
  formatStatsSummary,
  formatSrt,
  lrcToSrtCues,
  parseSrt,
  runCommand,
  srtCuesToLrc,
} from "../core";
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
      keepUnrecognized: settings.sortKeepSectionLabels,
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

  /**
   * Import an SRT/WebVTT file as a new untitled .lrc document. Reads the
   * chosen file itself, so it works from any editor — the palette entry is
   * deliberately not filtered to LRC files.
   */
  const executeImportSrt = async (): Promise<void> => {
    const open = await vscode.window.showOpenDialog({
      title: "Import subtitles as LRC",
      canSelectMany: false,
      filters: { "Subtitles (SRT/VTT)": ["srt", "vtt"] },
    });
    const file = open?.[0];
    if (!file) {
      return;
    }
    let text: string;
    try {
      text = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
    } catch {
      void vscode.window.showErrorMessage(
        `LRC Toolkit: could not read "${basename(file.fsPath)}" — the file may have been moved or locked.`,
      );
      return;
    }
    const { cues, droppedBlocks } = parseSrt(text);
    if (cues.length === 0) {
      void vscode.window.showInformationMessage(
        `LRC Toolkit: no subtitle cues found in "${basename(file.fsPath)}" — the file may be empty or not in SRT/VTT format.`,
      );
      return;
    }
    const document = await vscode.workspace.openTextDocument({
      content: srtCuesToLrc(cues),
      language: "lrc",
    });
    await vscode.window.showTextDocument(document);
    const dropped = droppedBlocks > 0 ? `; dropped ${droppedBlocks} non-cue block(s)` : "";
    void vscode.window.showInformationMessage(
      `LRC Toolkit: imported ${cues.length} cue(s) into an untitled .lrc document${dropped}.`,
    );
  };

  /** Export the active .lrc document as SRT, never silently overwriting. */
  const executeExportSrt = async (): Promise<void> => {
    const editor = activeLrcEditor();
    if (!editor) {
      void vscode.window.showInformationMessage("Open a .lrc file to use LRC Toolkit commands.");
      return;
    }
    const cues = lrcToSrtCues(store.get(editor.document));
    if (cues.length === 0) {
      void vscode.window.showInformationMessage(
        "LRC Toolkit: no timestamped lyric lines to export.",
      );
      return;
    }
    const saved = editor.document.uri.scheme !== "untitled";
    const proposedName = `${basename(editor.document.uri.fsPath).replace(/\.lrc$/i, "")}.srt`;
    const target = await vscode.window.showSaveDialog({
      title: "Export as SRT",
      filters: { "SubRip subtitles": ["srt"] },
      ...(saved && proposedName !== ".srt" ? { defaultUri: vscode.Uri.file(proposedName) } : {}),
    });
    if (!target) {
      return;
    }
    // Never overwrite silently: a simple modal confirm for existing files.
    try {
      await vscode.workspace.fs.stat(target);
      const overwrite = await vscode.window.showWarningMessage(
        `"${basename(target.fsPath)}" already exists. Overwrite it?`,
        { modal: true },
        "Overwrite",
      );
      if (overwrite !== "Overwrite") {
        return;
      }
    } catch {
      // stat failing means the file does not exist yet — safe to write.
    }
    try {
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(formatSrt(cues)));
    } catch {
      void vscode.window.showErrorMessage(
        `LRC Toolkit: could not write "${basename(target.fsPath)}" — the location may be read-only.`,
      );
      return;
    }
    void vscode.window.showInformationMessage(
      `LRC Toolkit: exported ${cues.length} cue(s) to "${basename(target.fsPath)}".`,
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
    ["lrcToolkit.mergeBilingualLines", () => execute("mergeBilingualLines")],
    ["lrcToolkit.splitBilingualLines", () => execute("splitBilingualLines")],
    ["lrcToolkit.invertOffsetSign", () => execute("invertOffsetSign")],
    ["lrcToolkit.importSrt", executeImportSrt],
    ["lrcToolkit.exportSrt", executeExportSrt],
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
