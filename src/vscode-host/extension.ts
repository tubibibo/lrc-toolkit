import type * as vscode from "vscode";

import { DocumentStore } from "./documentStore";
import { registerDiagnostics } from "./diagnostics";
import { registerHover } from "./hoverProvider";
import { registerCodeActions } from "./codeActions";
import { registerSymbols } from "./symbols";
import { registerFormatter } from "./formatter";
import { registerCommands } from "./commands";

export function activate(context: vscode.ExtensionContext): void {
  const store = new DocumentStore();
  context.subscriptions.push(
    registerDiagnostics(store),
    registerHover(store),
    registerCodeActions(store),
    registerSymbols(store),
    registerFormatter(store),
    ...registerCommands(),
  );
}

export function deactivate(): void {
  // Nothing to clean up: all disposables are registered on the context.
}
