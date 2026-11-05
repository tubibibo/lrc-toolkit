/**
 * Presentation policies shared between the core and the adapter, expressed as
 * pure predicates so they can be unit-tested without an editor runtime.
 */

export interface SortActionPolicyInput {
  /** The lightbulb/Refactor context explicitly asked for the sort kind. */
  explicitlyRequested: boolean;
  /** The document contains at least one `decreasing-timestamp` diagnostic. */
  hasDecreasingTimestamps: boolean;
}

/**
 * Whether to offer the "Sort all lines by timestamp" source action.
 * Sorted files should not see a permanent sort entry on every lightbulb.
 */
export function shouldOfferSortAction(input: SortActionPolicyInput): boolean {
  return input.explicitlyRequested || input.hasDecreasingTimestamps;
}
