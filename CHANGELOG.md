# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Bilingual tools following the community `original|translation` convention: `Merge Bilingual
  Lines` turns two adjacent cue lines sharing one timestamp into a single line (timestamp from
  the first line, second line treated as the translation), and `Split Bilingual Lines` splits
  merged lines back apart at the first unescaped `|` with both sides inheriting the timestamp.
  The pipe is a convention, not a format feature, so both operations are explicit commands —
  nothing runs automatically, and pairs the merge would have to guess about are reported as
  skipped, never rewritten.
- `Invert [offset:] Sign` flips the sign of the first valid `[offset:]` tag (e.g. `+500` →
  `-500`) without touching any timestamp — for players that interpret the offset direction the
  other way round (see ADR 0004).
- New `suspected-encoding` info diagnostic: three or more U+FFFD replacement characters suggest
  the file was read in the wrong encoding; one hint per document, anchored on the first
  occurrence, pointing at the built-in "Reopen with Encoding" / "Change File Encoding"
  commands. This extends the stable 12-code diagnostic promise of 0.1.0 to 13 codes.
- Quick fixes: a timestamp whose seconds exceed 59 (`[01:75.00]`) now offers to carry the
  excess seconds into the minutes (→ `[02:15.00]`) or to clamp them to 59 (→ `[01:59.00]`),
  and a word timing that starts before its line's cue offers to align with the line's start
  timestamp.
- New setting `lrcToolkit.sort.keepSectionLabels` (default `false` = previous behavior): when
  sorting, keep standalone section labels instead of dropping them — each label travels with
  the first cue line that follows it and is re-sorted together with that cue.

### Fixed

- Document statistics no longer count the bilingual pairing convention as duplicate timestamps:
  adjacent same-start pairs with different texts are expected (matching the analyzer's
  once-per-document hint), and only pairs with identical texts still count as true duplicates.
  Statistics also document that each cue line contributes only its first timestamp to the
  timeline.

## [0.1.2] - 2026-11-08

### Fixed

- Cross-line duplicate timestamps now produce at most one informational hint per document,
  with a message recognizing the common bilingual pairing convention. Previously every
  bilingual pair added its own entry to the Problems panel even though the timeline was
  correct. Within-line duplicates still report per line, and a genuine timeline regression
  still raises `decreasing-timestamp` at every occurrence.

### Changed

- The README now states that the bilingual convention — two consecutive lines sharing one
  timestamp — is supported and that sorting keeps each pair together.

## [0.1.1] - 2026-11-07

### Fixed

- Commands now check whether their edits actually landed: on a read-only
  (or externally changed) document `applyEdit` fails silently, and the
  toolkit used to still report "Sorted N cue line(s)". A failed application
  now shows a warning instead of a success message.
- `Shift All Timestamps`, `Apply [offset:] Tag` and `Normalize Timestamp Precision` now include
  enhanced (word-level) timings, so commands no longer leave word timings behind the new cue
  positions.
- Angle brackets that are not timing-shaped (`第<2>段`, `a <b> c`, `I <3 you`) are kept as lyric
  text instead of being flagged as malformed timings and stripped by `Strip Word Timings`;
  only `<digits:…>` tokens are treated as timing attempts.
- CR-only and mixed line-ending documents keep their original line endings through sorting and
  offset baking instead of being rewritten to LF or leaving stray carriage returns. Sorting now
  preserves each line's own terminator (a mixed document is no longer normalized to the first
  line's ending), and line expansion inserts breaks in the source line's ending.
- Metadata tags sharing a line (`[ti:x][offset:+500]`) are recognized everywhere now —
  offset resolution, `Apply [offset:] Tag` (which removes only the token, keeping sibling
  tags), hovers, outline symbols and statistics.
- Expanding multi-timestamp lines no longer drops inline bracket content (`[Chorus]` and
  friends): such lines are skipped and reported instead of being silently rewritten.
- Statistics report a zero duration for single-cue documents instead of "—".
- Timestamps accept minutes up to four digits across the parser, word timings and the grammar,
  so shifting a long file past 999 minutes does not produce output the parser would reject.
- Formatting trims trailing whitespace on whitespace-only lines as well, matching the
  documented "no trailing whitespace on any line" behavior.
- Malformed timestamps buried inside lyric text (`hello [01:60] world`) now get diagnostics,
  and the grammar reserves red for timing-shaped brackets only: section labels like
  `[Chorus]` render neutrally instead of red.

### Changed

- The package lockfile points at `registry.npmjs.org` instead of a regional
  mirror, restoring reproducible installs and the npm audit endpoint. The
  dependency tree and integrity hashes are unchanged.
- The lightbulb only offers "Sort all lines by timestamp" when the timeline is actually broken
  (or when the Refactor menu explicitly asks for it).
- Toolkit commands are hidden from the command palette for non-LRC files
  (`resourceLangId == lrc`).
- Document statistics show a one-line summary in the message toast; the full report stays in
  the `LRC Toolkit` output channel.
- Timestamp hovers on multi-timestamp lines now measure the delta and gap against the
  adjacent stamp in document order (same line first), instead of always using the previous
  line's first stamp.

### Changed (tooling)

- The supported Node floor is now `>=20` everywhere it is stated: `engines.node`, the esbuild
  bundle target, a new `.nvmrc`, and the CI matrix (20/22). Previously `engines.node` said
  `>=18` while nothing tested or type-checked Node 18.
- `npm test` runs with V8 coverage and enforces thresholds (90/80/90/90) on the framework-free
  core; CI verifies on Node 20 and 22.
- Shifting by 0 ms (or any shift that leaves every timestamp unchanged) no longer emits edits
  and reports "Nothing to shift" instead of dirtying the document; non-canonical stamps are
  still canonicalized by the same command.

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
