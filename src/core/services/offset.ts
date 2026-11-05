/**
 * Apply (bake) the file-wide `[offset:]` tag into raw timestamps and remove it.
 *
 * Convention (ADR 0004): display time = timestamp − offset. Baking therefore
 * shifts every raw timestamp by −offset so that the display time is unchanged
 * once the tag is gone.
 */

import type { LrcDocument, TagLine, TagToken, TextEdit } from "../model";
import { allTags } from "../model";
import { OFFSET_VALUE, resolveOffset } from "../analyzer";
import { shiftTimestamps } from "./shift";

export interface ApplyOffsetResult {
  edits: TextEdit[];
  shiftedCount: number;
  clampedCount: number;
  offsetMs: number;
  /** Valid `[offset:]` tags left in the document after baking the first one. */
  remainingOffsetTags: number;
}

interface OffsetTagLocation {
  line: TagLine;
  tag: TagToken;
}

function applyOffsetTagLocation(doc: LrcDocument, location: OffsetTagLocation): TextEdit {
  const { line, tag } = location;
  // Whole-line removal only when the baked tag is alone on its line;
  // otherwise remove just the token so sibling tags survive.
  if (line.additional.length === 0 && line.primarySpan.start === tag.span.start) {
    let deleteEnd = line.span.end;
    // Swallow the line's own terminator (which may differ from doc.eol in a
    // mixed-EOL document).
    const ending = doc.lineEndings[line.line] ?? "";
    if (
      ending.length > 0 &&
      doc.text.slice(deleteEnd, deleteEnd + ending.length) === ending
    ) {
      deleteEnd += ending.length;
    }
    return { start: line.span.start, end: deleteEnd, newText: "" };
  }
  return { start: tag.span.start, end: tag.span.end, newText: "" };
}

export function applyOffsetTag(doc: LrcDocument): ApplyOffsetResult | null {
  const offsetMs = resolveOffset(doc, []);

  // First valid `[offset:]` in document order — across lines and within a line.
  let location: OffsetTagLocation | null = null;
  let validCount = 0;
  for (const line of doc.lines) {
    if (line.kind !== "tag") {
      continue;
    }
    for (const tag of allTags(line)) {
      if (tag.key !== "offset" || !OFFSET_VALUE.test(tag.value.trim())) {
        continue;
      }
      validCount++;
      if (!location) {
        location = { line, tag };
      }
    }
  }
  if (!location) {
    return null;
  }

  const shift = shiftTimestamps(doc, -offsetMs);
  const deleteEdit = applyOffsetTagLocation(doc, location);

  return {
    edits: [...shift.edits, deleteEdit],
    shiftedCount: shift.edits.length,
    clampedCount: shift.clampedCount,
    offsetMs,
    remainingOffsetTags: validCount - 1,
  };
}
