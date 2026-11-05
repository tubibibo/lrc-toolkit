/**
 * Framework-free domain model for LRC documents.
 *
 * This layer must never import `vscode` — that constraint is enforced by ESLint
 * (`no-restricted-imports` for `src/core/**`) and documented in
 * `docs/adr/0002-framework-free-core.md`.
 *
 * All spans are expressed as absolute character offsets into the original
 * document text. Keeping diagnostics and edits as plain data allows the whole
 * core to be unit-tested without an editor runtime.
 */

/** Severity mirror, kept as plain data so the core has no editor dependency. */
export type Severity = "error" | "warning" | "info";

/** A single plain-text replacement expressed with absolute character offsets. */
export interface TextEdit {
  /** Offset of the first replaced character (inclusive). */
  start: number;
  /** Offset just past the last replaced character (exclusive). */
  end: number;
  newText: string;
}

/** A suggested fix attached to a diagnostic. */
export interface DiagnosticFix {
  title: string;
  /** Edits to apply directly when the fix is accepted. */
  edits?: TextEdit[];
  /** Or a command id (from `core/commands.ts`) to run instead. */
  command?: string;
}

export interface LrcDiagnostic {
  start: number;
  end: number;
  severity: Severity;
  /** Stable machine-readable identifier, e.g. `invalid-timestamp`. */
  code: string;
  message: string;
  fix?: DiagnosticFix;
}

/** Digits used for the fractional part of a timestamp (0–3). */
export type FractionDigits = 0 | 1 | 2 | 3;

/** A parsed `[mm:ss.xx]` timestamp. */
export interface TimeStamp {
  /** Absolute milliseconds since 00:00:00. */
  totalMs: number;
  /** Fraction digit count, kept for faithful re-rendering. */
  fractionDigits: FractionDigits;
}

/** A `[...]` token together with its absolute span in the document. */
export interface BracketSpan {
  /** Offset of `[` (inclusive). */
  start: number;
  /** Offset just past `]` (exclusive). */
  end: number;
}

export interface TimestampSpan extends BracketSpan {
  stamp: TimeStamp;
}

export interface WordTiming extends BracketSpan {
  stamp: TimeStamp;
}

export interface CueLine {
  kind: "cue";
  /** Zero-based line number. */
  line: number;
  /** Absolute span of the whole line content (excluding the line break). */
  span: BracketSpan;
  /** One cue line may carry several timestamps (same text sung repeatedly). */
  stamps: TimestampSpan[];
  /** Bracket tokens found after the first stamp; usually section labels. */
  strayTokens: Token[];
  /** Absolute span of the text after the last timestamp (may be empty). */
  textStart: number;
  textEnd: number;
  text: string;
  /** Word-level timings found in the text (enhanced LRC / A2). */
  wordTimings: WordTiming[];
  /** `<...>` tokens that look like word timings but failed to parse. */
  invalidWordTimings: BracketSpan[];
  /** Stamp-shaped `[...]` tokens inside the lyric text (malformed timestamps). */
  invalidInlineStamps: BracketSpan[];
}

export interface TagLine {
  kind: "tag";
  line: number;
  span: BracketSpan;
  /** Span of the primary (first) tag token on the line. */
  primarySpan: BracketSpan;
  /** Raw tag key as written, e.g. `Ti`. */
  rawKey: string;
  /** Lower-cased tag key, e.g. `ti`, `offset`. */
  key: string;
  value: string;
  /** Absolute span of the value part (between `:` and `]`). */
  valueSpan: BracketSpan;
  /** Further tag tokens sharing the line, in document order. */
  additional: TagToken[];
}

/** Every tag token on a tag line: the primary first, then the additional ones. */
export function allTags(line: TagLine): TagToken[] {
  return [
    { span: line.primarySpan, key: line.key, value: line.value, valueSpan: line.valueSpan },
    ...line.additional,
  ];
}

/** One `[key:value]` token, with its own span (a line may carry several). */
export interface TagToken {
  span: BracketSpan;
  key: string;
  value: string;
  valueSpan: BracketSpan;
}

export interface BlankLine {
  kind: "blank";
  line: number;
  span: BracketSpan;
}

/** A line whose leading token could not be classified. */
export interface UnknownLine {
  kind: "unknown";
  line: number;
  span: BracketSpan;
  /** Bracket tokens that could not be classified. */
  tokens: Token[];
}

export type LrcLine = CueLine | TagLine | BlankLine | UnknownLine;

export interface Token extends BracketSpan {
  classification: "stamp" | "tag" | "unknown";
  /** Present when `classification === "stamp"`. */
  stamp?: TimeStamp;
  /** Present when `classification === "tag"`. */
  key?: string;
  value?: string;
  valueSpan?: BracketSpan;
  /** For `unknown` tokens: does it look like a malformed timestamp? */
  looksLikeStamp?: boolean;
}

export interface LrcDocument {
  /** Original text (needed for whole-document rewrites). */
  text: string;
  /** The first line break found in the text, verbatim (LF for break-free docs). */
  eol: Eol;
  lines: LrcLine[];
}

/** Line endings the toolkit understands, including lone CR (classic Mac). */
export type Eol = "\n" | "\r\n" | "\r";

export interface InstrumentalGap {
  fromMs: number;
  toMs: number;
  durationMs: number;
}

export interface DocumentStats {
  cueCount: number;
  tagCount: number;
  /** Lines that carry word-level (enhanced LRC) timings. */
  wordTimedLineCount: number;
  /** Span between the first and last effective cue time in ms, or null. */
  durationMs: number | null;
  /** Effective times of all cues, ascending and deduplicated. */
  effectiveTimesMs: number[];
  /** Consecutive cue times farther apart than the configured threshold. */
  gaps: InstrumentalGap[];
  /** Number of cue lines starting exactly where the previous one started. */
  duplicateTimestampCount: number;
}
