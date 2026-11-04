import * as vscode from "vscode";

import { normalizeSpacing } from "../core";
import type { DocumentStore } from "./documentStore";
import { getSettings } from "./config";

export function registerFormatter(store: DocumentStore): vscode.Disposable {
  return vscode.languages.registerDocumentFormattingEditProvider("lrc", {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      const settings = getSettings();
      const lrcDoc = store.get(document);
      return normalizeSpacing(lrcDoc, settings.spaceAfterTimestamp).map(
        (edit) =>
          new vscode.TextEdit(
            new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
            edit.newText,
          ),
      );
    },
  });
}
