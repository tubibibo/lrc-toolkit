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
  // Whole-line removal only when the baked tag is alone on its line: nothing
  // but whitespace may follow the token. Trailing non-tag content — a handwritten
  // note, or a bracket token the parser does not classify as a tag (`[xx]`) —
  // is lyric text and must survive (the toolkit never invents or deletes text),
  // so such lines degrade to removing just the token.
  if (
    line.primarySpan.start === tag.span.start &&
    doc.text.slice(tag.span.end, line.span.end).trim() === ""
  ) {
    let deleteEnd = line.span.end;
    // Swallow the line's own terminator (which may differ from doc.eol in a
    // mixed-EOL document).
    const ending = doc.lineEndings[line.line] ?? "";
    if (ending.length > 0 && doc.text.slice(deleteEnd, deleteEnd + ending.length) === ending) {
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

export interface InvertOffsetResult {
  edits: TextEdit[];
  /** Offset value before the flip, in milliseconds. */
  fromMs: number;
  /** Offset value after the flip, in milliseconds. */
  toMs: number;
}

/**
 * Flip the sign of the first valid `[offset:]` tag (`+500` → `-500`) and
 * leave every other tag and all timestamps untouched. Some players interpret
 * the offset direction the other way round (ADR 0004); this command adapts
 * an existing tag for them without baking anything into the timestamps.
 * The rewritten value always carries an explicit sign, matching the
 * documented `[offset:+500]` style.
 */
export function invertOffsetSign(doc: LrcDocument): InvertOffsetResult | null {
  for (const line of doc.lines) {
    if (line.kind !== "tag") {
      continue;
    }
    for (const tag of allTags(line)) {
      if (tag.key !== "offset" || !OFFSET_VALUE.test(tag.value.trim())) {
        continue;
      }
      // First valid tag wins — the same resolution order as resolveOffset
      // and applyOffsetTag.
      const fromMs = Number(tag.value.trim());
      const toMs = -fromMs;
      const newText = toMs > 0 ? `+${toMs}` : String(toMs);
      return {
        edits: [{ start: tag.valueSpan.start, end: tag.valueSpan.end, newText }],
        fromMs,
        toMs,
      };
    }
  }
  return null;
}
