import * as vscode from "vscode";

import { analyze, isCommandId } from "../core";
import type { LrcDiagnostic, LrcDocument } from "../core";
import type { DocumentStore } from "./documentStore";

const SOURCE_SORT = vscode.CodeActionKind.Source.append("lrc.sort");

export function registerCodeActions(store: DocumentStore): vscode.Disposable {
  return vscode.languages.registerCodeActionsProvider("lrc", new LrcCodeActionProvider(store), {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, SOURCE_SORT],
  });
}

function requested(context: vscode.CodeActionContext, kind: vscode.CodeActionKind): boolean {
  const only = context.only;
  return !only || only.contains(kind) || kind.contains(only);
}

class LrcCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly store: DocumentStore) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const lrcDoc = this.store.get(document);

    if (requested(context, vscode.CodeActionKind.QuickFix)) {
      actions.push(...this.quickFixes(document, range, lrcDoc));
    }
    if (requested(context, vscode.CodeActionKind.Source) || requested(context, SOURCE_SORT)) {
      actions.push(...this.sourceActions(lrcDoc));
    }
    return actions;
  }

  private quickFixes(
    document: vscode.TextDocument,
    range: vscode.Range,
    lrcDoc: LrcDocument,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const issue of analyze(lrcDoc)) {
      if (!issue.fix) {
        continue;
      }
      const issueRange = new vscode.Range(
        document.positionAt(issue.start),
        document.positionAt(issue.end),
      );
      if (!issueRange.intersection(range)) {
        continue;
      }
      const fix = issue.fix;
      if (fix.command && isCommandId(fix.command)) {
        const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
        action.command = { title: fix.title, command: `lrcToolkit.${fix.command}` };
        action.diagnostics = [toDiagnostic(document, issue)];
        actions.push(action);
      } else if (fix.edits) {
        const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        for (const edit of fix.edits) {
          action.edit.replace(
            document.uri,
            new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
            edit.newText,
          );
        }
        action.diagnostics = [toDiagnostic(document, issue)];
        actions.push(action);
      }
    }
    return actions;
  }

  private sourceActions(lrcDoc: LrcDocument): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    const sort = new vscode.CodeAction("Sort all lines by timestamp", SOURCE_SORT);
    sort.command = { title: sort.title, command: "lrcToolkit.sortByTimestamp" };
    actions.push(sort);

    const hasWordTimings = lrcDoc.lines.some(
      (line) =>
        line.kind === "cue" && (line.wordTimings.length > 0 || line.invalidWordTimings.length > 0),
    );
    if (hasWordTimings) {
      const strip = new vscode.CodeAction(
        "Strip enhanced (word-level) timings",
        vscode.CodeActionKind.Source,
      );
      strip.command = { title: strip.title, command: "lrcToolkit.stripWordTimings" };
      actions.push(strip);
    }

    const hasOffsetTag = lrcDoc.lines.some((line) => line.kind === "tag" && line.key === "offset");
    if (hasOffsetTag) {
      const apply = new vscode.CodeAction(
        "Apply [offset:] tag into timestamps",
        vscode.CodeActionKind.Source,
      );
      apply.command = { title: apply.title, command: "lrcToolkit.applyOffsetTag" };
      actions.push(apply);
    }

    return actions;
  }
}

function toDiagnostic(document: vscode.TextDocument, issue: LrcDiagnostic): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(document.positionAt(issue.start), document.positionAt(issue.end)),
    issue.message,
    issue.severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : issue.severity === "warning"
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information,
  );
  diagnostic.code = issue.code;
  diagnostic.source = "LRC Toolkit";
  return diagnostic;
}
