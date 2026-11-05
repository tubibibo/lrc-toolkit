import { describe, expect, it } from "vitest";

import { inspectAt } from "../../src/core/hover";
import { parseDocument } from "../../src/core/parser";

describe("inspectAt", () => {
  it("resolves the effective time when an offset tag shares a line with another tag", () => {
    const doc = parseDocument("[ti:x][offset:+500]\n[00:10.00]a\n");
    const stamp = doc.lines[1];
    if (stamp?.kind !== "cue") return expect.fail();
    const target = inspectAt(doc, stamp.stamps[0]!.start + 2);
    expect(target?.kind).toBe("timestamp");
    if (target?.kind !== "timestamp") return;
    expect(target.effectiveMs).toBe(9_500);
  });

  it("describes an additional tag token under the cursor", () => {
    const doc = parseDocument("[ti:x][offset:+500]\n");
    const line = doc.lines[0];
    if (line?.kind !== "tag") return expect.fail();
    const target = inspectAt(doc, line.additional[0]!.span.start + 2);
    expect(target?.kind).toBe("tag");
    if (target?.kind !== "tag") return;
    expect(target.key).toBe("offset");
    expect(target.description).toContain("Global shift");
  });

  it("returns null outside of any token", () => {
    expect(inspectAt(parseDocument("[00:01.00]hello\n"), 12)).toBeNull();
  });

  it("uses document-wide stamp order for prev/next on multi-stamp lines", () => {
    const doc = parseDocument("[00:10.00][00:05.00]chorus\n[00:20.00]next\n");
    const line = doc.lines[0];
    if (line?.kind !== "cue") return expect.fail();

    const second = inspectAt(doc, line.stamps[1]!.start + 2);
    expect(second?.kind).toBe("timestamp");
    if (second?.kind !== "timestamp") return;
    expect(second.prevEffectiveMs).toBe(10_000); // same line, first stamp
    expect(second.nextEffectiveMs).toBe(20_000);

    const first = inspectAt(doc, line.stamps[0]!.start + 2);
    if (first?.kind !== "timestamp") return;
    expect(first.prevEffectiveMs).toBeNull();
    expect(first.nextEffectiveMs).toBe(5_000);
  });

  it("hovers word timings relative to their cue start", () => {
    const doc = parseDocument("[00:10.00] <00:11.00>word\n");
    const line = doc.lines[0];
    if (line?.kind !== "cue") return expect.fail();
    const target = inspectAt(doc, line.wordTimings[0]!.start + 2);
    expect(target?.kind).toBe("word-timing");
    if (target?.kind !== "word-timing") return;
    expect(target.cueStartMs).toBe(10_000);
    expect(target.stamp.totalMs).toBe(11_000);
  });

  it("describes the primary tag under the cursor", () => {
    const doc = parseDocument("[ti:Demo]\n");
    const target = inspectAt(doc, 2);
    expect(target?.kind).toBe("tag");
    if (target?.kind !== "tag") return;
    expect(target.key).toBe("ti");
    expect(target.description).toContain("Title");
  });
});
