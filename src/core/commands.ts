/**
 * Command layer: the full set of user-facing operations expressed as pure
 * functions over document text. The VS Code adapter maps command ids from
 * `package.json` onto these and applies the returned edits.
 */

import type { FractionDigits, TextEdit } from "./model";
import { parseDocument } from "./parser";
import { sortCues } from "./services/sort";
import { shiftTimestamps } from "./services/shift";
import { applyOffsetTag, invertOffsetSign } from "./services/offset";
import { normalizePrecision } from "./services/normalize";
import { expandMultiStampLines, stripWordTimings } from "./services/convert";
import { mergeBilingualPairs, splitBilingualLines } from "./services/bilingual";
import { computeStats, formatStatsReport } from "./services/stats";

export const COMMAND_IDS = [
  "sortByTimestamp",
  "shiftTimestamps",
  "applyOffsetTag",
  "normalizePrecision",
  "stripWordTimings",
  "expandMultiStampLines",
  "showStats",
  "mergeBilingualLines",
  "splitBilingualLines",
  "invertOffsetSign",
] as const;

export type CommandId = (typeof COMMAND_IDS)[number];

export function isCommandId(value: string): value is CommandId {
  return (COMMAND_IDS as readonly string[]).includes(value);
}

export interface CommandOptions {
  /** For `shiftTimestamps`. */
  deltaMs?: number;
  /** For `normalizePrecision` (2 = centiseconds, 3 = milliseconds). */
  precision?: FractionDigits;
  /** For `showStats` gap detection. */
  gapThresholdSeconds?: number;
  /** For `sortByTimestamp`: keep unrecognized lines attached to their next cue. */
  keepUnrecognized?: boolean;
}

export interface CommandOutcome {
  edits: TextEdit[];
  /** Human-readable result messages; empty when silent. */
  messages: string[];
}

function parseText(text: string) {
  return parseDocument(text);
}

/** Render a millisecond value with an explicit sign, e.g. `+500` / `-250`. */
function signed(ms: number): string {
  return ms > 0 ? `+${ms}` : String(ms);
}

/**
 * Run a toolkit command against raw document text.
 * Pure: returns edits + messages, never touches an editor.
 */
export function runCommand(
  id: CommandId,
  text: string,
  options: CommandOptions = {},
): CommandOutcome {
  const doc = parseText(text);

  switch (id) {
    case "sortByTimestamp": {
      const result = sortCues(doc, { keepUnrecognized: options.keepUnrecognized === true });
      if (!result) {
        return { edits: [], messages: ["No timestamped lines to sort."] };
      }
      const messages =
        result.droppedLines > 0
          ? [
              `Sorted ${result.cueCount} cue line(s); removed ${result.droppedLines} blank or unrecognized line(s).`,
            ]
          : [];
      return { edits: [result.edit], messages };
    }

    case "shiftTimestamps": {
      const delta = Math.trunc(options.deltaMs ?? 0);
      const { edits, clampedCount } = shiftTimestamps(doc, delta);
      const messages: string[] = [];
      if (edits.length === 0) {
        messages.push("Nothing to shift — every timestamp already matches the result.");
      }
      if (clampedCount > 0) {
        messages.push(
          `${clampedCount} timestamp(s) were clamped to 00:00.00 — they would have gone negative.`,
        );
      }
      return { edits, messages };
    }

    case "applyOffsetTag": {
      const result = applyOffsetTag(doc);
      if (!result) {
        return { edits: [], messages: ["No valid [offset:] tag found — nothing to apply."] };
      }
      const messages = [
        `Shifted ${result.shiftedCount} timestamp(s) by ${result.offsetMs} ms and removed the tag.`,
      ];
      if (result.remainingOffsetTags > 0) {
        messages.push(
          `${result.remainingOffsetTags} additional [offset:] tag(s) remain — players may ignore anything after the first.`,
        );
      }
      if (result.clampedCount > 0) {
        messages.push(
          `${result.clampedCount} timestamp(s) were clamped to 00:00.00 — they would have gone negative.`,
        );
      }
      return { edits: result.edits, messages };
    }

    case "normalizePrecision": {
      const digits: FractionDigits = options.precision === 3 ? 3 : 2;
      const edits = normalizePrecision(doc, digits);
      return {
        edits,
        messages: edits.length === 0 ? [] : [`Timestamps normalized to ${digits}-digit precision.`],
      };
    }

    case "stripWordTimings": {
      const { edits, lineCount } = stripWordTimings(doc);
      return {
        edits,
        messages:
          lineCount === 0
            ? ["No word-level timings found."]
            : [`Converted ${lineCount} line(s) to plain LRC.`],
      };
    }

    case "expandMultiStampLines": {
      const { edits, lineCount, skippedCount } = expandMultiStampLines(doc);
      const messages: string[] = [];
      if (lineCount > 0) {
        messages.push(`Expanded ${lineCount} line(s).`);
      }
      if (skippedCount > 0) {
        messages.push(
          `Skipped ${skippedCount} line(s) with inline bracket content — expand them manually.`,
        );
      }
      if (messages.length === 0) {
        messages.push("No multi-timestamp lines found.");
      }
      return { edits, messages };
    }

    case "showStats": {
      const threshold = Math.max(0, options.gapThresholdSeconds ?? 8);
      const stats = computeStats(doc, threshold);
      return { edits: [], messages: formatStatsReport(stats, threshold) };
    }

    case "mergeBilingualLines": {
      const { edits, pairCount, skippedCount } = mergeBilingualPairs(doc);
      const messages: string[] = [];
      if (pairCount > 0) {
        messages.push(`Merged ${pairCount} bilingual pair(s) into single lines.`);
      }
      if (skippedCount > 0) {
        messages.push(
          `Skipped ${skippedCount} same-time pair(s) with word timings, stray labels, an empty side or an ambiguous '|' — merge them manually.`,
        );
      }
      if (messages.length === 0) {
        messages.push("No adjacent same-time bilingual pairs found.");
      }
      return { edits, messages };
    }

    case "splitBilingualLines": {
      const { edits, lineCount } = splitBilingualLines(doc);
      return {
        edits,
        messages:
          lineCount === 0
            ? ["No lines with an unescaped '|' separator found."]
            : [`Split ${lineCount} line(s) into timestamped bilingual pairs.`],
      };
    }

    case "invertOffsetSign": {
      const result = invertOffsetSign(doc);
      if (!result) {
        return { edits: [], messages: ["No valid [offset:] tag found — nothing to invert."] };
      }
      return {
        edits: result.edits,
        messages: [
          `Inverted the [offset:] tag: ${signed(result.fromMs)} → ${signed(result.toMs)} ms. Timestamps were not touched.`,
        ],
      };
    }
  }
}
