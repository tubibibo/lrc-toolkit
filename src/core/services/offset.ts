/**
 * Apply (bake) the file-wide `[offset:]` tag into raw timestamps and remove it.
 *
 * Convention (ADR 0004): display time = timestamp − offset. Baking therefore
 * shifts every raw timestamp by −offset so that the display time is unchanged
 * once the tag is gone.
 */

import type { LrcDocument, TextEdit } from "../model";
import { OFFSET_VALUE, resolveOffset } from "../analyzer";
import { shiftTimestamps } from "./shift";

export interface ApplyOffsetResult {
  edits: TextEdit[];
  shiftedCount: number;
  clampedCount: number;
  offsetMs: number;
}

export function applyOffsetTag(doc: LrcDocument): ApplyOffsetResult | null {
  const offsetMs = resolveOffset(doc, []);
  const tagLine = doc.lines.find(
    (line) => line.kind === "tag" && line.key === "offset" && OFFSET_VALUE.test(line.value.trim()),
  );
  if (!tagLine || tagLine.kind !== "tag") {
    return null;
  }

  const shift = shiftTimestamps(doc, -offsetMs);

  // Delete the tag together with its trailing line break (if any).
  let deleteEnd = tagLine.span.end;
  if (doc.text.slice(deleteEnd, deleteEnd + doc.eol.length) === doc.eol) {
    deleteEnd += doc.eol.length;
  }
  const deleteEdit: TextEdit = { start: tagLine.span.start, end: deleteEnd, newText: "" };

  return {
    edits: [...shift.edits, deleteEdit],
    shiftedCount: shift.edits.length,
    clampedCount: shift.clampedCount,
    offsetMs,
  };
}
