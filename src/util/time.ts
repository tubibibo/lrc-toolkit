/**
 * Time helpers shared by the parser, analyzer and services.
 * Pure functions only — no editor or Node runtime dependencies.
 */

import type { FractionDigits } from "../core/model";

/** Matches `[mm:ss]`, `[mm:ss.x]`, `[mm:ss.xx]` and `[mm:ss.xxx]`. */
const STAMP_PATTERN = /^(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?$/;

export type StampParseResult =
  | { ok: true; totalMs: number; fractionDigits: FractionDigits }
  | { ok: false; reason: "empty" | "format" | "seconds-out-of-range" };

/**
 * Parse the body of a bracket timestamp (`01:02.50` — without brackets).
 * Minutes are unbounded (songs may exceed one hour), seconds must be 0–59
 * and the fractional part may carry 1–3 digits.
 */
export function parseStampBody(raw: string): StampParseResult {
  const match = STAMP_PATTERN.exec(raw);
  if (!match) {
    return { ok: false, reason: raw.trim().length === 0 ? "empty" : "format" };
  }
  const minutesRaw = match[1];
  const secondsRaw = match[2];
  const fractionRaw = match[3];
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);
  if (seconds > 59) {
    return { ok: false, reason: "seconds-out-of-range" };
  }
  const fractionDigits = (fractionRaw?.length ?? 0) as FractionDigits;
  const fractionMs =
    fractionDigits === 0 || !fractionRaw
      ? 0
      : Number(fractionRaw) * Math.pow(10, 3 - fractionDigits);
  return {
    ok: true,
    totalMs: (minutes * 60 + seconds) * 1000 + fractionMs,
    fractionDigits,
  };
}

/** Loose check used to tell "malformed timestamp" apart from "other garbage". */
export function looksLikeStampBody(raw: string): boolean {
  return /^\d{1,3}\s*:\s*\d{1,3}(\.\d+)?$/.test(raw.trim());
}

/** Render milliseconds as `mm:ss` / `mm:ss.x` / `mm:ss.xx` / `mm:ss.xxx`. */
export function formatStamp(totalMs: number, fractionDigits: FractionDigits): string {
  const ms = Math.max(0, Math.trunc(totalMs));
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (fractionDigits === 0) {
    return `${mm}:${ss}`;
  }
  const divisor = Math.pow(10, 3 - fractionDigits);
  const fraction = String(Math.floor((ms % 1000) / divisor)).padStart(fractionDigits, "0");
  return `${mm}:${ss}.${fraction}`;
}

/** Render milliseconds as a human-readable clock, e.g. `1:23.45`. */
export function formatClock(totalMs: number): string {
  return formatStamp(totalMs, 2);
}

/** Round a millisecond value onto the grid implied by a fraction digit count. */
export function roundToPrecision(totalMs: number, fractionDigits: FractionDigits): number {
  const grid = Math.pow(10, 3 - fractionDigits);
  return Math.round(totalMs / grid) * grid;
}

/** Format a duration like `2:05.30`, falling back to `—` when unknown. */
export function formatDuration(totalMs: number | null): string {
  return totalMs === null ? "—" : formatClock(totalMs);
}
