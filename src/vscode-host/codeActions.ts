import * as vscode from "vscode";

import { allTags, analyze, isCommandId, shouldOfferSortAction } from "../core";
import type { LrcDiagnostic, LrcDocument } from "../core";
import type { DocumentStore } from "./documentStore";
import { toVsCodeDiagnostic } from "./diagnostics";

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

/** Exported for the in-process adapter tests (see test/vscode-host/codeActions.test.ts). */
export class LrcCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly store: DocumentStore) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const lrcDoc = this.store.get(document);
    const issues = analyze(lrcDoc);

    if (requested(context, vscode.CodeActionKind.QuickFix)) {
      actions.push(...this.quickFixes(document, range, issues));
    }
    if (requested(context, vscode.CodeActionKind.Source)) {
      actions.push(...this.sourceActions(lrcDoc, context, issues));
    }
    return actions;
  }

  private quickFixes(
    document: vscode.TextDocument,
    range: vscode.Range,
    issues: LrcDiagnostic[],
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const issue of issues) {
      // Computed once per diagnostic — the per-fix loop must not rebuild it
      // (review fix R10: the fixes[] migration had nested this construction).
      const issueRange = new vscode.Range(
        document.positionAt(issue.start),
        document.positionAt(issue.end),
      );
      if (!issueRange.intersection(range)) {
        continue;
      }
      // A diagnostic may carry several fixes (e.g. carry or clamp for an
      // out-of-range timestamp) — each becomes its own Quick Fix action.
      for (const fix of issue.fixes ?? []) {
        if (fix.command && isCommandId(fix.command)) {
          const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
          action.command = { title: fix.title, command: `lrcToolkit.${fix.command}` };
          action.diagnostics = [toVsCodeDiagnostic(document, issue)];
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
          action.diagnostics = [toVsCodeDiagnostic(document, issue)];
          actions.push(action);
        }
      }
    }
    return actions;
  }

  private sourceActions(
    lrcDoc: LrcDocument,
    context: vscode.CodeActionContext,
    issues: LrcDiagnostic[],
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Sorted files should not see a permanent "Sort" entry on every lightbulb;
    // offer it when the timeline is broken or the Refactor menu asked for it.
    const explicit = context.only !== undefined && requested(context, SOURCE_SORT);
    if (
      shouldOfferSortAction({
        explicitlyRequested: explicit,
        hasDecreasingTimestamps: issues.some((issue) => issue.code === "decreasing-timestamp"),
      })
    ) {
      const sort = new vscode.CodeAction("Sort all lines by timestamp", SOURCE_SORT);
      sort.command = { title: sort.title, command: "lrcToolkit.sortByTimestamp" };
      actions.push(sort);
    }

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

    const hasOffsetTag = lrcDoc.lines.some(
      (line) => line.kind === "tag" && allTags(line).some((tag) => tag.key === "offset"),
    );
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
