/**
 * Conversions between LRC flavours:
 *  - strip enhanced (word-level) timings back to plain LRC;
 *  - expand lines carrying multiple timestamps into one line per timestamp.
 */

import type { LrcDocument, TextEdit } from "../model";

export interface ConvertResult {
  edits: TextEdit[];
  lineCount: number;
  /** Lines that were multi-stamp but not expanded (inline bracket content present). */
  skippedCount: number;
}

/** Remove `<mm:ss.xx>` word timings (valid and malformed) from cue text. */
export function stripWordTimings(doc: LrcDocument): ConvertResult {
  const edits: TextEdit[] = [];
  let lineCount = 0;

  for (const line of doc.lines) {
    if (line.kind !== "cue") {
      continue;
    }
    const spans = [...line.wordTimings, ...line.invalidWordTimings];
    if (spans.length === 0) {
      continue;
    }
    spans.sort((a, b) => a.start - b.start);
    let newText = "";
    let cursor = line.textStart;
    for (const span of spans) {
      newText += doc.text.slice(cursor, span.start);
      cursor = span.end;
    }
    newText += doc.text.slice(cursor, line.textEnd);
    newText = newText
      .replace(/ {2,}/g, " ")
      .replace(/^[ \t]+/, "")
      .replace(/[ \t]+$/, "");
    lineCount++;
    if (newText !== doc.text.slice(line.textStart, line.textEnd)) {
      edits.push({ start: line.textStart, end: line.textEnd, newText });
    }
  }
  return { edits, lineCount, skippedCount: 0 };
}

/**
 * Expand `[a][b] text` into `[a] text` + `[b] text` on consecutive lines.
 *
 * Lines whose text region carries other bracket content (stray tokens such as
 * `[Chorus]`) are refused: expanding them cannot decide where that content
 * belongs, and silently dropping it would lose lyrics.
 */
export function expandMultiStampLines(doc: LrcDocument): ConvertResult {
  const edits: TextEdit[] = [];
  let lineCount = 0;
  let skippedCount = 0;

  for (const line of doc.lines) {
    if (line.kind !== "cue" || line.stamps.length < 2) {
      continue;
    }
    if (line.strayTokens.length > 0) {
      skippedCount++;
      continue;
    }
    const lastStamp = line.stamps[line.stamps.length - 1];
    if (!lastStamp) {
      continue;
    }
    const text = doc.text.slice(lastStamp.end, line.span.end);
    const parts = line.stamps.map(
      (stampSpan) => doc.text.slice(stampSpan.start, stampSpan.end) + text,
    );
    edits.push({
      start: line.span.start,
      end: line.span.end,
      newText: parts.join(doc.eol),
    });
    lineCount++;
  }
  return { edits, lineCount, skippedCount };
}
