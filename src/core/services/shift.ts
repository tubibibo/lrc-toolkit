/**
 * Shift every raw timestamp by a fixed delta in milliseconds.
 *
 * Shifting is surgical (per-timestamp edits), re-renders timestamps in a
 * canonical `mm:ss.xx` form, and clamps negative results to 00:00.00.
 * Raw timestamps are shifted regardless of any `[offset:]` tag — raw times
 * and the offset are independent mechanisms (ADR 0004).
 */

import type { LrcDocument, TextEdit } from "../model";
import { formatStamp } from "../../util/time";

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
    for (const stampSpan of line.stamps) {
      const raw = stampSpan.stamp.totalMs + deltaMs;
      const target = Math.max(0, raw);
      if (raw < 0) {
        clampedCount++;
      }
      edits.push({
        start: stampSpan.start,
        end: stampSpan.end,
        newText: `[${formatStamp(target, stampSpan.stamp.fractionDigits)}]`,
      });
    }
  }
  return { edits, clampedCount };
}
