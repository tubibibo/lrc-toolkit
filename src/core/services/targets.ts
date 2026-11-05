/**
 * Shared helpers for iterating every timestamp in a document — line stamps
 * and enhanced word timings alike — and re-rendering them with their original
 * bracket style (`[]` for line stamps, `<>` for word timings).
 */

import type { BracketSpan, FractionDigits, LrcDocument, TimeStamp } from "../model";
import { formatStamp } from "../../util/time";

export interface StampTarget {
  span: BracketSpan;
  stamp: TimeStamp;
}

type CueLine = Extract<LrcDocument["lines"][number], { kind: "cue" }>;

/** Every timestamp on a cue line, line stamps first (document order within each kind). */
export function stampTargets(line: CueLine): StampTarget[] {
  return [
    ...line.stamps.map((span) => ({ span: span as BracketSpan, stamp: span.stamp })),
    ...line.wordTimings.map((timing) => ({ span: timing as BracketSpan, stamp: timing.stamp })),
  ];
}

/** Re-render a timestamp with the bracket style it originally used (`[]` or `<>`). */
export function renderStamp(
  doc: LrcDocument,
  span: BracketSpan,
  totalMs: number,
  fractionDigits: FractionDigits,
): string {
  const open = doc.text[span.start] === "<" ? "<" : "[";
  const close = open === "<" ? ">" : "]";
  return `${open}${formatStamp(totalMs, fractionDigits)}${close}`;
}
