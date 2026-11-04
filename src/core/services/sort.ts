/**
 * Stable-sort all cue lines by timestamp.
 *
 * Note: a `[offset:]` tag shifts every cue uniformly, so it never changes the
 * relative order — sorting always uses raw timestamps (ADR 0004).
 *
 * The result is one whole-document replacement: metadata tags stay on top in
 * their original order, unknown lines and interior blank lines are dropped,
 * and the original trailing blank lines (including the final-newline phantom
 * line) are preserved. Ties keep the original line order (stable sort).
 */

import type { LrcDocument, TextEdit } from "../model";
import { rawLineText } from "../parser";

export function sortCues(doc: LrcDocument): TextEdit | null {
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
      firstCueIndex = Math.min(firstCueIndex, i);
    }
    // Unknown lines and interior blank lines are dropped.
  }

  if (cues.length === 0) {
    return null;
  }
  cues.sort((a, b) => a.key - b.key || a.index - b.index);

  // Keep the blank separator between header tags and lyrics when the original
  // document had one.
  const hadSeparator =
    lastTagIndex !== -1 && lastTagIndex < firstCueIndex
      ? doc.lines.slice(lastTagIndex + 1, firstCueIndex).some((line) => line?.kind === "blank")
      : false;

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

  return { start: 0, end: doc.text.length, newText: segments.join(doc.eol) };
}
