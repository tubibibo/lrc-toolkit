/**
 * Headless smoke test for the built adapter bundle.
 *
 * Copies `dist/extension.js` into a temporary sandbox together with a stubbed
 * `vscode` module, runs `activate()` in a child Node process, and asserts that
 * every command and provider wires up without an editor runtime. Complements
 * the unit tests by exercising the real bundle produced by esbuild
 * (see docs/verification.md).
 *
 * Usage: node scripts/smoke-adapter.mjs   (from the repository root, after `npm run compile`)
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(root, "dist", "extension.js");

/**
 * The expected command list is read from `package.json` at run time, so the
 * smoke test can never drift from the manifest: a command declared but not
 * registered (or the reverse) fails the run.
 */
const EXPECTED_COMMANDS = readManifestCommandIds();

function readManifestCommandIds() {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
  return (manifest.contributes?.commands ?? [])
    .map((entry) => {
      if (typeof entry?.command !== "string" || entry.command.length === 0) {
        throw new Error("package.json contributes.commands contains a command-less entry");
      }
      return entry.command;
    })
    .sort();
}

const EXPECTED_PROVIDERS = ["codeActions", "formatter", "hover", "symbols"];

/** Source of the sandbox's `vscode` stub module. Records every registration. */
const VSCODE_STUB_SOURCE = `
"use strict";

const record = { commands: [], providers: [], diagnostics: null, outputChannels: 0 };

const disposable = () => ({ dispose() {} });

class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
  intersection() {
    return this;
  }
}

const CodeActionKind = {
  Empty: { value: "", contains: () => false },
  QuickFix: { value: "quickfix", contains: () => false },
  Source: {
    value: "source",
    contains: () => false,
    append: (part) => ({ value: "source." + part, contains: () => false }),
  },
};

const api = {
  Disposable: { from: () => disposable() },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Diagnostic,
  Range,
  Position: class {},
  WorkspaceEdit: class { replace() {} },
  CodeAction: class { constructor(title) { this.title = title; } },
  CodeActionKind,
  DocumentSymbol: class { constructor(name) { this.name = name; this.children = []; } },
  SymbolKind: { Property: 7, Event: 23 },
  MarkdownString: class {},
  Hover: class {},
  TextEdit: class {},
  languages: {
    createDiagnosticCollection(name) {
      record.diagnostics = name;
      return { set() {}, delete() {}, dispose() {} };
    },
    registerHoverProvider() { record.providers.push("hover"); return disposable(); },
    registerCodeActionsProvider() { record.providers.push("codeActions"); return disposable(); },
    registerDocumentSymbolProvider() { record.providers.push("symbols"); return disposable(); },
    registerDocumentFormattingEditProvider() { record.providers.push("formatter"); return disposable(); },
  },
  commands: {
    registerCommand(id) { record.commands.push(id); return disposable(); },
  },
  window: {
    createOutputChannel() {
      record.outputChannels++;
      return { appendLine() {}, show() {}, clear() {}, dispose() {} };
    },
    showInformationMessage() {},
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    activeTextEditor: undefined,
  },
  workspace: {
    getConfiguration() { return { get: (_key, fallback) => fallback }; },
    textDocuments: [],
    onDidOpenTextDocument() { return disposable(); },
    onDidChangeTextDocument() { return disposable(); },
    onDidCloseTextDocument() { return disposable(); },
    applyEdit: async () => true,
  },
};

// Exposed for the runner script; the extension ignores unknown properties.
api.record = record;
module.exports = api;
`;

const RUNNER_SOURCE = `
"use strict";

const vscode = require("./vscode-stub.js");
const extension = require("./extension.js");
extension.activate({ subscriptions: [], extensionMode: 1 });
console.log(JSON.stringify(vscode.record));
`;

function main() {
  const sandbox = mkdtempSync(join(tmpdir(), "lrc-toolkit-smoke-"));
  try {
    mkdirSync(join(sandbox, "node_modules", "vscode"), { recursive: true });
    copyFileSync(distEntry, join(sandbox, "extension.js"));
    writeFileSync(join(sandbox, "vscode-stub.js"), VSCODE_STUB_SOURCE);
    // The extension bundle resolves `require("vscode")` to this shim, which
    // re-exports the stub so the runner and the bundle share one `record`.
    writeFileSync(
      join(sandbox, "node_modules", "vscode", "package.json"),
      JSON.stringify({ name: "vscode", main: "index.js" }),
    );
    writeFileSync(
      join(sandbox, "node_modules", "vscode", "index.js"),
      'module.exports = require("../../vscode-stub.js");\n',
    );
    writeFileSync(join(sandbox, "run.js"), RUNNER_SOURCE);

    const { status, stdout, stderr } = spawnSync(process.execPath, [join(sandbox, "run.js")], {
      cwd: sandbox,
      encoding: "utf-8",
    });
    if (status !== 0) {
      throw new Error(`smoke run failed:\n${stderr}`);
    }
    const record = JSON.parse(stdout.trim().split("\n").at(-1));
    report(record);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function report(record) {
  const problems = [];
  const commands = [...record.commands].sort();
  if (JSON.stringify(commands) !== JSON.stringify(EXPECTED_COMMANDS)) {
    problems.push(`commands mismatch: got ${JSON.stringify(commands)}`);
  }
  const providers = [...record.providers].sort();
  if (JSON.stringify(providers) !== JSON.stringify(EXPECTED_PROVIDERS)) {
    problems.push(`providers mismatch: got ${JSON.stringify(providers)}`);
  }
  if (record.diagnostics !== "lrc-toolkit") {
    problems.push(`diagnostic collection missing: ${JSON.stringify(record.diagnostics)}`);
  }
  if (record.outputChannels !== 1) {
    problems.push(`expected 1 output channel, got ${record.outputChannels}`);
  }
  if (problems.length > 0) {
    console.error("SMOKE FAILED");
    for (const problem of problems) {
      console.error(` - ${problem}`);
    }
    process.exit(1);
  }
  console.log(
    `SMOKE OK — activate() registered ${commands.length} commands, ${providers.length} providers, 1 diagnostic collection, 1 output channel.`,
  );
}

try {
  main();
} catch (error) {
  console.error("SMOKE FAILED");
  console.error(error);
  process.exit(1);
}
