/**
 * Stable-sort all cue lines by timestamp.
 *
 * Note: a `[offset:]` tag shifts every cue uniformly, so it never changes the
 * relative order — sorting always uses raw timestamps (ADR 0004).
 *
 * The result is one whole-document replacement: metadata tags stay on top in
 * their original order, unknown lines and interior blank lines are dropped
 * (reported via {@link SortResult.droppedLines}), and the original trailing
 * blank lines (including the final-newline phantom line) are preserved.
 * Ties keep the original line order (stable sort).
 */

import type { LrcDocument, TextEdit } from "../model";
import { rawLineText } from "../parser";

export interface SortResult {
  edit: TextEdit;
  /** Cue lines included in the sort (the `N` in the command's result message). */
  cueCount: number;
  /** Lines removed by the sort: unknown lines + interior blank lines, minus the restored tag-cue separator. */
  droppedLines: number;
}

export function sortCues(doc: LrcDocument): SortResult | null {
  let trailingBlanks = 0;
  for (let i = doc.lines.length - 1; i >= 0; i--) {
    const line = doc.lines[i];
    if (!line || line.kind !== "blank") {
      break;
    }
    trailingBlanks++;
  }
  const bodyCount = doc.lines.length - trailingBlanks;

  const tagLines: string[] = [];
  const cues: Array<{ raw: string; key: number; index: number }> = [];
  let lastTagIndex = -1;
  let firstCueIndex = Number.POSITIVE_INFINITY;
  let cueCount = 0;
  let droppedLines = 0;

  for (let i = 0; i < bodyCount; i++) {
    const line = doc.lines[i];
    if (!line) {
      continue;
    }
    if (line.kind === "tag") {
      tagLines.push(rawLineText(doc, line.span));
      lastTagIndex = i;
    } else if (line.kind === "cue") {
      const stamp = line.stamps[0];
      if (!stamp) {
        continue;
      }
      cues.push({
        raw: rawLineText(doc, line.span),
        key: stamp.stamp.totalMs,
        index: i,
      });
      cueCount++;
      firstCueIndex = Math.min(firstCueIndex, i);
    } else if (line.kind === "unknown" || line.kind === "blank") {
      droppedLines++;
    }
  }

  if (cues.length === 0) {
    return null;
  }
  cues.sort((a, b) => a.key - b.key || a.index - b.index);

  // Keep the blank separator between header tags and lyrics when the original
  // document had one; it is restored, so it does not count as dropped.
  const hadSeparator =
    lastTagIndex !== -1 && lastTagIndex < firstCueIndex
      ? doc.lines.slice(lastTagIndex + 1, firstCueIndex).some((line) => line?.kind === "blank")
      : false;
  if (hadSeparator) {
    droppedLines--;
  }

  const segments: string[] = [...tagLines];
  if (hadSeparator) {
    segments.push("");
  }
  for (const cue of cues) {
    segments.push(cue.raw);
  }
  for (let i = 0; i < trailingBlanks; i++) {
    segments.push("");
  }

  return {
    edit: { start: 0, end: doc.text.length, newText: segments.join(doc.eol) },
    cueCount,
    droppedLines,
  };
}
