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
});
