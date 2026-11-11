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
 * Ties keep the original line order (stable sort). Every emitted line
 * carries its own original terminator, so mixed line endings survive the
 * rewrite instead of being normalized to the document's first-line EOL.
 *
 * With {@link SortOptions.keepUnrecognized}, standalone section labels are
 * kept instead of dropped: each unrecognized line is glued to the first cue
 * line that follows it (blanks and tags in between are skipped) and travels
 * with that cue through the sort, staying directly above it. Unrecognized
 * lines with no following cue are still dropped and counted.
 */

import type { LrcDocument, TextEdit } from "../model";
import { rawLineText } from "../parser";

export interface SortOptions {
  /**
   * Keep unrecognized lines (standalone section labels like `[Chorus]`)
   * instead of dropping them. Each label sticks to the first cue line that
   * follows it and is re-sorted together with that cue.
   */
  keepUnrecognized?: boolean;
}

export interface SortResult {
  edit: TextEdit;
  /** Cue lines included in the sort (the `N` in the command's result message). */
  cueCount: number;
  /** Lines removed by the sort: unknown lines + interior blank lines, minus the restored tag-cue separator. */
  droppedLines: number;
}

/** One output line: its original text and its own terminator. */
interface SortItem {
  text: string;
  ending: string;
}

export function sortCues(doc: LrcDocument, options: SortOptions = {}): SortResult | null {
  const endings = doc.lineEndings;
  const keepUnrecognized = options.keepUnrecognized === true;
  let trailingBlanks = 0;
  for (let i = doc.lines.length - 1; i >= 0; i--) {
    const line = doc.lines[i];
    if (!line || line.kind !== "blank") {
      break;
    }
    trailingBlanks++;
  }
  const bodyCount = doc.lines.length - trailingBlanks;

  const tagLines: SortItem[] = [];
  const cues: Array<{ item: SortItem; key: number; index: number; attached: SortItem[] }> = [];
  let lastTagIndex = -1;
  let firstCueIndex = Number.POSITIVE_INFINITY;
  let cueCount = 0;
  let droppedLines = 0;
  let pendingLabels: SortItem[] = [];

  for (let i = 0; i < bodyCount; i++) {
    const line = doc.lines[i];
    if (!line) {
      continue;
    }
    if (line.kind === "tag") {
      tagLines.push({ text: rawLineText(doc, line.span), ending: endings[i] ?? "" });
      lastTagIndex = i;
    } else if (line.kind === "cue") {
      const stamp = line.stamps[0];
      if (!stamp) {
        continue;
      }
      // Unrecognized lines wait here until the next cue claims them; labels
      // that never find one are dropped below.
      const attached = keepUnrecognized ? pendingLabels : [];
      pendingLabels = [];
      cues.push({
        item: { text: rawLineText(doc, line.span), ending: endings[i] ?? "" },
        key: stamp.stamp.totalMs,
        index: i,
        attached,
      });
      cueCount++;
      firstCueIndex = Math.min(firstCueIndex, i);
    } else if (line.kind === "unknown") {
      if (keepUnrecognized) {
        pendingLabels.push({ text: rawLineText(doc, line.span), ending: endings[i] ?? "" });
      } else {
        droppedLines++;
      }
    } else if (line.kind === "blank") {
      droppedLines++;
    }
  }
  // Labels after the last cue have nothing to travel with — dropped and counted.
  droppedLines += pendingLabels.length;

  if (cues.length === 0) {
    return null;
  }
  cues.sort((a, b) => a.key - b.key || a.index - b.index);

  // Keep the blank separator between header tags and lyrics when the original
  // document had one; it is restored (with its own terminator), so it does
  // not count as dropped.
  let separatorEnding: string | undefined;
  if (lastTagIndex !== -1 && lastTagIndex < firstCueIndex) {
    const separatorIndex = doc.lines
      .slice(lastTagIndex + 1, firstCueIndex)
      .findIndex((line) => line?.kind === "blank");
    if (separatorIndex !== -1) {
      droppedLines--;
      separatorEnding = endings[lastTagIndex + 1 + separatorIndex] ?? "";
    }
  }

  const items: Array<{ text: string; ending: string }> = [];
  for (const tag of tagLines) {
    items.push(tag);
  }
  if (separatorEnding !== undefined) {
    items.push({ text: "", ending: separatorEnding });
  }
  for (const cue of cues) {
    // Attached labels ride directly above their cue, in original order.
    items.push(...cue.attached);
    items.push(cue.item);
  }
  for (let i = bodyCount; i < doc.lines.length; i++) {
    items.push({ text: "", ending: endings[i] ?? "" });
  }

  // The original final line carries the document's "no terminator" slot when
  // the text does not end with a break. After reordering, that slot must sit
  // on the *last* emitted line — otherwise its line would fuse with the next
  // one mid-document and the output would gain a trailing break. Swap the
  // terminator of whichever line landed last with the breakless one's.
  const endsWithBreak = (endings[endings.length - 1] ?? "") !== "";
  if (!endsWithBreak && items.length > 0) {
    const lastItem = items[items.length - 1];
    if (lastItem !== undefined && lastItem.ending !== "") {
      const breaklessIndex = items.findIndex((item) => item.ending === "");
      const breaklessItem = breaklessIndex !== -1 ? items[breaklessIndex] : undefined;
      if (breaklessItem !== undefined) {
        breaklessItem.ending = lastItem.ending;
      }
      lastItem.ending = "";
    }
  }

  return {
    edit: {
      start: 0,
      end: doc.text.length,
      newText: items.map((item) => item.text + item.ending).join(""),
    },
    cueCount,
    droppedLines,
  };
}
