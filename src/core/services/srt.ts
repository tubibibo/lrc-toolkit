/**
 * SRT (SubRip) / WebVTT import and export for lyric cues.
 *
 * Fidelity contract: conversion carries the **timeline and the plain text**
 * and nothing else. Inline markup (`<i>`, `<font …>`, VTT voice/cue tags) is
 * stripped, a block's multi-line text is joined into one lyric line, and
 * STYLE / NOTE blocks are dropped and counted — following the same "report
 * what was removed" convention as the sort command's dropped lines.
 *
 * Import accepts the SRT shape (`HH:MM:SS,mmm --> HH:MM:SS,mmm`, optional
 * index line, blank line between blocks) plus the WebVTT variations:
 * a `.` millisecond separator, optional hours (`MM:SS.mmm`, two digits or
 * more), trailing cue settings (accepted and ignored), with or without a
 * `WEBVTT` signature header. Blocks whose timing values are out of range
 * (seconds or minutes above 59) or that smuggle a second timing line into
 * the text are dropped and counted, never silently carried.
 */

import type { LrcDocument } from "../model";
import { resolveOffset } from "../analyzer";
import { formatStamp, roundToPrecision } from "../../util/time";

export interface SrtCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ParseSrtResult {
  cues: SrtCue[];
  /**
   * Blocks dropped as STYLE/NOTE sections, empty text, or unparseable shape —
   * the `N` for the import message, mirroring sort's dropped-lines report.
   */
  droppedBlocks: number;
}

/**
 * One SRT/WebVTT timing line. Hours are optional (WebVTT `MM:SS.mmm`) and
 * may run past two digits (`100:00:00.000` is legal VTT), the millisecond
 * separator may be `,` (SRT) or `.` (WebVTT), the fraction carries 1–3
 * digits, and VTT cue settings (`align:start line:10 …`) may follow the
 * second timestamp — they are accepted and ignored. Value ranges (seconds
 * and minutes within 0–59) are checked separately in {@link timingInRange}:
 * the regex decides *shape*, values out of range make the block dropped,
 * never silently carried (review fix R4/F1).
 */
const SRT_TIMING_LINE =
  /^\s*(?:(\d{2,}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*-->\s*(?:(\d{2,}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?(?:\s+\S.*)?$/;

/** True when every numeric field of the timing match is inside its range. */
function timingInRange(match: RegExpExecArray): boolean {
  const minutes = [match[2], match[6]];
  const seconds = [match[3], match[7]];
  return (
    minutes.every((value) => value === undefined || Number(value) <= 59) &&
    seconds.every((value) => value === undefined || Number(value) <= 59)
  );
}

/** VTT sections and the signature header are not lyric cues. */
const DROPPED_SECTION = /^(STYLE|NOTE)(\s|$)/;

/** Inline markup of the `<i>…</i>` family — removed, not kept. */
const INLINE_TAG = /<[^>\n]*>/g;

/** Parse SRT / WebVTT subtitle text into cue tuples. */
export function parseSrt(text: string): ParseSrtResult {
  const cues: SrtCue[] = [];
  let droppedBlocks = 0;

  // Strip a leading BOM; split on every line-ending flavour (CRLF/LF/CR).
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);

  // Group lines into blank-line-separated blocks.
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current);
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block || block.length === 0) {
      continue;
    }
    // The file signature ("WEBVTT - title") is the header, not a cue block:
    // dropped without counting, so a plain VTT file does not report a drop.
    if (i === 0 && (block[0]?.startsWith("WEBVTT") ?? false)) {
      continue;
    }
    if (DROPPED_SECTION.test(block[0] ?? "")) {
      droppedBlocks++;
      continue;
    }

    // The timing line comes right after the optional numeric index.
    const timingMatch = SRT_TIMING_LINE.exec(block[1] ?? "");
    if (timingMatch && /^\d+\s*$/.test(block[0] ?? "")) {
      if (!timingInRange(timingMatch)) {
        droppedBlocks++;
        continue;
      }
      const cue = buildCue(timingMatch, block, 2);
      if (cue) {
        cues.push(cue);
      } else {
        droppedBlocks++;
      }
      continue;
    }
    const indexlessMatch = SRT_TIMING_LINE.exec(block[0] ?? "");
    if (indexlessMatch) {
      if (!timingInRange(indexlessMatch)) {
        droppedBlocks++;
        continue;
      }
      const cue = buildCue(indexlessMatch, block, 1);
      if (cue) {
        cues.push(cue);
      } else {
        droppedBlocks++;
      }
      continue;
    }
    droppedBlocks++;
  }

  return { cues, droppedBlocks };
}

