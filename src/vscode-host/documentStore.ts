import type * as vscode from "vscode";

import { parseDocument } from "../core";
import type { LrcDocument } from "../core";

interface CacheEntry {
  version: number;
  document: LrcDocument;
}

/**
 * Parses and caches the LRC document behind a `TextDocument`, invalidated by
 * the document version. Keeps providers cheap on keystroke-heavy editing.
 */
export class DocumentStore {
  private readonly cache = new Map<string, CacheEntry>();

  get(doc: vscode.TextDocument): LrcDocument {
    const key = doc.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === doc.version) {
      return cached.document;
    }
    const parsed = parseDocument(doc.getText());
    this.cache.set(key, { version: doc.version, document: parsed });
    return parsed;
  }

  evict(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
  }
}
