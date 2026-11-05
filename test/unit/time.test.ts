import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatStamp,
  looksLikeStampBody,
  parseStampBody,
  roundToPrecision,
} from "../../src/util/time";

describe("parseStampBody", () => {
  it("parses integer seconds", () => {
    expect(parseStampBody("01:02")).toEqual({ ok: true, totalMs: 62_000, fractionDigits: 0 });
  });

  it("parses 1/2/3-digit fractions into milliseconds", () => {
    expect(parseStampBody("01:02.5")).toEqual({ ok: true, totalMs: 62_500, fractionDigits: 1 });
    expect(parseStampBody("01:02.50")).toEqual({ ok: true, totalMs: 62_500, fractionDigits: 2 });
    expect(parseStampBody("01:02.500")).toEqual({ ok: true, totalMs: 62_500, fractionDigits: 3 });
  });

  it("allows minutes above 59 (long tracks)", () => {
    expect(parseStampBody("75:03")).toEqual({ ok: true, totalMs: 4_503_000, fractionDigits: 0 });
  });

  it("accepts four-digit minutes", () => {
    expect(parseStampBody("1000:00.500")).toEqual({
      ok: true,
      totalMs: 60_000_500,
      fractionDigits: 3,
    });
    expect(looksLikeStampBody("1000:00")).toBe(true);
  });

  it("rejects seconds out of range", () => {
    expect(parseStampBody("01:60")).toEqual({ ok: false, reason: "seconds-out-of-range" });
  });

  it("rejects malformed bodies", () => {
    expect(parseStampBody("1:2:3")).toEqual({ ok: false, reason: "format" });
    expect(parseStampBody("01.02")).toEqual({ ok: false, reason: "format" });
    expect(parseStampBody("-1:02")).toEqual({ ok: false, reason: "format" });
  });

  it("reports empty bodies distinctly", () => {
    expect(parseStampBody("")).toEqual({ ok: false, reason: "empty" });
    expect(parseStampBody("   ")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("looksLikeStampBody", () => {
  it("accepts loose timestamp shapes", () => {
    expect(looksLikeStampBody("01:60")).toBe(true);
    expect(looksLikeStampBody("1:2")).toBe(true);
    expect(looksLikeStampBody("01:02.1234")).toBe(true);
  });

  it("rejects non-timestamps", () => {
    expect(looksLikeStampBody("abc")).toBe(false);
    expect(looksLikeStampBody("")).toBe(false);
    expect(looksLikeStampBody("ti:Title")).toBe(false);
  });
});

describe("formatStamp", () => {
  it("renders the canonical mm:ss.xx form", () => {
    expect(formatStamp(62_500, 2)).toBe("01:02.50");
    expect(formatStamp(62_500, 1)).toBe("01:02.5");
    expect(formatStamp(62_000, 0)).toBe("01:02");
    expect(formatStamp(4_503_000, 2)).toBe("75:03.00");
    expect(formatStamp(0, 2)).toBe("00:00.00");
  });

  it("clamps negative input to zero", () => {
    expect(formatStamp(-500, 2)).toBe("00:00.00");
  });
});

describe("roundToPrecision", () => {
  it("rounds onto the precision grid", () => {
    expect(roundToPrecision(1_249, 2)).toBe(1_250);
    expect(roundToPrecision(1_254, 2)).toBe(1_250);
    expect(roundToPrecision(1_255, 2)).toBe(1_260);
    expect(roundToPrecision(62_000, 3)).toBe(62_000);
  });
});

describe("formatClock", () => {
  it("renders a two-digit clock", () => {
    expect(formatClock(83_450)).toBe("01:23.45");
    expect(formatClock(0)).toBe("00:00.00");
  });
});
