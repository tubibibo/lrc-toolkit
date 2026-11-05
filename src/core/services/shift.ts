/**
 * Shift every raw timestamp — line stamps and enhanced word timings alike —
 * by a fixed delta in milliseconds.
 *
 * Shifting is surgical (per-timestamp edits), re-renders timestamps in a
 * canonical `mm:ss.xx` form, and clamps negative results to 00:00.00.
 * Raw timestamps are shifted regardless of any `[offset:]` tag — raw times
 * and the offset are independent mechanisms (ADR 0004).
 */

import type { LrcDocument, TextEdit } from "../model";
import { renderStamp, stampTargets } from "./targets";

export interface ShiftResult {
  edits: TextEdit[];
  /** Number of timestamps clamped to 00:00.00 because they would go negative. */
  clampedCount: number;
}

export function shiftTimestamps(doc: LrcDocument, deltaMs: number): ShiftResult {
  const edits: TextEdit[] = [];
  let clampedCount = 0;

  for (const line of doc.lines) {
    if (line.kind !== "cue") {
      continue;
    }
    for (const target of stampTargets(line)) {
      const raw = target.stamp.totalMs + deltaMs;
      const shifted = Math.max(0, raw);
      if (raw < 0) {
        clampedCount++;
      }
      const newText = renderStamp(doc, target.span, shifted, target.stamp.fractionDigits);
      // Identical rendering (e.g. a zero shift on canonical stamps) is a no-op:
      // emitting it would dirty the document for nothing.
      if (doc.text.slice(target.span.start, target.span.end) === newText) {
        continue;
      }
      edits.push({
        start: target.span.start,
        end: target.span.end,
        newText,
      });
    }
  }
  return { edits, clampedCount };
}
