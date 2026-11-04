# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Framework-free core layer with 74 unit tests and a headless adapter smoke test;
  zero runtime dependencies (packaged extension ≈ 19 KB).
