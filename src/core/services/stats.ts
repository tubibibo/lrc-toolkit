/**
 * Document statistics: cue counts, duration, instrumental gaps, duplicates.
 */

import type { DocumentStats, InstrumentalGap, LrcDocument } from "../model";
import { allTags } from "../model";
import { resolveOffset } from "../analyzer";
import { formatClock, formatDuration } from "../../util/time";

/** Compute document statistics; `gapThresholdSeconds` controls gap detection. */
export function computeStats(doc: LrcDocument, gapThresholdSeconds: number): DocumentStats {
  const offsetMs = resolveOffset(doc, []);

  let cueCount = 0;
  let tagCount = 0;
  let wordTimedLineCount = 0;
  let duplicateTimestampCount = 0;
  const timesMs: number[] = [];
  let previousTime: number | null = null;

  for (const line of doc.lines) {
    if (line.kind === "tag") {
      tagCount += allTags(line).length;
      continue;
    }
    if (line.kind !== "cue") {
      continue;
    }
    cueCount++;
    if (line.wordTimings.length > 0) {
      wordTimedLineCount++;
    }
    const first = line.stamps[0];
    if (!first) {
      continue;
    }
    const time = first.stamp.totalMs - offsetMs;
    timesMs.push(time);
    if (previousTime === time) {
      duplicateTimestampCount++;
    }
    previousTime = time;
  }

  const sorted = [...new Set(timesMs)].sort((a, b) => a - b);
  const thresholdMs = gapThresholdSeconds * 1000;
  const gaps: InstrumentalGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1];
    const to = sorted[i];
    if (from === undefined || to === undefined) {
      continue;
    }
    const duration = to - from;
    if (duration > thresholdMs) {
      gaps.push({ fromMs: from, toMs: to, durationMs: duration });
    }
  }

  const firstTime = sorted[0];
  const lastTime = sorted[sorted.length - 1];
  const durationMs =
    sorted.length > 0 && firstTime !== undefined && lastTime !== undefined
      ? lastTime - firstTime
      : null;

  return {
    cueCount,
    tagCount,
    wordTimedLineCount,
    durationMs,
    effectiveTimesMs: sorted,
    gaps,
    duplicateTimestampCount,
  };
}

/** Render statistics as human-readable report lines (English). */
export function formatStatsReport(stats: DocumentStats, gapThresholdSeconds: number): string[] {
  const lines: string[] = [];
  const wordNote = stats.wordTimedLineCount > 0 ? ` (${stats.wordTimedLineCount} word-timed)` : "";
  lines.push(`Cues: ${stats.cueCount}${wordNote}`);
  lines.push(`Metadata tags: ${stats.tagCount}`);

  const first = stats.effectiveTimesMs[0];
  const last = stats.effectiveTimesMs[stats.effectiveTimesMs.length - 1];
  if (first !== undefined && last !== undefined) {
    lines.push(
      `Duration: ${formatDuration(stats.durationMs)} (${formatClock(first)} → ${formatClock(last)})`,
    );
  } else {
    lines.push("Duration: —");
  }

  lines.push(`Instrumental gaps > ${gapThresholdSeconds}s: ${stats.gaps.length}`);
  for (const gap of stats.gaps) {
    lines.push(
      `  · ${formatClock(gap.fromMs)} → ${formatClock(gap.toMs)} (${(gap.durationMs / 1000).toFixed(2)} s)`,
    );
  }
  lines.push(`Duplicate timestamps: ${stats.duplicateTimestampCount}`);
  return lines;
}

/** One-line summary for message toasts; the full report lives in the output channel. */
export function formatStatsSummary(stats: DocumentStats, gapThresholdSeconds: number): string {
  const duration =
    stats.effectiveTimesMs.length > 0 ? formatDuration(stats.durationMs) : "—";
  return `LRC stats: ${stats.cueCount} cue(s), duration ${duration}, ${stats.gaps.length} instrumental gap(s) > ${gapThresholdSeconds}s — details in the output channel.`;
}
