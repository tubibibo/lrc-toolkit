# ADR 0004 — The `[offset:]` sign convention

*Status: accepted · Date: 2026-11-05*

## Context

The LRC "standard" is a de-facto convention, and its `[offset:]` tag is the least standardized
part. The [LRC format description on Wikipedia](https://en.wikipedia.org/wiki/LRC_(file_format))
defines: *"offset: +100 — shifts the time stamps +100 milliseconds"* with the explicit meaning
that **positive offsets make lyrics display earlier**; some player implementations interpret
the sign the other way, and a few ignore the tag entirely.

The toolkit has to pick one behavior for hovers, statistics and the *Apply offset* command.

## Decision

LRC Toolkit follows the Wikipedia definition everywhere:

```
display time = raw timestamp − offset        (offset in milliseconds, positive → earlier display)
```

In particular, **Apply `[offset:]` into timestamps** shifts every raw stamp by `−offset` and
deletes the tag, so the display timing is bit-for-bit preserved under this convention.

Related consequences:

- Sorting uses **raw timestamps**: a uniform offset shifts every cue equally and can never
  change relative order, so an "offset-aware sort" would be a no-op dressed up as a feature.
- Statistics and hovers show the *effective* (offset-adjusted) time alongside the raw value.

## Caveats (documented in the README too)

Because some players invert the sign, users who need a guaranteed direction should prefer
**Shift All Timestamps**, which moves raw values by an explicit ±N ms and cannot be
misinterpreted downstream.

## References

- [LRC (file format) — Wikipedia](https://en.wikipedia.org/wiki/LRC_(file_format))
- [Poweramp forum: offset value in LRC files is not respected](https://forum.powerampapp.com/topic/26289-offset-value-in-lrc-files-and-embedded-synced-lyrics-is-not-respected/)
