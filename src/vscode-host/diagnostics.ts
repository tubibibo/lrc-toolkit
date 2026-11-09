import * as vscode from "vscode";

import { analyze } from "../core";
import type { LrcDiagnostic, Severity } from "../core";
import type { DocumentStore } from "./documentStore";

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

export function toVsCodeDiagnostic(
  doc: vscode.TextDocument,
  issue: LrcDiagnostic,
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(doc.positionAt(issue.start), doc.positionAt(issue.end)),
    issue.message,
    SEVERITY[issue.severity],
  );
  diagnostic.code = issue.code;
  diagnostic.source = "LRC Toolkit";
  return diagnostic;
}

/** Owns the diagnostic collection for `.lrc` files and keeps it in sync. */
export function registerDiagnostics(store: DocumentStore): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection("lrc-toolkit");

  const update = (doc: vscode.TextDocument): void => {
    if (doc.languageId !== "lrc") {
      // A document that used to be .lrc (relabelled to plaintext or another
      // language) would otherwise keep its stale diagnostics forever, because
      // only didClose clears the collection. Clear them and drop the parsed
      // cache entry so nothing survives the relabelling.
      if ((collection.get(doc.uri)?.length ?? 0) > 0) {
        collection.delete(doc.uri);
        store.evict(doc.uri);
      }
      return;
    }
    const lrcDoc = store.get(doc);
    collection.set(
      doc.uri,
      analyze(lrcDoc).map((issue) => toVsCodeDiagnostic(doc, issue)),
    );
  };

  for (const doc of vscode.workspace.textDocuments) {
    update(doc);
  }

  return vscode.Disposable.from(
    collection,
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument((event) => update(event.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
      store.evict(doc.uri);
    }),
  );
}
