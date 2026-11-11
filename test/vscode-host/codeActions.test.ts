import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseDocument } from "../../src/core";
import type { DocumentStore } from "../../src/vscode-host/documentStore";

/**
 * Adapter tests for the code-action provider, run against a stubbed
 * `vscode` module — the same in-process idea as `diagnostics.test.ts`.
 * Covers the `fixes[]` mapping (several fixes per diagnostic, command-type
 * and edits-type), range filtering, and the source actions (review R14:
 * this adapter surface had no regression test).
 */

const harness = vi.hoisted(() => {
  const state = {
    edits: [] as Array<{ uri: unknown; range: unknown; newText: string }>,
  };
  return {
    state,
    reset() {
      state.edits.length = 0;
    },
  };
});

vi.mock("vscode", () => {
  const state = harness.state;
  const disposable = { dispose: () => {} };
  class Range {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
    /** Real intersection semantics over the fake's line-0 positions. */
    intersection(other: Range): Range | undefined {
      const aStart = (this.start as { character: number }).character;
      const aEnd = (this.end as { character: number }).character;
      const bStart = (other.start as { character: number }).character;
      const bEnd = (other.end as { character: number }).character;
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (start > end) return undefined;
      return new Range(
        start === aStart ? this.start : other.start,
        end === aEnd ? this.end : other.end,
      );
    }
  }
  class Diagnostic {
    code: unknown;
    source: unknown;
    constructor(
      public range: unknown,
      public message: string,
      public severity: number,
    ) {}
  }
  class CodeAction {
    edit?: unknown;
    command?: unknown;
    diagnostics?: unknown[];
    constructor(
      public title: string,
      public kind: unknown,
    ) {}
  }
  class WorkspaceEdit {
    replace(uri: unknown, range: unknown, newText: string): void {
      state.edits.push({ uri, range, newText });
    }
  }
  const kinds = {
    QuickFix: { contains: () => true },
    Source: {
      append: () => ({ contains: () => true }),
      contains: () => true,
    },
  };
  return {
    Disposable: { from: () => disposable },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    Diagnostic,
    Range,
    CodeAction,
    CodeActionKind: kinds,
    WorkspaceEdit,
    languages: {
      createDiagnosticCollection() {
        return {
          set: () => {},
          delete: () => {},
          get: () => [],
          dispose: () => {},
        };
      },
      registerCodeActionsProvider() {
        return disposable;
      },
    },
  };
});

import { LrcCodeActionProvider } from "../../src/vscode-host/codeActions";

/** Minimal TextDocument double carrying only what the adapter reads. */
function fakeDocument(text: string, languageId = "lrc") {
  return {
    uri: { fsPath: "/test.lrc", toString: () => "file:///test.lrc" },
    languageId,
    version: 1,
    getText: () => text,
    positionAt: (offset: number) => ({ line: 0, character: offset }),
  };
}

function fakeStore() {
  return {
    get: (doc: { getText(): string }) => parseDocument(doc.getText()),
  } as unknown as DocumentStore;
}

function provider(): LrcCodeActionProvider {
  return new LrcCodeActionProvider(fakeStore());
}

function fullRange(doc: { getText(): string }) {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: doc.getText().length } };
}

describe("LrcCodeActionProvider.quickFixes", () => {
  beforeEach(() => {
    harness.reset();
  });

  it("expands a multi-fix diagnostic into ordered edit-type actions", () => {
    const doc = fakeDocument("[01:75.00]broken");
    const providerInstance = provider();
    const actions = providerInstance.provideCodeActions(
      doc as never,
      fullRange(doc) as never,
      { only: undefined } as never,
    );
    const quickFixes = actions.filter((action) => action.edit !== undefined);
    expect(quickFixes).toHaveLength(2);
    // Array order is fix order: carry first, then clamp.
    expect(quickFixes[0]?.title).toMatch(/carry/i);
    expect(quickFixes[1]?.title).toMatch(/clamp/i);
    expect(harness.state.edits).toHaveLength(2);
    // The fix spans replace the whole timestamp token, brackets included.
    expect(harness.state.edits[0]?.newText).toBe("[02:15.00]");
    expect(harness.state.edits[1]?.newText).toBe("[01:59.00]");
  });

  it("maps a command-type fix to a command action with its diagnostic", () => {
    const doc = fakeDocument("[00:20.00]b\n[00:10.00]a\n");
    const providerInstance = provider();
    const actions = providerInstance.provideCodeActions(
      doc as never,
      fullRange(doc) as never,
      { only: undefined } as never,
    );
    const commandFix = actions.find((action) => action.command !== undefined);
    expect(commandFix).toBeDefined();
    expect(commandFix?.command?.command).toBe("lrcToolkit.sortByTimestamp");
    expect(commandFix?.diagnostics).toHaveLength(1);
  });

  it("offers no quick fix when the diagnostic lies outside the requested range", () => {
    const doc = fakeDocument("[01:75.00]broken");
    const providerInstance = provider();
    const actions = providerInstance.provideCodeActions(
      doc as never,
      // An empty range past the end of the issue intersects nothing.
      { start: { line: 0, character: 99 }, end: { line: 0, character: 99 } } as never,
      { only: undefined } as never,
    );
    expect(actions.filter((action) => action.edit !== undefined)).toHaveLength(0);
  });

  it("offers source actions for broken timelines, word timings and offsets", () => {
    const doc = fakeDocument("[offset:+500]\n[00:20.00]b <00:21.00>x\n[00:10.00]a\n");
    const providerInstance = provider();
    const actions = providerInstance.provideCodeActions(
      doc as never,
      fullRange(doc) as never,
      { only: undefined } as never,
    );
    const titles = actions.map((action) => action.title);
    expect(titles).toContain("Sort all lines by timestamp");
    expect(titles).toContain("Strip enhanced (word-level) timings");
    expect(titles).toContain("Apply [offset:] tag into timestamps");
  });
});
