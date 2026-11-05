import { describe, expect, it } from "vitest";

import { truncateSafe } from "../../src/util/text";

describe("truncateSafe", () => {
  it("returns the text untouched when it fits", () => {
    expect(truncateSafe("abc", 10)).toBe("abc");
    expect(truncateSafe("abc", 3)).toBe("abc");
  });

  it("cuts at the limit without splitting surrogate pairs", () => {
    // 😀 is one surrogate pair (two UTF-16 code units): a cut landing between
    // the halves must back off, leaving no dangling half.
    expect(truncateSafe("abc😀def", 4)).toBe("abc");
    expect(truncateSafe("abc😀def", 5)).toBe("abc😀");
  });
});
