/**
 * Pure string helpers shared by the core and the adapter.
 */

/**
 * Truncates to `max` UTF-16 code units without splitting a surrogate pair:
 * a cut landing between the halves of a pair drops the dangling half, so
 * outline labels never render a lone replacement character.
 */
export function truncateSafe(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  let cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    cut = cut.slice(0, -1);
  }
  return cut;
}
