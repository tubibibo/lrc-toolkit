/**
 * Analyzer: {@link LrcDocument} → plain-data diagnostics.
 *
 * Diagnostic codes (stable, documented in docs/design.md):
 *  - invalid-timestamp       (error)   bracket token looks like a timestamp but is malformed
 *  - unrecognized-token      (warning) leading bracket token is neither stamp nor tag
 *  - stray-line              (warning) line is neither a cue nor a tag
 *  - empty-tag-value         (info)    content tag (`ti`, `ar`, …) carries no value
 *  - invalid-offset          (error)   `[offset:]` value is not an integer (ms)
 *  - duplicate-offset        (warning) more than one `[offset:]` tag
 *  - decreasing-timestamp    (warning) cue order breaks the timeline
 *  - duplicate-timestamp     (info)    cue starts exactly where the previous one does
 *  - empty-cue-text          (info)    timestamp without lyric text
 *  - word-timing-before-cue  (warning) word timing starts before its line's timestamp
 *  - word-timing-disorder    (warning) word timings are not ascending
 *  - invalid-word-timing     (warning) `<...>` token looks like a word timing but is malformed
 */

import type { CueLine, LrcDiagnostic, LrcDocument, TagLine } from "./model";
import { allTags } from "./model";
import { parseStampBody } from "../util/time";

export const OFFSET_VALUE = /^[+-]?\d+$/;

/** Tags that carry human-readable content and should not be empty. */
const CONTENT_TAGS = new Set(["ti", "ar", "al", "au", "length", "by"]);

/** Display time of a stamp under the documented offset convention (ADR 0004). */
function effectiveMs(stampTotalMs: number, offsetMs: number): number {
  return stampTotalMs - offsetMs;
}

/**
 * Resolve the file-wide `[offset:]` value in milliseconds, reporting
 * malformed or duplicated tags along the way. The first valid tag wins,
 * in document order — across lines and within a line.
 */
export function resolveOffset(doc: LrcDocument, issues: LrcDiagnostic[]): number {
  let resolved = 0;
  let seenValid = false;
  for (const line of doc.lines) {
    if (line.kind !== "tag") {
      continue;
    }
    for (const tag of allTags(line)) {
      if (tag.key !== "offset") {
        continue;
      }
      if (!OFFSET_VALUE.test(tag.value.trim())) {
        issues.push({
          start: tag.valueSpan.start,
          end: tag.valueSpan.end,
          severity: "error",
          code: "invalid-offset",
          message:
            "The [offset:] tag must be an integer number of milliseconds, e.g. [offset:+500] or [offset:-250].",
        });
        continue;
      }
      if (seenValid) {
        issues.push({
          start: tag.span.start,
          end: tag.span.end,
          severity: "warning",
          code: "duplicate-offset",
          message: "More than one [offset:] tag — players typically only honour the first one.",
        });
        continue;
      }
      seenValid = true;
      resolved = Number(tag.value.trim());
    }
  }
  return resolved;
}

