import * as vscode from "vscode";

import { allTags } from "../core";
import { formatClock } from "../util/time";
import type { DocumentStore } from "./documentStore";

export function registerSymbols(store: DocumentStore): vscode.Disposable {
  return vscode.languages.registerDocumentSymbolProvider("lrc", {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
      const lrcDoc = store.get(document);
      const symbols: vscode.DocumentSymbol[] = [];

      for (const line of lrcDoc.lines) {
        if (line.kind === "tag") {
          for (const tag of allTags(line)) {
            const tagRange = new vscode.Range(
              document.positionAt(tag.span.start),
              document.positionAt(tag.span.end),
            );
            symbols.push(
              new vscode.DocumentSymbol(
                `${tag.key}: ${tag.value.trim()}`,
                tag.key,
                vscode.SymbolKind.Property,
                tagRange,
                tagRange,
              ),
            );
          }
          continue;
        }
        if (line.kind === "cue") {
          const range = new vscode.Range(
            document.positionAt(line.span.start),
            document.positionAt(line.span.end),
          );
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
