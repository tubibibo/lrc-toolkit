import * as vscode from "vscode";

import { formatClock } from "../util/time";
import type { DocumentStore } from "./documentStore";

export function registerSymbols(store: DocumentStore): vscode.Disposable {
  return vscode.languages.registerDocumentSymbolProvider("lrc", {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
      const lrcDoc = store.get(document);
      const symbols: vscode.DocumentSymbol[] = [];

      for (const line of lrcDoc.lines) {
        const range = new vscode.Range(
          document.positionAt(line.span.start),
          document.positionAt(line.span.end),
        );
        if (line.kind === "tag") {
          symbols.push(
            new vscode.DocumentSymbol(
              `${line.key}: ${line.value.trim()}`,
              line.key,
              vscode.SymbolKind.Property,
              range,
              range,
            ),
          );
          continue;
        }
        if (line.kind === "cue") {
          const stamp = line.stamps[0];
          const text = line.text.trim().slice(0, 40);
          const label = stamp ? `${formatClock(stamp.stamp.totalMs)} ${text}` : text;
          if (label.trim().length > 0) {
            symbols.push(
              new vscode.DocumentSymbol(label, "cue", vscode.SymbolKind.Event, range, range),
            );
          }
        }
      }
      return symbols;
    },
  });
}