function analyzeCue(
  line: CueLine,
  offsetMs: number,
  issues: LrcDiagnostic[],
  state: { prevEffective: number | null; lastReportedDuplicate: number | null },
): void {
  for (const token of line.strayTokens) {
    if (token.looksLikeStamp) {
      issues.push({
        start: token.start,
        end: token.end,
        severity: "error",
        code: "invalid-timestamp",
        message:
          "Malformed timestamp — minutes may be 0–999 but seconds must stay within 0–59, e.g. [01:23.45].",
      });
    }
  }
  for (const span of line.invalidWordTimings) {
    issues.push({
      start: span.start,
      end: span.end,
      severity: "warning",
      code: "invalid-word-timing",
      message: "Malformed word timing — enhanced LRC word timings look like <00:12.30>.",
    });
  }

  if (line.stamps.length === 0) {
    return;
  }

  // Within-line timestamp order.
  for (let i = 1; i < line.stamps.length; i++) {
    const current = line.stamps[i];
    const previous = line.stamps[i - 1];
    if (!current || !previous) {
      continue;
    }
    const currentMs = current.stamp.totalMs;
    if (currentMs < previous.stamp.totalMs) {
      issues.push({
        start: current.start,
        end: current.end,
        severity: "warning",
        code: "decreasing-timestamp",
        message:
          "This timestamp is earlier than the previous one on the same line — expand the line first, then sort.",
        fix: { title: "Expand multi-timestamp lines", command: "expandMultiStampLines" },
      });
    } else if (currentMs === previous.stamp.totalMs) {
      issues.push({
        start: current.start,
        end: current.end,
        severity: "info",
        code: "duplicate-timestamp",
        message: "Duplicate timestamp on the same line.",
      });
    }
  }

  // Word timings relative to the cue start and to each other.
  const cueStart = line.stamps[0]?.stamp.totalMs ?? 0;
  let previousWordMs: number | null = null;
  for (const word of line.wordTimings) {
    if (word.stamp.totalMs < cueStart) {
      issues.push({
        start: word.start,
        end: word.end,
        severity: "warning",
        code: "word-timing-before-cue",
        message: "This word timing starts before its line's timestamp.",
      });
    }
    if (previousWordMs !== null && word.stamp.totalMs < previousWordMs) {
      issues.push({
        start: word.start,
        end: word.end,
        severity: "warning",
        code: "word-timing-disorder",
        message: "Word timings should ascend within a line.",
      });
    }
    previousWordMs = word.stamp.totalMs;
  }

  // Cross-line timeline.
  const first = line.stamps[0];
  if (first) {
    const start = effectiveMs(first.stamp.totalMs, offsetMs);
    if (state.prevEffective !== null) {
      if (start < state.prevEffective) {
        issues.push({
          start: first.start,
          end: first.end,
          severity: "warning",
          code: "decreasing-timestamp",
          message: "This line starts earlier than the previous one — the lyric timeline is broken.",
          fix: { title: "Sort all lines by timestamp", command: "sortByTimestamp" },
        });
      } else if (start === state.prevEffective && start !== state.lastReportedDuplicate) {
        issues.push({
          start: first.start,
          end: first.end,
          severity: "info",
          code: "duplicate-timestamp",
          message: "This line starts exactly where the previous one does.",
        });
        state.lastReportedDuplicate = start;
      }
    }
    state.prevEffective = start;
  }

  if (line.text.trim() === "") {
    issues.push({
      start: line.span.start,
      end: line.span.end,
      severity: "info",
      code: "empty-cue-text",
      message: "This cue has no lyric text (fine for instrumental sections).",
    });
  }
}

function analyzeTag(line: TagLine, issues: LrcDiagnostic[]): void {
  for (const tag of allTags(line)) {
    if (CONTENT_TAGS.has(tag.key) && tag.value.trim() === "") {
      issues.push({
        start: tag.valueSpan.start,
        end: tag.valueSpan.end,
        severity: "info",
        code: "empty-tag-value",
        message: `The [${tag.key}:] tag carries no value.`,
      });
    }
  }
}

/** Run all structural checks and return plain-data diagnostics. */
export function analyze(doc: LrcDocument): LrcDiagnostic[] {
  const issues: LrcDiagnostic[] = [];
  const offsetMs = resolveOffset(doc, issues);
  const state = {
    prevEffective: null as number | null,
    lastReportedDuplicate: null as number | null,
  };

  for (const line of doc.lines) {
    switch (line.kind) {
      case "cue":
        analyzeCue(line, offsetMs, issues, state);
        break;
      case "tag":
        analyzeTag(line, issues);
        break;
      case "unknown": {
        if (line.tokens.length === 0) {
          issues.push({
            start: line.span.start,
            end: line.span.end,
            severity: "warning",
            code: "stray-line",
            message:
              "Not a valid LRC line — expected a timestamped cue like [01:23.45] text or a tag like [ti:Title].",
          });
          break;
        }
        for (const token of line.tokens) {
          if (token.looksLikeStamp) {
            issues.push({
              start: token.start,
              end: token.end,
              severity: "error",
              code: "invalid-timestamp",
              message:
                "Malformed timestamp — seconds must stay within 0–59 and the fraction may carry 1–3 digits, e.g. [01:23.45].",
            });
          } else {
            issues.push({
              start: token.start,
              end: token.end,
              severity: "warning",
              code: "unrecognized-token",
              message:
                "Unrecognized bracket token — expected a timestamp like [01:23.45] or a tag like [ti:Title].",
            });
          }
        }
        break;
      }
      case "blank":
        break;
    }
  }
  return issues;
}

/** Validate a single timestamp body (exposed for command-level parsing). */
export { parseStampBody };
