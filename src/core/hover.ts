/**
 * Hover inspection: locate the token at a document offset and build the
 * structured information the adapter renders as markdown.
 */

import type { LrcDocument, TimeStamp } from "./model";
import { resolveOffset } from "./analyzer";

export type HoverTarget =
  | {
      kind: "timestamp";
      stamp: TimeStamp;
      effectiveMs: number | null;
      prevEffectiveMs: number | null;
      nextEffectiveMs: number | null;
    }
  | { kind: "word-timing"; stamp: TimeStamp; cueStartMs: number }
  | { kind: "tag"; key: string; value: string; description: string };

const TAG_DESCRIPTIONS: Record<string, string> = {
  ti: "Title of the song.",
  ar: "Artist / performer.",
  al: "Album the song belongs to.",
  au: "Author or lyricist.",
  by: "Creator of this LRC file.",
  length: "Total song length, e.g. `[length:3:25]`.",
  offset:
    "Global shift applied to every timestamp, in milliseconds. Positive values make lyrics display earlier (display time = timestamp − offset). See ADR 0004 for the convention and its caveats.",
  re: "Player or editor that created the file.",
  ve: "Version of the tool that created the file.",
  tool: "Tool used to create the file.",
  encoding: "Text encoding declared by the file.",
  language: "Language of the lyrics (non-standard tag).",
};

/** Description for a metadata tag key, or null when the tag is unknown. */
export function describeTag(key: string): string | null {
  return TAG_DESCRIPTIONS[key] ?? null;
}

function contains(start: number, end: number, offset: number): boolean {
  return start <= offset && offset < end;
}

/** Inspect the token at `offset` (absolute character offset into `doc.text`). */
export function inspectAt(doc: LrcDocument, offset: number): HoverTarget | null {
  for (const line of doc.lines) {
    if (line.span.start > offset || offset >= line.span.end) {
      continue;
    }
    if (line.kind === "tag") {
      return {
        kind: "tag",
        key: line.key,
        value: line.value,
        description: describeTag(line.key) ?? "Metadata tag.",
      };
    }
    if (line.kind !== "cue") {
      return null;
    }
    for (const stampSpan of line.stamps) {
      if (contains(stampSpan.start, stampSpan.end, offset)) {
        return buildTimestampHover(doc, line.line, stampSpan.stamp);
      }
    }
    const cueStart = line.stamps[0]?.stamp.totalMs;
    for (const word of line.wordTimings) {
      if (contains(word.start, word.end, offset) && cueStart !== undefined) {
        return { kind: "word-timing", stamp: word.stamp, cueStartMs: cueStart };
      }
    }
    return null;
  }
  return null;
}

function buildTimestampHover(doc: LrcDocument, lineIndex: number, stamp: TimeStamp): HoverTarget {
  const offsetMs = resolveOffset(doc, []);

  // Effective first-stamp times of every cue line, in document order.
  const timeline: Array<{ line: number; ms: number }> = [];
  for (const entry of doc.lines) {
    if (entry.kind !== "cue") {
      continue;
    }
    const first = entry.stamps[0];
    if (first) {
      timeline.push({ line: entry.line, ms: first.stamp.totalMs - offsetMs });
    }
  }

  const ownIndex = timeline.findIndex((entry) => entry.line === lineIndex);
  const prev = ownIndex > 0 ? (timeline[ownIndex - 1]?.ms ?? null) : null;
  const next =
    ownIndex >= 0 && ownIndex < timeline.length - 1 ? (timeline[ownIndex + 1]?.ms ?? null) : null;

  return {
    kind: "timestamp",
    stamp,
    effectiveMs: stamp.totalMs - offsetMs,
    prevEffectiveMs: prev,
    nextEffectiveMs: next,
  };
}
