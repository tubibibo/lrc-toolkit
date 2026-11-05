import { describe, expect, it } from "vitest";

import { analyze } from "../../src/core/analyzer";
import { parseDocument } from "../../src/core/parser";

function codesOf(text: string): string[] {
  return analyze(parseDocument(text)).map((issue) => issue.code);
}

function firstIssue(text: string) {
  const issues = analyze(parseDocument(text));
  expect(issues.length).toBeGreaterThan(0);
  return issues[0]!;
}

describe("analyze", () => {
  it("reports malformed timestamps as errors", () => {
    const issue = firstIssue("[01:60]text");
    expect(issue.code).toBe("invalid-timestamp");
    expect(issue.severity).toBe("error");
    expect(issue.start).toBe(0);
    expect(issue.end).toBe(7); // "[01:60]"
  });

  it("reports unrecognized leading tokens as warnings", () => {
    const issue = firstIssue("[abc]text");
    expect(issue.code).toBe("unrecognized-token");
    expect(issue.severity).toBe("warning");
  });

  it("reports plain prose lines as stray lines", () => {
    const issue = firstIssue("just a lyric without timing");
    expect(issue.code).toBe("stray-line");
    expect(issue.severity).toBe("warning");
  });

  it("flags empty content tags", () => {
    const issue = firstIssue("[ti:]");
    expect(issue.code).toBe("empty-tag-value");
    expect(issue.severity).toBe("info");
  });

  it("does not flag empty non-content tags", () => {
    expect(codesOf("[re:]")).not.toContain("empty-tag-value");
  });

  it("rejects non-integer offset values", () => {
    const issue = firstIssue("[offset:abc]");
    expect(issue.code).toBe("invalid-offset");
    expect(issue.severity).toBe("error");
  });

  it("rejects empty offset values", () => {
    expect(codesOf("[offset:]")).toContain("invalid-offset");
  });

  it("accepts signed integer offsets", () => {
    expect(codesOf("[offset:+500]")).not.toContain("invalid-offset");
    expect(codesOf("[offset:-250]")).not.toContain("invalid-offset");
  });

  it("warns about duplicated offset tags", () => {
    const issues = analyze(parseDocument("[offset:+500]\n[offset:+500]\n"));
    expect(issues.filter((issue) => issue.code === "duplicate-offset")).toHaveLength(1);
  });

  it("warns when the timeline decreases between lines", () => {
    const issue = firstIssue("[00:10.00]a\n[00:05.00]b");
    expect(issue.code).toBe("decreasing-timestamp");
    expect(issue.fix?.command).toBe("sortByTimestamp");
  });

  it("keeps checking the timeline when an offset tag is present", () => {
    // Effective display time = stamp − offset; ordering issues still surface.
    const issue = firstIssue("[offset:+20000]\n[00:05.00]a\n[00:03.00]b");
    expect(issue.code).toBe("decreasing-timestamp");
    // The problem is reported on line 2's stamp ([00:03.00] is earlier than line 1).
    expect(issue.start).toBeGreaterThan(25);
  });

  it("reports each duplicate group once", () => {
    const issues = analyze(parseDocument("[00:10.00]a\n[00:10.00]b\n[00:10.00]c"));
    expect(issues.filter((issue) => issue.code === "duplicate-timestamp")).toHaveLength(1);
  });

  it("reports within-line decreasing stamps with the expand fix", () => {
    const issue = firstIssue("[00:10.00][00:05.00]x");
    expect(issue.code).toBe("decreasing-timestamp");
    expect(issue.fix?.command).toBe("expandMultiStampLines");
  });

  it("reports within-line duplicate stamps", () => {
    expect(codesOf("[00:10.00][00:10.00]x")).toContain("duplicate-timestamp");
  });

  it("reports cue lines without text", () => {
    const issue = firstIssue("[00:01.00]");
    expect(issue.code).toBe("empty-cue-text");
    expect(issue.severity).toBe("info");
  });

  it("flags malformed timestamps buried in lyric text", () => {
    const issue = firstIssue("[00:10.00]hello [01:60] world");
    expect(issue.code).toBe("invalid-timestamp");
    expect(issue.severity).toBe("error");
  });

  it("tolerates letter-only and tag-shaped labels inside lyric text", () => {
    expect(codesOf("[00:01.00] [Chorus]")).toEqual([]);
    expect(codesOf("[00:01.00]x [foo:bar] y")).toEqual([]);
  });

  it("warns about word timings before their cue start", () => {
    const issue = firstIssue("[00:10.00] <00:09.00>word");
    expect(issue.code).toBe("word-timing-before-cue");
  });

  it("warns about disordered word timings", () => {
    const issue = firstIssue("[00:10.00] <00:11.00>a <00:10.50>b");
    expect(issue.code).toBe("word-timing-disorder");
  });

  it("warns about timing-shaped malformed word timings", () => {
    const issue = firstIssue("[00:10.00] <00:60>");
    expect(issue.code).toBe("invalid-word-timing");
  });

  it("stays silent about angle brackets that are not timing-shaped", () => {
    expect(codesOf("[00:10.00] <ab>")).not.toContain("invalid-word-timing");
    expect(codesOf("[00:20.00]第<2>段")).not.toContain("invalid-word-timing");
  });

  it("stays silent on a clean document", () => {
    expect(codesOf("[ti:x]\n[00:01.00]a\n[00:02.00]b\n")).toEqual([]);
  });

  it("covers the messy fixture with the expected code set", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../fixtures/messy.lrc", import.meta.url), "utf-8");
    const codes = new Set(codesOf(text));
    expect(codes).toContain("invalid-timestamp");
    expect(codes).toContain("unrecognized-token");
    expect(codes).toContain("stray-line");
    expect(codes).toContain("decreasing-timestamp");
    expect(codes).toContain("word-timing-disorder");
    expect(codes).toContain("empty-cue-text");
  });
});
