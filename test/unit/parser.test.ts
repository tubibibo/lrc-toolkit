import { describe, expect, it } from "vitest";

import { analyze } from "../../src/core/analyzer";
import { parseDocument } from "../../src/core/parser";

describe("parseDocument", () => {
  it("classifies metadata tag lines with exact value spans", () => {
    const doc = parseDocument("[ti:Demo]");
    const line = doc.lines[0];
    expect(line?.kind).toBe("tag");
    if (line?.kind !== "tag") return;
    expect(line.key).toBe("ti");
    expect(line.value).toBe("Demo");
    expect(doc.text.slice(line.valueSpan.start, line.valueSpan.end)).toBe("Demo");
    expect(doc.text.slice(line.span.start, line.span.end)).toBe("[ti:Demo]");
  });

  it("parses single-stamp cue lines", () => {
    const doc = parseDocument("[00:01.00]hello");
    const line = doc.lines[0];
    expect(line?.kind).toBe("cue");
    if (line?.kind !== "cue") return;
    expect(line.stamps).toHaveLength(1);
    expect(line.stamps[0]?.stamp.totalMs).toBe(1_000);
    expect(line.stamps[0]?.stamp.fractionDigits).toBe(2);
    expect(doc.text.slice(line.stamps[0]!.start, line.stamps[0]!.end)).toBe("[00:01.00]");
    expect(line.text).toBe("hello");
    expect(line.textStart).toBe(10);
    expect(line.textEnd).toBe(15);
  });

  it("parses multi-timestamp cue lines", () => {
    const doc = parseDocument("[00:02.00][00:03.50]again");
    const line = doc.lines[0];
    if (line?.kind !== "cue") return expect.fail();
    expect(line.stamps).toHaveLength(2);
    expect(line.stamps[1]?.stamp.totalMs).toBe(3_500);
    expect(line.text).toBe("again");
  });

  it("preserves fraction digit counts", () => {
    const doc = parseDocument("[1:2.5]a\n[01:02.500]b");
    const first = doc.lines[0];
    const second = doc.lines[1];
    if (first?.kind !== "cue" || second?.kind !== "cue") return expect.fail();
    expect(first.stamps[0]?.stamp.fractionDigits).toBe(1);
    expect(first.stamps[0]?.stamp.totalMs).toBe(62_500);
    expect(second.stamps[0]?.stamp.fractionDigits).toBe(3);
  });

  it("treats blank lines as blank and keeps their spans", () => {
    const doc = parseDocument("[00:01.00]a\n\n[00:02.00]b");
    expect(doc.lines[1]?.kind).toBe("blank");
  });

  it("marks unrecognized leading tokens as unknown lines", () => {
    const doc = parseDocument("[abc]text");
    const line = doc.lines[0];
    if (line?.kind !== "unknown") return expect.fail();
    expect(line.tokens).toHaveLength(1);
    expect(line.tokens[0]?.looksLikeStamp).toBe(false);
  });

  it("flags malformed timestamps as stamp-like unknown tokens", () => {
    const doc = parseDocument("[01:60]text");
    const line = doc.lines[0];
    if (line?.kind !== "unknown") return expect.fail();
    expect(line.tokens[0]?.looksLikeStamp).toBe(true);
  });

  it("keeps stray tokens after the first stamp on cue lines", () => {
    const doc = parseDocument("[00:01.00][01:60]x");
    const line = doc.lines[0];
    if (line?.kind !== "cue") return expect.fail();
    expect(line.strayTokens).toHaveLength(1);
    expect(line.strayTokens[0]?.looksLikeStamp).toBe(true);
  });

  it("treats bracketed section labels after a stamp as plain text", () => {
    const doc = parseDocument("[00:01.00] [Chorus]");
    const line = doc.lines[0];
    if (line?.kind !== "cue") return expect.fail();
    expect(line.strayTokens).toHaveLength(0);
    expect(line.text).toBe(" [Chorus]");
  });

  it("extracts valid enhanced-LRC word timings", () => {
    const doc = parseDocument("[00:10.00] <00:11.00>word <00:12.50>end");
    const line = doc.lines[0];
    if (line?.kind !== "cue") return expect.fail();
    expect(line.wordTimings).toHaveLength(2);
    expect(line.wordTimings[0]?.stamp.totalMs).toBe(11_000);
    expect(line.wordTimings[1]?.stamp.totalMs).toBe(12_500);
    expect(doc.text.slice(line.wordTimings[0]!.start, line.wordTimings[0]!.end)).toBe("<00:11.00>");
    expect(line.invalidWordTimings).toHaveLength(0);
  });

  it("flags malformed word timings separately", () => {
    const doc = parseDocument("[00:10.00] <ab> x");
    const line = doc.lines[0];
    if (line?.kind !== "cue") return expect.fail();
    expect(line.wordTimings).toHaveLength(0);
    expect(line.invalidWordTimings).toHaveLength(1);
  });

  it("handles CRLF documents", () => {
    const doc = parseDocument("[ti:x]\r\n[00:01.00]a\r\n");
    expect(doc.eol).toBe("\r\n");
    expect(doc.lines).toHaveLength(3); // tag, cue, phantom blank
    expect(doc.lines[2]?.kind).toBe("blank");
  });

  it("splits mixed LF/CRLF documents without carriage-return residue", () => {
    const doc = parseDocument("[00:01.00]a\r\n[00:02.00]b\n[00:03.00]c");
    expect(doc.eol).toBe("\r\n"); // first break is CRLF
    expect(doc.lines.map((line) => (line.kind === "cue" ? line.text : "other"))).toEqual([
      "a",
      "b",
      "c",
    ]);
    // No \r survives inside any parsed line span (offsets stay correct).
    const hasResidue = doc.lines.some((line) =>
      doc.text.slice(line.span.start, line.span.end).includes("\r"),
    );
    expect(hasResidue).toBe(false);
    expect(analyze(doc)).toEqual([]);
  });

  it("produces a phantom blank line for a trailing newline", () => {
    const doc = parseDocument("[00:01.00]a\n");
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[1]?.kind).toBe("blank");
  });

  it("keeps line numbers in order", () => {
    const doc = parseDocument("[ti:x]\n[00:01.00]a\n[00:02.00]b");
    expect(doc.lines.map((line) => line.line)).toEqual([0, 1, 2]);
  });
});
