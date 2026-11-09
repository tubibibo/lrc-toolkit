import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseDocument } from "../../src/core";
import type { DocumentStore } from "../../src/vscode-host/documentStore";

/**
 * Adapter tests for the diagnostics collection, run against a stubbed
 * `vscode` module — the same stubbing idea as `scripts/smoke-adapter.mjs`,
 * but in-process via `vi.mock`. Only the API surface `diagnostics.ts`
 * touches is stubbed; the store is a plain-data double.
 */

const harness = vi.hoisted(() => {
  const state = {
    diagnostics: new Map<string, unknown[]>(),
    deletedUris: [] as string[],
    registered: {
      open: [] as Array<(doc: unknown) => void>,
      change: [] as Array<(event: { document: unknown }) => void>,
      close: [] as Array<(doc: unknown) => void>,
    },
  };
  return {
    state,
    reset() {
      state.diagnostics.clear();
      state.deletedUris.length = 0;
      state.registered.open.length = 0;
      state.registered.change.length = 0;
      state.registered.close.length = 0;
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
  return {
    Disposable: { from: () => disposable },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    Diagnostic,
    Range,
    languages: {
      createDiagnosticCollection() {
        return {
          set: (uri: { toString(): string }, diags: unknown[]) => {
            state.diagnostics.set(uri.toString(), diags);
          },
          delete: (uri: { toString(): string }) => {
            state.diagnostics.delete(uri.toString());
            state.deletedUris.push(uri.toString());
          },
          get: (uri: { toString(): string }) => state.diagnostics.get(uri.toString()) ?? [],
          dispose: () => {},
        };
      },
    },
    workspace: {
      textDocuments: [],
      onDidOpenTextDocument(cb: (doc: unknown) => void) {
        state.registered.open.push(cb);
        return disposable;
      },
      onDidChangeTextDocument(cb: (event: { document: unknown }) => void) {
        state.registered.change.push(cb);
        return disposable;
      },
      onDidCloseTextDocument(cb: (doc: unknown) => void) {
        state.registered.close.push(cb);
        return disposable;
      },
    },
  };
});

import { registerDiagnostics } from "../../src/vscode-host/diagnostics";

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
  const evicted: string[] = [];
  const store = {
    get: (doc: { getText(): string }) => parseDocument(doc.getText()),
    evict: (uri: { toString(): string }) => evicted.push(uri.toString()),
  } as unknown as DocumentStore;
  return { store, evicted };
}

describe("registerDiagnostics", () => {
  beforeEach(() => {
    harness.reset();
  });

  it("publishes diagnostics for lrc documents", () => {
    const { store } = fakeStore();
    registerDiagnostics(store);
    const update = harness.state.registered.open[0]!;
    update(fakeDocument("[01:60]broken"));
    const published = harness.state.diagnostics.get("file:///test.lrc") ?? [];
    expect(published).toHaveLength(1);
    expect(harness.state.deletedUris).toEqual([]);
  });

  it("clears diagnostics and evicts the cache when a document stops being lrc", () => {
    const { store, evicted } = fakeStore();
    registerDiagnostics(store);
    const open = harness.state.registered.open[0]!;
    const change = harness.state.registered.change[0]!;
    const doc = fakeDocument("[01:60]broken");

    open(doc);
    expect((harness.state.diagnostics.get("file:///test.lrc") ?? []).length).toBeGreaterThan(0);

    // Relabelled to plaintext: the stale diagnostics must go, not linger.
    (doc as { languageId: string }).languageId = "plaintext";
    change({ document: doc });
    expect(harness.state.deletedUris).toEqual(["file:///test.lrc"]);
    expect(evicted).toEqual(["file:///test.lrc"]);
    expect(harness.state.diagnostics.has("file:///test.lrc")).toBe(false);
  });

  it("leaves non-lrc documents that never had diagnostics alone", () => {
    const { store, evicted } = fakeStore();
    registerDiagnostics(store);
    const change = harness.state.registered.change[0]!;
    change({ document: fakeDocument("just text", "plaintext") });
    expect(harness.state.deletedUris).toEqual([]);
    expect(evicted).toEqual([]);
  });

  it("still clears on close", () => {
    const { store, evicted } = fakeStore();
    registerDiagnostics(store);
    const open = harness.state.registered.open[0]!;
    const close = harness.state.registered.close[0]!;
    open(fakeDocument("[01:60]broken"));
    close(fakeDocument("[01:60]broken"));
    expect(harness.state.deletedUris).toEqual(["file:///test.lrc"]);
    expect(evicted).toEqual(["file:///test.lrc"]);
  });
});