/**
 * Build a cue from a timing match plus the text lines that follow it.
 * Returns null when the block carries no text at all — a cue without text
 * is meaningless in a lyric file and counts as dropped — or when a text
 * line turns out to be a second timing line (a malformed block, also
 * dropped rather than smuggled into the lyrics; review fix F6/R4).
 */
function buildCue(match: RegExpExecArray, block: string[], textStart: number): SrtCue | null {
  for (const line of block.slice(textStart)) {
    if (SRT_TIMING_LINE.test(line)) {
      return null;
    }
  }
  const text = block
    .slice(textStart)
    .join(" ")
    .replace(INLINE_TAG, "")
    .replace(/ {2,}/g, " ")
    .trim();
  if (text === "") {
    return null;
  }
  const startMs = timingMs(match, 1, 2, 3, 4);
  const endMs = timingMs(match, 5, 6, 7, 8);
  return { startMs, endMs, text };
}

/** Milliseconds for one timing side: optional hours, minutes, seconds, fraction. */
function timingMs(match: RegExpExecArray, h: number, m: number, s: number, f: number): number {
  const hours = match[h] ? Number(match[h]) : 0;
  const minutes = Number(match[m] ?? 0);
  const seconds = Number(match[s] ?? 0);
  const fraction = match[f] ?? "";
  const fractionMs = Number(fraction) * Math.pow(10, 3 - fraction.length);
  return (hours * 3_600 + minutes * 60 + seconds) * 1_000 + fractionMs;
}

/**
 * Convert subtitle cues to LRC text (one `[mm:ss.xx]lyric` line per cue,
 * timestamps rounded onto the centisecond grid). Empty result for zero cues.
 */
export function srtCuesToLrc(cues: ReadonlyArray<SrtCue>): string {
  const lines = cues.map((cue) => {
    const stamp = formatStamp(roundToPrecision(cue.startMs, 2), 2);
    return `[${stamp}]${cue.text}`;
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/**
 * Extract exportable cues from an LRC document: one entry per cue line,
 * using the line's **first** timestamp (later stamps on one line never start
 * a new beat — the documented statistics rule) and the plain text after the
 * last stamp with enhanced word timings removed. Effective (offset-adjusted)
 * times are exported — an SRT has no offset mechanism, so baking is the only
 * faithful conversion — clamped at 00:00.
 */
export function lrcToSrtCues(doc: LrcDocument): Array<{ startMs: number; text: string }> {
  const offsetMs = resolveOffset(doc, []);
  const cues: Array<{ startMs: number; text: string }> = [];

  for (const line of doc.lines) {
    if (line.kind !== "cue") {
      continue;
    }
    const first = line.stamps[0];
    if (!first) {
      continue;
    }
    const spans = [...line.wordTimings, ...line.invalidWordTimings].sort(
      (a, b) => a.start - b.start,
    );
    const parts: string[] = [];
    let cursor = line.textStart;
    for (const span of spans) {
      parts.push(doc.text.slice(cursor, span.start));
      cursor = span.end;
    }
    parts.push(doc.text.slice(cursor, line.textEnd));
    // Word-timing boundaries get a space only between ASCII word characters:
    // `软<…>歌词` must not become `软 歌词`, while `hello<…>world` still
    // reads as two words (review fix F5/R6 — same convention as the strip
    // command, which concatenates directly).
    let text = "";
    for (const part of parts) {
      if (text === "" || part === "") {
        text += part;
        continue;
      }
      const prevEnd = text.charAt(text.length - 1);
      const nextStart = part.charAt(0);
      const needsSpace = /\w/.test(prevEnd) && /\w/.test(nextStart);
      text += needsSpace ? ` ${part}` : part;
    }
    text = text
      .replace(/ {2,}/g, " ")
      .replace(/^[ \t]+/, "")
      .replace(/[ \t]+$/, "");
    if (text === "") {
      continue;
    }
    cues.push({ startMs: Math.max(0, first.stamp.totalMs - offsetMs), text });
  }
  return cues;
}

/**
 * Render cues as SRT (one block per line, `,` millisecond separator). The
 * end time is recomputed — never stale: next line's start minus 1 ms, and
 * start + 2 s for the final block. A zero-length block (equal starts, e.g.
 * bilingual pairs) clamps to its own start instead of reversing.
 */
export function formatSrt(cues: ReadonlyArray<{ startMs: number; text: string }>): string {
  const blocks: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue) {
      continue;
    }
    const next = cues[i + 1];
    const endMs = next ? Math.max(cue.startMs, next.startMs - 1) : cue.startMs + 2_000;
    blocks.push(`${i + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(endMs)}\n${cue.text}`);
  }
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}

/** Render milliseconds in SRT's fixed `HH:MM:SS,mmm` form. */
function formatSrtTime(totalMs: number): string {
  const ms = Math.max(0, Math.trunc(totalMs));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}
