/**
 * Parser: raw LRC text → structured {@link LrcDocument}.
 *
 * The parser never judges validity; it only classifies tokens so the analyzer
 * can turn them into diagnostics. Invalid constructs are represented structurally
 * (e.g. `unknown` tokens), never thrown away.
 */

import type {
  BracketSpan,
  CueLine,
  Eol,
  LrcDocument,
  LrcLine,
  LineEnding,
  TagToken,
  TimestampSpan,
  Token,
  WordTiming,
} from "./model";
import { looksLikeStampBody, parseStampBody } from "../util/time";

/** Valid enhanced-LRC word timings: `<mm:ss.xx>` (minutes up to four digits). */
const WORD_TIMING = /<(\d{1,4}:\d{1,2}(?:\.\d{1,3})?)>/g;
/**
 * `<...>` tokens that are *timing-shaped* (start with 1–4 digits and a colon)
 * but failed the valid pattern above. Angle brackets without that shape —
 * `<2>`, `<b>`, `I <3 you` — are lyric text, never timings.
 */
const WORD_TIMING_LIKE = /<\d{1,4}:[^<>\n]{0,22}>/g;
const TAG_KEY = /^[A-Za-z][A-Za-z0-9]*$/;

interface RawLine {
  text: string;
  start: number;
  end: number;
  /** The exact terminator after this line (`""` for the final line). */
  eol: LineEnding;
}

/** Detect the line ending from the first break in the text, verbatim (none found → LF). */
function detectEol(text: string): Eol {
  const match = /\r\n|\n|\r/.exec(text);
  return (match?.[0] as Eol | undefined) ?? "\n";
}

/**
 * Split `text` into content lines with absolute spans, handling mixed
 * LF / CRLF / CR line endings. A trailing break yields a phantom blank line.
 */
function splitLines(text: string): RawLine[] {
  const lines: RawLine[] = [];
  let start = 0;
  for (const match of text.matchAll(/\r\n|\n|\r/g)) {
    const index = match.index ?? 0;
    lines.push({ text: text.slice(start, index), start, end: index, eol: match[0] as LineEnding });
    start = index + match[0].length;
  }
  lines.push({ text: text.slice(start), start, end: text.length, eol: "" });
  return lines;
}

/** Parse every leading `[...]` bracket token of a line. */
function parseLeadingTokens(lineText: string, lineStart: number): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  for (;;) {
    if (lineText[pos] !== "[") {
      return tokens;
    }
    const close = lineText.indexOf("]", pos + 1);
    if (close === -1) {
      return tokens;
    }
    const inner = lineText.slice(pos + 1, close);
    const start = lineStart + pos;
    const end = lineStart + close + 1;
    tokens.push(classifyToken(inner, start, end));
    pos = close + 1;
  }
}

function classifyToken(inner: string, start: number, end: number): Token {
  const stamp = parseStampBody(inner);
  if (stamp.ok) {
    return {
      start,
      end,
      classification: "stamp",
      stamp: { totalMs: stamp.totalMs, fractionDigits: stamp.fractionDigits },
    };
  }
  const colonIndex = inner.indexOf(":");
  if (colonIndex > 0) {
    const rawKey = inner.slice(0, colonIndex);
    if (TAG_KEY.test(rawKey)) {
      // `inner` starts at `start + 1`; the value begins right after the colon.
      const value = inner.slice(colonIndex + 1);
      // An empty value would yield a zero-width span (invisible squiggle);
      // fall back to the whole token interior so the diagnostic is visible.
      const valueSpan =
        value.length > 0
          ? { start: start + colonIndex + 2, end: end - 1 }
          : { start: start + 1, end: end - 1 };
      return {
        start,
        end,
        classification: "tag",
        key: rawKey.toLowerCase(),
        value,
        valueSpan,
      };
    }
  }
  return { start, end, classification: "unknown", looksLikeStamp: looksLikeStampBody(inner) };
}

/** Extract valid and malformed word timings from a cue's text segment. */
function parseWordTimings(
  text: string,
  textStart: number,
): {
  wordTimings: WordTiming[];
  invalidWordTimings: BracketSpan[];
} {
  const valid: WordTiming[] = [];
  for (const match of text.matchAll(WORD_TIMING)) {
    const stamp = parseStampBody(match[1] ?? "");
    if (!stamp.ok) {
      continue;
    }
    valid.push({
      start: textStart + (match.index ?? 0),
      end: textStart + (match.index ?? 0) + match[0].length,
      stamp: { totalMs: stamp.totalMs, fractionDigits: stamp.fractionDigits },
    });
  }
  const invalid: BracketSpan[] = [];
  for (const match of text.matchAll(WORD_TIMING_LIKE)) {
    const start = textStart + (match.index ?? 0);
    const end = start + match[0].length;
    const overlapsValid = valid.some((v) => v.start === start);
    if (!overlapsValid) {
      invalid.push({ start, end });
    }
  }
  return { wordTimings: valid, invalidWordTimings: invalid };
}

