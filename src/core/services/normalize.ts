/**
 * Timestamp normalization: unify fraction precision and spacing.
 */

import type { FractionDigits, LrcDocument, TextEdit } from "../model";
import { formatStamp, roundToPrecision } from "../../util/time";

/** Rewrite every timestamp onto a uniform fraction precision (2 or 3 digits). */
export function normalizePrecision(doc: LrcDocument, fractionDigits: FractionDigits): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const line of doc.lines) {
    if (line.kind !== "cue") {
      continue;
    }
    for (const stampSpan of line.stamps) {
      const target = roundToPrecision(stampSpan.stamp.totalMs, fractionDigits);
      const newText = `[${formatStamp(target, fractionDigits)}]`;
      const current = doc.text.slice(stampSpan.start, stampSpan.end);
      if (current !== newText) {
        edits.push({ start: stampSpan.start, end: stampSpan.end, newText });
      }
    }
  }
  return edits;
}

/**
 * Normalize spacing without reordering content:
 *  - exactly one space (or none) between the last timestamp and the lyric text;
 *  - no trailing whitespace on any line.
 */
export function normalizeSpacing(doc: LrcDocument, spaceAfterTimestamp: boolean): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const line of doc.lines) {
    if (line.kind === "cue") {
      const lastStamp = line.stamps[line.stamps.length - 1];
      if (!lastStamp) {
        continue;
      }
      const segmentStart = lastStamp.end;
      const segmentEnd = line.span.end;
      const segment = doc.text.slice(segmentStart, segmentEnd);
      const text = segment.replace(/[ \t]+$/, "").replace(/^[ \t]+/, "");
      const newText = text.length > 0 && spaceAfterTimestamp ? ` ${text}` : text;
      if (newText !== segment) {
        edits.push({ start: segmentStart, end: segmentEnd, newText });
      }
    } else if (line.kind === "tag" || line.kind === "unknown") {
      const segment = doc.text.slice(line.span.start, line.span.end);
      const newText = segment.replace(/[ \t]+$/, "");
      if (newText !== segment) {
        edits.push({ start: line.span.start, end: line.span.end, newText });
      }
    }
  }
  return edits;
}
