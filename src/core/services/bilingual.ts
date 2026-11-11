/**
 * Bilingual lyric helpers built on the community `original|translation`
 * convention: two consecutive cue lines sharing one timestamp can be merged
 * into a single `original|translation` line, and merged lines can be split
 * back apart at the first unescaped `|`.
 *
 * The pipe separator is a community convention, not part of the LRC format:
 * both operations are explicit commands and never run automatically. In a
 * pair the second line is treated as the translation.
 *
 * Merging compares *raw* timestamps — a file-wide `[offset:]` shifts every
 * cue uniformly and cannot split a pair (ADR 0004). Anything the merge would
 * have to delete or guess at (word timings, stray labels, additional stamps,
 * an ambiguous `|`) is reported via {@link MergeBilingualResult.skippedCount}
 * instead of being merged.
 */

import type { CueLine, LrcDocument, TextEdit } from "../model";

export interface MergeBilingualResult {
  edits: TextEdit[];
  /** Number of adjacent same-time pairs merged. */
  pairCount: number;
  /** Same-time pairs refused because merging them would lose or misparse content. */
  skippedCount: number;
}

export interface SplitBilingualResult {
  edits: TextEdit[];
  /** Number of lines split into a timestamped pair. */
  lineCount: number;
}

/**
 * Index of the first `|` that is not escaped by an odd run of backslashes,
 * or -1. `a\\|b` keeps its pipe (the `\\` is an escaped backslash), `a\|b`
 * has none.
 */
function findUnescapedPipe(text: string): number {
  let escapes = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      escapes++;
      continue;
    }
    if (ch === "|" && escapes % 2 === 0) {
      return i;
    }
    escapes = 0;
  }
  return -1;
}

/** Whether the text ends with a backslash that escapes whatever follows it. */
function endsWithUnescapedBackslash(text: string): boolean {
  let count = 0;
  for (let i = text.length - 1; i >= 0 && text[i] === "\\"; i--) {
    count++;
  }
  return count % 2 === 1;
}

/**
 * Stamp-shaped token inside lyric text: `[12:34]`, `[00:15.00]` — a *valid*
 * timestamp the analyzer never flags (only malformed ones land in
 * `invalidInlineStamps`), yet merging would absorb it as if it were lyrics.
 * The doc-promised "extra stamps are refused" covers this shape too
 * (review fix R12).
 */
const INLINE_STAMP_SHAPE = /\[\d{1,4}:\d{2}(?:\.\d{1,3})?\]/;

/**
 * Whether the line is a "plain" cue: exactly one timestamp and nothing else
 * that merging or splitting would have to drop or guess about. Word timings,
 * stray labels (`[Chorus]`), malformed tokens and extra stamps — malformed
 * or valid — all disqualify the line.
 */
function isPlainSingleStampCue(line: CueLine): boolean {
  return (
    line.stamps.length === 1 &&
    line.wordTimings.length === 0 &&
    line.invalidWordTimings.length === 0 &&
    line.invalidInlineStamps.length === 0 &&
    line.strayTokens.length === 0 &&
    !INLINE_STAMP_SHAPE.test(line.text)
  );
}

/**
 * Merge every adjacent pair of cue lines that share one timestamp into a
 * single `original|translation` line. The merged line keeps the *first*
 * line's timestamp (verbatim) and the second line's terminator; the second
 * line's own stamp is absorbed. Non-adjacent or different-time lines are
 * never merged, and refused pairs are counted, never guessed at.
 */
export function mergeBilingualPairs(doc: LrcDocument): MergeBilingualResult {
  const edits: TextEdit[] = [];
  let pairCount = 0;
  let skippedCount = 0;

  const lines = doc.lines;
  for (let i = 0; i < lines.length - 1; i++) {
    const first = lines[i];
    const second = lines[i + 1];
    if (!first || !second || first.kind !== "cue" || second.kind !== "cue") {
      continue;
    }
    const firstStamp = first.stamps[0];
    const secondStamp = second.stamps[0];
    if (!firstStamp || !secondStamp) {
      continue;
    }
    if (firstStamp.stamp.totalMs !== secondStamp.stamp.totalMs) {
      continue;
    }
    // From here on the two lines form a same-time pair; anything below is a
    // refusal, counted so the command can tell the user what it did not do.
    if (!isPlainSingleStampCue(first) || !isPlainSingleStampCue(second)) {
      skippedCount++;
      continue;
    }
    const firstText = first.text.trim();
    const secondText = second.text.trim();
    // A pair needs an original and a translation — an empty side is an
    // instrumental marker, not a bilingual pair.
    if (firstText === "" || secondText === "") {
      skippedCount++;
      continue;
    }
    // An unescaped pipe in the original line (or a trailing backslash that
    // would escape the separator) would change where the line splits back
    // apart — refuse instead of silently corrupting the round trip.
    if (
      findUnescapedPipe(firstText) !== -1 ||
      endsWithUnescapedBackslash(firstText) ||
      endsWithUnescapedBackslash(secondText)
    ) {
      skippedCount++;
      continue;
    }
    const stampToken = doc.text.slice(firstStamp.start, firstStamp.end);
    // Replacing both lines' content (the first line's terminator included)
    // leaves the second line's own terminator in place, so the merged line
    // inherits it — mixed-EOL documents stay mixed.
    edits.push({
      start: first.span.start,
      end: second.span.end,
      newText: `${stampToken}${firstText}|${secondText}`,
    });
    pairCount++;
    // The second line is consumed; it cannot start another pair.
    i++;
  }
  return { edits, pairCount, skippedCount };
}

/**
 * Split every cue line whose text carries an unescaped `|` back into two
 * lines: `original` before the pipe, `translation` after it, both inheriting
 * the line's timestamp verbatim. Only the *first* unescaped pipe is a
 * separator, so a translation containing literal pipes survives the split.
 * Lines with word timings, stray labels or extra stamps are left untouched.
 */
export function splitBilingualLines(doc: LrcDocument): SplitBilingualResult {
  const edits: TextEdit[] = [];
  let lineCount = 0;

  for (const line of doc.lines) {
    if (line.kind !== "cue" || !isPlainSingleStampCue(line)) {
      continue;
    }
    const stamp = line.stamps[0];
    if (!stamp) {
      continue;
    }
    const segment = doc.text.slice(line.textStart, line.textEnd);
    const pipe = findUnescapedPipe(segment);
    if (pipe === -1) {
      continue;
    }
    const stampToken = doc.text.slice(stamp.start, stamp.end);
    // Keep each side's own spacing style; only the seam is trimmed
    // (`original | translation` splits as cleanly as `original|translation`).
    const original = segment.slice(0, pipe).trimEnd();
    const translation = segment.slice(pipe + 1).trimStart();
    // Splitting must produce an original and a translation; a side that
    // ends up empty means the pipe is not a separator.
    if (original.trim() === "" || translation.trim() === "") {
      continue;
    }
    // Inserted breaks adopt the source line's own terminator (falling back
    // to the document EOL for a breakless final line), so mixed-EOL
    // documents do not get normalized.
    const lineEnding = doc.lineEndings[line.line] || doc.eol;
    edits.push({
      start: line.textStart,
      end: line.span.end,
      newText: `${original}${lineEnding}${stampToken}${translation}`,
    });
    lineCount++;
  }
  return { edits, lineCount };
}
