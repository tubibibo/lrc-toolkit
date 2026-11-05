import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseStampBody } from "../../src/util/time";

/**
 * Guards consistency between the TextMate grammar and the analyzer:
 * whatever the parser accepts must be highlighted as valid, and whatever it
 * rejects must fall through to the invalid-bracket rule (P1-1 / P1-2).
 *
 * The grammar file is read with `readFileSync` (not a JSON import) because
 * `resolveJsonModule` is intentionally disabled in tsconfig.
 */

interface GrammarShape {
  repository: Record<string, { match: string }>;
}

const grammar = JSON.parse(
  readFileSync(new URL("../../syntaxes/lrc.tmLanguage.json", import.meta.url), "utf-8"),
) as GrammarShape;

const timestampPattern = new RegExp(grammar.repository.timestamp!.match);
const wordTimingPattern = new RegExp(grammar.repository["word-timing"]!.match);
const tagPattern = new RegExp(grammar.repository["metadata-tag"]!.match);
const labelPattern = new RegExp(grammar.repository["section-label"]!.match);
const wordTimingInvalidPattern = new RegExp(grammar.repository["word-timing-invalid"]!.match);
const invalidBracketPattern = new RegExp(grammar.repository["invalid-bracket"]!.match);

/** Parser ground truth for a bracket token body. */
function parserAccepts(body: string): boolean {
  return parseStampBody(body).ok;
}

describe("grammar ⇔ parser consistency", () => {
  const stampTokens = [
    "[00:01]",
    "[1:5]",
    "[01:05.5]",
    "[01:60]",
    "[1:5.123]",
    "[123:59.999]",
    "[01:5.1234]",
    "[1000:00.500]",
  ];

  it("timestamp pattern accepts exactly what the parser accepts", () => {
    for (const token of stampTokens) {
      expect(timestampPattern.test(token)).toBe(parserAccepts(token.slice(1, -1)));
    }
  });

  const wordTimingTokens = [
    "<00:01>",
    "<1:5>",
    "<00:60>",
    "<00:01.5>",
    "<00:01.123>",
    "<00:01.1234>",
    "<1000:00.500>",
  ];

  it("word-timing pattern accepts exactly what the parser accepts", () => {
    for (const token of wordTimingTokens) {
      expect(wordTimingPattern.test(token)).toBe(parserAccepts(token.slice(1, -1)));
    }
  });

  it("tag pattern matches keys without inner spaces, like the parser", () => {
    expect(tagPattern.test("[ti:x]")).toBe(true);
    expect(tagPattern.test("[offset:+500]")).toBe(true);
    expect(tagPattern.test("[ti:]")).toBe(true);
    expect(tagPattern.test("[ti : x]")).toBe(false);
  });

  it("renders non-timing bracket labels neutrally, never red", () => {
    for (const token of ["[Chorus]", "[foo:bar]", "[abc]"]) {
      expect(labelPattern.test(token)).toBe(true);
      expect(invalidBracketPattern.test(token)).toBe(false);
    }
  });

  it("keeps red reserved for timing-shaped malformed brackets", () => {
    for (const token of ["[01:60]", "[01:02.1234]", "[1:2:3]"]) {
      expect(invalidBracketPattern.test(token)).toBe(true);
      expect(labelPattern.test(token)).toBe(false);
    }
    // <00:60> is timing-shaped but fails the valid rule → falls to the invalid one.
    expect(wordTimingPattern.test("<00:60>")).toBe(false);
    expect(wordTimingInvalidPattern.test("<00:60>")).toBe(true);
    // Valid word timings are consumed by the valid rule (listed first) before
    // the invalid rule can ever see them.
    expect(wordTimingPattern.test("<00:10.50>")).toBe(true);
    // Non-timing brackets are plain text for both rules.
    for (const token of ["<b>", "<2>"]) {
      expect(wordTimingInvalidPattern.test(token)).toBe(false);
      expect(wordTimingPattern.test(token)).toBe(false);
    }
  });
});
