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
  LrcDocument,
  LrcLine,
  TimestampSpan,
  Token,
  WordTiming,
} from "./model";
import { looksLikeStampBody, parseStampBody } from "../util/time";

/** Valid enhanced-LRC word timings: `<mm:ss.xx>`. */
const WORD_TIMING = /<(\d{1,3}:\d{1,2}(?:\.\d{1,3})?)>/g;
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
}

/** Detect the line ending from the first break in the text (none found → LF). */
function detectEol(text: string): "\n" | "\r\n" {
  const firstLf = text.indexOf("\n");
  if (firstLf === -1) {
    return "\n";
  }
  return firstLf > 0 && text[firstLf - 1] === "\r" ? "\r\n" : "\n";
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
    lines.push({ text: text.slice(start, index), start, end: index });
    start = index + match[0].length;
  }
  lines.push({ text: text.slice(start), start, end: text.length });
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
      const valueStart = start + colonIndex + 2;
      return {
        start,
        end,
        classification: "tag",
        key: rawKey.toLowerCase(),
        value: inner.slice(colonIndex + 1),
        valueSpan: { start: valueStart, end: end - 1 },
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
    return {
      kind: "tag",
      line: index,
      span: { start: raw.start, end: raw.end },
      rawKey: first.key ?? "",
      key: first.key ?? "",
      value: first.value ?? "",
      valueSpan: first.valueSpan ?? { start: raw.start, end: raw.end },
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
  const lines = splitLines(text).map(buildLine);
  return { text, eol, lines };
}

/** Absolute text of a line without its line break. */
export function rawLineText(doc: LrcDocument, span: BracketSpan): string {
  return doc.text.slice(span.start, span.end);
}
