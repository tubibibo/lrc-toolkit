import { describe, expect, it } from "vitest";

import { shouldOfferSortAction } from "../../src/core/policy";

describe("shouldOfferSortAction", () => {
  it("offers sort when the timeline is broken", () => {
    expect(shouldOfferSortAction({ explicitlyRequested: false, hasDecreasingTimestamps: true })).toBe(
      true,
    );
  });

  it("offers sort when explicitly requested, even on sorted files", () => {
    expect(shouldOfferSortAction({ explicitlyRequested: true, hasDecreasingTimestamps: false })).toBe(
      true,
    );
  });

  it("stays quiet on sorted files without an explicit request", () => {
    expect(shouldOfferSortAction({ explicitlyRequested: false, hasDecreasingTimestamps: false })).toBe(
      false,
    );
  });
});
