# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `Shift All Timestamps`, `Apply [offset:] Tag` and `Normalize Timestamp Precision` now include
  enhanced (word-level) timings, so commands no longer leave word timings behind the new cue
  positions.
- Angle brackets that are not timing-shaped (`第<2>段`, `a <b> c`, `I <3 you`) are kept as lyric
  text instead of being flagged as malformed timings and stripped by `Strip Word Timings`;
  only `<digits:…>` tokens are treated as timing attempts.
- CR-only and mixed line-ending documents keep their original line endings through sorting and
  offset baking instead of being rewritten to LF or leaving stray carriage returns.
- Metadata tags sharing a line (`[ti:x][offset:+500]`) are recognized everywhere now —
  offset resolution, `Apply [offset:] Tag` (which removes only the token, keeping sibling
  tags), hovers, outline symbols and statistics.
- Expanding multi-timestamp lines no longer drops inline bracket content (`[Chorus]` and
  friends): such lines are skipped and reported instead of being silently rewritten.

## [0.1.0] - 2026-11-05

Initial release.

### Added

- `lrc` language with TextMate grammar (timestamps, metadata tags, enhanced word timings,
  inline flagging of malformed brackets), language configuration and file icon.
- Live diagnostics with 12 stable codes: `invalid-timestamp`, `invalid-offset`,
  `unrecognized-token`, `stray-line`, `decreasing-timestamp`, `duplicate-offset`,
  `word-timing-before-cue`, `word-timing-disorder`, `invalid-word-timing`,
  `duplicate-timestamp`, `empty-cue-text`, `empty-tag-value`.
- Hovers: absolute/effective time for timestamps (with delta and instrumental-gap detection)
  and descriptions for metadata tags.
- Commands: sort by timestamp, shift all timestamps, apply `[offset:]` tag into timestamps,
  normalize timestamp precision, strip enhanced word timings, expand multi-timestamp lines,
  show document statistics.
- Code actions: quick fixes attached to diagnostics and source actions
  (sort / strip word timings / apply offset).
- Document symbol provider (tags + cues in the outline) and document formatter.
- Snippets: metadata header, timed line, word-timed line.
- Settings: `lrcToolkit.gapThresholdSeconds`, `lrcToolkit.format.spaceAfterTimestamp`.
- Framework-free core layer with 81 unit tests and a headless adapter smoke test;
  zero runtime dependencies (packaged extension ≈ 23.1 KB).

### Fixed

- Grammar now accepts single-digit seconds (`[01:5]`) and rejects `[key : value]` spacing
  exactly like the analyzer; word timings follow the same rules
  (guarded by a grammar ⇔ parser equivalence test).
- `Sort Lines by Timestamp` reports how many blank/unrecognized lines the sort removed
  instead of dropping them silently.
- `Apply [offset:] Tag` reports leftover `[offset:]` tags when the file contains duplicates.
- Mixed LF/CRLF line endings no longer shift diagnostics and hovers.