/** Inline `[...]` tokens in lyric text that look like malformed timestamps. */
const INLINE_BRACKET = /\[([^[\]\n]*)\]/g;

/**
 * Stamp-shaped `[...]` tokens inside a cue's text region. Letter-only labels
 * (`[Chorus]`) and tag-shaped annotations (`[foo:bar]`) are lyric content,
 * not timing attempts, and stay untouched.
 */
function parseInlineStamps(text: string, textStart: number): BracketSpan[] {
  const invalid: BracketSpan[] = [];
  for (const match of text.matchAll(INLINE_BRACKET)) {
    const inner = match[1] ?? "";
    if (!looksLikeStampBody(inner)) {
      continue;
    }
    const start = textStart + (match.index ?? 0);
    invalid.push({ start, end: start + match[0].length });
  }
  return invalid;
}

function buildLine(raw: RawLine, index: number): LrcLine {
  const tokens = parseLeadingTokens(raw.text, raw.start);
  const first = tokens[0];
  const last = tokens.length > 0 ? tokens[tokens.length - 1] : undefined;
  const restOffset = last ? last.end : raw.start;
  const restText = raw.text.slice(restOffset - raw.start);

  if (tokens.length === 0) {
    if (raw.text.trim() === "") {
      return { kind: "blank", line: index, span: { start: raw.start, end: raw.end } };
    }
    // No brackets at all: plain prose, not a valid LRC line.
    return {
      kind: "unknown",
      line: index,
      span: { start: raw.start, end: raw.end },
      tokens: [],
    };
  }

  if (first && first.classification === "tag") {
    // A line may carry several tags ([ti:x][offset:+500]); collect the rest.
    const additional: TagToken[] = [];
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token?.classification === "tag") {
        additional.push({
          span: { start: token.start, end: token.end },
          key: token.key ?? "",
          value: token.value ?? "",
          valueSpan: token.valueSpan ?? { start: token.start, end: token.end },
        });
      }
      // Non-tag tokens after the primary tag are tolerated silently (kept
      // as-is by surgical edits).
    }
    return {
      kind: "tag",
      line: index,
      span: { start: raw.start, end: raw.end },
      primarySpan: { start: first.start, end: first.end },
      rawKey: first.key ?? "",
      key: first.key ?? "",
      value: first.value ?? "",
      valueSpan: first.valueSpan ?? { start: raw.start, end: raw.end },
      additional,
    };
  }

  const stamps: TimestampSpan[] = [];
  const strayTokens: Token[] = [];
  // Token 0 already decided the line kind: when it is a stamp it belongs to
  // `stamps`; later tokens beyond stamps are "stray".
  if (first && first.classification === "stamp" && first.stamp) {
    stamps.push({ start: first.start, end: first.end, stamp: first.stamp });
  }
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) {
      continue;
    }
    if (token.classification === "stamp" && token.stamp) {
      stamps.push({ start: token.start, end: token.end, stamp: token.stamp });
    } else if (token.classification === "unknown") {
      strayTokens.push(token);
    }
    // Tag tokens mixed into a cue line are tolerated silently (kept as-is
    // by surgical edits) — they are too rare to deserve their own diagnostic.
  }

  const textStart = restOffset;
  const textEnd = raw.end;
  const { wordTimings, invalidWordTimings } = parseWordTimings(restText, textStart);
  const cue: CueLine = {
    kind: "cue",
    line: index,
    span: { start: raw.start, end: raw.end },
    stamps,
    strayTokens,
    textStart,
    textEnd,
    text: restText,
    wordTimings,
    invalidWordTimings,
    invalidInlineStamps: parseInlineStamps(restText, textStart),
  };

  if (first && first.classification === "unknown") {
    // First token unrecognized: downgrade to an unknown line so the analyzer
    // can explain what a valid line should look like.
    return {
      kind: "unknown",
      line: index,
      span: { start: raw.start, end: raw.end },
      tokens: [first, ...cue.strayTokens],
    };
  }
  return cue;
}

/** Parse raw LRC text into a structured document. */
export function parseDocument(text: string): LrcDocument {
  const eol = detectEol(text);
  const raw = splitLines(text);
  const lines = raw.map(buildLine);
  const lineEndings = raw.map((line) => line.eol);
  return { text, eol, lineEndings, lines };
}

/** Absolute text of a line without its line break. */
export function rawLineText(doc: LrcDocument, span: BracketSpan): string {
  return doc.text.slice(span.start, span.end);
}
