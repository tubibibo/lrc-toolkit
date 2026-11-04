/**
 * Command layer: the full set of user-facing operations expressed as pure
 * functions over document text. The VS Code adapter maps command ids from
 * `package.json` onto these and applies the returned edits.
 */

import type { FractionDigits, TextEdit } from "./model";
import { parseDocument } from "./parser";
import { sortCues } from "./services/sort";
import { shiftTimestamps } from "./services/shift";
import { applyOffsetTag } from "./services/offset";
import { normalizePrecision } from "./services/normalize";
import { expandMultiStampLines, stripWordTimings } from "./services/convert";
import { computeStats, formatStatsReport } from "./services/stats";

export const COMMAND_IDS = [
  "sortByTimestamp",
  "shiftTimestamps",
  "applyOffsetTag",
  "normalizePrecision",
  "stripWordTimings",
  "expandMultiStampLines",
  "showStats",
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
}

export interface CommandOutcome {
  edits: TextEdit[];
  /** Human-readable result messages; empty when silent. */
  messages: string[];
}

function parseText(text: string) {
  return parseDocument(text);
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
      const edit = sortCues(doc);
      return edit
        ? { edits: [edit], messages: [] }
        : { edits: [], messages: ["No timestamped lines to sort."] };
    }

    case "shiftTimestamps": {
      const delta = Math.trunc(options.deltaMs ?? 0);
      const { edits, clampedCount } = shiftTimestamps(doc, delta);
      const messages: string[] = [];
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
      const { edits, lineCount } = expandMultiStampLines(doc);
      return {
        edits,
        messages:
          lineCount === 0
            ? ["No multi-timestamp lines found."]
            : [`Expanded ${lineCount} line(s).`],
      };
    }

    case "showStats": {
      const threshold = Math.max(0, options.gapThresholdSeconds ?? 8);
      const stats = computeStats(doc, threshold);
      return { edits: [], messages: formatStatsReport(stats, threshold) };
    }
  }
}
