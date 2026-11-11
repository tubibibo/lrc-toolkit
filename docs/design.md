# Design notes

## Goals

1. Make `.lrc` a first-class language in VS Code: highlighting, diagnostics, hovers, outline.
2. Provide deterministic, reversible text transformations (sort / shift / offset / normalize /
   convert) instead of "smart" magic.
3. Keep the extension genuinely lightweight: zero runtime dependencies, one bundled file.
4. Keep the entire feature set testable without an editor runtime.

## Non-goals (for 0.1.0)

- Audio playback / karaoke preview (planned, see README roadmap).
- Encrypted formats (.krc / .yrc) import.
- Reordering or rewriting lyric *content* — the toolkit never invents or deletes text.

## Layered architecture

```
┌──────────────────────────────────────────────────────────────┐
│  src/vscode-host/   (the only layer that imports "vscode")   │
│  extension.ts · diagnostics · hoverProvider · codeActions     │
│  symbols · formatter · commands · documentStore · config      │
└───────────────▲──────────────────────────────▲───────────────┘
                │ consumes public API          │ applies TextEdit[]
┌───────────────┴──────────────────────────────┴───────────────┐
│  src/core/          (pure TypeScript, no vscode import)      │
│  parser → model ← analyzer                                   │
│  services: sort · shift · offset · normalize · convert · stats│
│  hover (structured targets) · commands (pure dispatch)        │
└───────────────▲──────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│  src/util/          (pure helpers: time parsing/formatting)  │
└──────────────────────────────────────────────────────────────┘
```

Rules that make the layering enforceable, not aspirational:

- **`src/core/**` and `src/util/**` must not import `vscode`.** Violations fail ESLint via
  `no-restricted-imports` (see `eslint.config.mjs`) — enforced in CI, not by convention.
- **`src/core/**` and `src/util/**` must not reference the vscode-host adapter layer** —
  `scripts/check-layering.mjs` (wired into `npm run verify` and CI) fails on any occurrence
  of the `vscode-host` path segment, which covers static and dynamic `import(…)` forms alike.
- All cross-layer values are **plain data**: diagnostics, text edits, stats and hover targets
  carry no editor types, so unit tests run in plain Node (vitest) and the adapter maps them to
  `vscode.*` types mechanically.
- The adapter stays thin: no parsing or business logic — it wires events, converts offsets to
  positions (`document.positionAt`) and forwards command ids to `core/commands.ts`.

## Module map

| Path | Responsibility | Depends on |
| --- | --- | --- |
| `src/core/model.ts` | Document model, `TextEdit`, `LrcDiagnostic`, stats types | — |
| `src/util/time.ts` | Timestamp parsing/rendering/rounding primitives | model (types) |
| `src/core/parser.ts` | Raw text → `LrcDocument`; classifies tokens, never judges them | model, util/time |
| `src/core/analyzer.ts` | `LrcDocument` → diagnostics; offset resolution | model, util/time |
| `src/core/hover.ts` | Structured hover targets (timestamp / word timing / tag) | model, analyzer |
| `src/core/services/*` | Deterministic transformations returning `TextEdit[]` (sort / shift / offset / normalize / convert / bilingual / srt / stats) | parser, analyzer, util/time |
| `src/core/commands.ts` | Command registry: `runCommand(id, text, options)` → edits + messages | parser, services |
| `src/vscode-host/*` | Providers, command registration, diagnostics collection, settings | core (index only) |

## Data flows

- **Diagnostics**: `onDidOpen/onDidChange` → `DocumentStore.get` (parse, version-keyed) →
  `core.analyze` → map plain diagnostics to `vscode.Diagnostic` → collection per URI.
- **Commands**: palette/context menu → adapter reads document text → `core.runCommand` →
  `TextEdit[]` → one `WorkspaceEdit` → diagnostics refresh via the change event.
- **Code actions**: `core.analyze` intersected with the requested range for quick fixes;
  document-shape-driven source actions (sort when the timeline is broken or the Refactor menu
  asks for it — see `core/policy.ts`; strip/apply-offset only when the document shape warrants).
- **Formatting**: `core.normalizeSpacing` mapped to `vscode.TextEdit[]`.

## Diagnostic codes

| Code | Severity | Trigger |
| --- | --- | --- |
| `invalid-timestamp` | error | Bracket token looks like a timestamp but is malformed (seconds > 59, 4-digit fraction, garbage) — as a leading token, a stray token, **or buried in lyric text**. A *valid* timestamp buried in lyric text reports the same stable code with a distinct message ("move it to its own line or expand the line") so the wording matches the grammar's neutral highlighting |
| `invalid-offset` | error | `[offset:]` value not an integer (`[offset:abc]`, `[offset:]`) |
| `unrecognized-token` | warning | Leading bracket token is neither stamp nor tag |
| `stray-line` | warning | Line with neither brackets nor timestamps |
| `decreasing-timestamp` | warning | Cross-line or within-line timeline goes backwards |
| `duplicate-offset` | warning | Second valid `[offset:]` tag |
| `word-timing-before-cue` | warning | Word timing earlier than its line's timestamp |
| `word-timing-disorder` | warning | Word timings not ascending |
| `invalid-word-timing` | warning | *Timing-shaped* `<digits:…>` token that fails to parse (`<00:60>`); non-timing brackets like `<2>` or `<b>` are lyric text |
| `duplicate-timestamp` | info | Adjacent cue lines / stamps with equal times (cross-line duplicates are reported **once per document** — bilingual pairings are expected; within-line duplicates report per line) |
| `empty-cue-text` | info | Timestamp with no lyric text |
| `empty-tag-value` | info | Content tags (`ti`, `ar`, `al`, `au`, `length`, `by`) with empty value — including tags sharing a line |
| `suspected-encoding` | info | 3 or more U+FFFD replacement characters in the document — reported **once per document**, anchored on the first occurrence; the message names the built-in *Reopen with Encoding* / *Change File Encoding* commands. One or two characters may be a paste artifact and stay silent |

### Quick fixes

Diagnostics may carry several quick fixes, each rendered as its own CodeAction:

- `decreasing-timestamp` → *sort* (cross-line) or *expand multi-timestamp lines* (within line),
  as command-type fixes;
- `invalid-timestamp` whose seconds exceed 59 (`[01:75.00]`) → **carry** the excess seconds into
  the minutes (→ `[02:15.00]`) or **clamp** them to 59 (→ `[01:59.00]`), as edit-type fixes built
  from the shared parse/format primitives in `util/time.ts`. The carry variant is withheld when
  it would overflow the four-digit minute budget (9999:75 → 10000:15 would be unparseable);
- `word-timing-before-cue` → align the word timing with its line's start timestamp, rendered at
  the word timing's own fraction-digit count.

### Bilingual pairs (`original|translation`)

The community convention for bilingual lyrics — two consecutive cue lines sharing one timestamp,
the **second line being the translation** — is supported in three places:

- sorting keeps each pair together (stable sort on raw timestamps);
- the analyzer emits at most one `duplicate-timestamp` hint per document;
- `Merge Bilingual Lines` merges adjacent same-time pairs into one `original|translation` line
  (timestamp taken verbatim from the first line, the pair's own terminator kept); `Split
  Bilingual Lines` splits lines back apart at the **first unescaped `|`** (a `\|` escape or
  trailing backslash is honoured), both sides inheriting the timestamp verbatim.

The pipe is a community convention, not part of the format: both operations are explicit
commands and never run automatically. Merging refuses (and reports) any pair it would have to
guess about: word timings, stray labels, extra stamps, an empty side, or an unescaped `|`
already present in the original text — the toolkit never deletes or rewrites lyric content
silently.

## Bracket rendering policy

Red (`invalid.illegal`) is reserved for **timing-shaped** tokens that failed their valid rule:

- `[digits:…]` that is not a valid timestamp (e.g. `[01:60]`) — the analyzer reports the same
  spans as `invalid-timestamp`, whether the token leads the line or sits inside lyric text;
  a *valid* timestamp inside lyric text renders as a normal timestamp (the valid rule wins)
  but is still reported with the "move it to its own line" message;
- `<digits:…>` that is not a valid word timing (e.g. `<00:60>`) — reported as
  `invalid-word-timing`.

Everything else bracket-like renders **neutrally** as a section label (`entity.name.section.lrc`):
letter-only labels (`[Chorus]`), tag-shaped annotations (`[foo:bar]`), and non-timing angle
brackets (`<2>`, `I <3 you`). The analyzer stays silent about those — they are lyric content,
and the toolkit never rewrites or deletes it. This is enforced by the grammar ⇔ parser
equivalence tests (`test/unit/grammar.test.ts`).

Known residual: a leading `[01:]` renders red but only warns (`unrecognized-token`) because the
loose "stamp-like" heuristic requires digits after the colon; the same token inside lyric text
stays silent. Tolerated — both indicate the same typo to the user.

## Hover semantics

Timestamp hovers show absolute time, effective time (offset-adjusted), the delta to the
**previous stamp** and the gap to the **next stamp**, both taken in **document-wide stamp
order**: on a multi-timestamp line, hovering the second stamp refers to the first stamp of the
same line, not to the previous line's first stamp. Word-timing hovers are relative to their
line's first stamp. Tag hovers resolve the exact token under the cursor, including tags that
share a line.

## Sorting semantics

Sorting is one whole-document replacement: tags stay on top, cues are stable-sorted by raw
timestamp, every emitted line keeps its own terminator, and trailing blank lines survive. By
default unrecognized lines (standalone section labels) and interior blank lines are dropped and
counted in the result message. With `keepUnrecognized` (setting
`lrcToolkit.sort.keepSectionLabels`), unrecognized lines are kept with a strict attachment rule:
**each label sticks to the first cue line that follows it** — blanks and tags in between are
skipped, several labels ride above the same cue in original order, and a label with no
following cue is still dropped and counted. The dropped-lines message keeps counting exactly
what was removed; labels that travel with a cue are not drops.

## SRT / VTT conversion semantics

`services/srt.ts` is a pure text ⇄ text conversion with a deliberately narrow fidelity scope:
**the timeline plus the plain text** — SRT and LRC have no shared concept of tags, word timings
or styling, so everything else is dropped and reported, never half-converted.

- **Import** (`parseSrt` → `srtCuesToLrc`): blank-line separated blocks, optional numeric index
  line, `HH:MM:SS,mmm --> HH:MM:SS,mmm` timings with WebVTT's `.` millisecond separator and
  optional hours accepted (`MM:SS.mmm`), BOM and CRLF/CR tolerated. A block's multi-line text is
  joined into one lyric line; `<i>`-family inline markup is stripped; STYLE / NOTE blocks,
  text-less cues and unparseable blocks are dropped and counted in `droppedBlocks` (the same
  reporting convention as the sort command). The `WEBVTT` signature header is dropped without
  counting — a plain `.vtt` file must not report a spurious drop. Cue timestamps are rounded
  onto the centisecond grid LRC uses.
- **Export** (`lrcToSrtCues` → `formatSrt`): one SRT block per cue line, using the line's
  **first** timestamp (the documented first-stamp-only rule) rendered as an *effective* time —
  `[offset:]` is baked in because an SRT has no offset mechanism (clamped at 00:00) — with
  enhanced word timings stripped from the text. `formatSrt` recomputes end times from the next
  line's start minus 1 ms (final block: start + 2 s), so exported ends are never stale; equal
  starts (bilingual pairs) clamp to a zero-length block instead of reversing. The adapter
  never overwrites an existing file silently (modal confirm).
- **Round trip**: `parse → format → parse` is stable — starts and texts are preserved exactly,
  ends converge to the recomputed values on the first format.

## Statistics semantics

- Each cue line contributes only its **first stamp** to the timeline (duration, gaps,
  duplicates). Later stamps on the same line never start a new beat; within-line duplicate
  stamps are the analyzer's business, reported per line.
- `duplicateTimestampCount` counts adjacent same-start pairs **for the same reason** the
  analyzer's once-per-document `duplicate-timestamp` hint exists — the bilingual convention —
  but the two are not the same classification: the analyzer reports every cross-line duplicate
  once per document regardless of text, while the statistic treats a pair whose two lines carry
  **different** trimmed texts as expected (original + translation) and counts only pairs whose
  texts are identical. The classification lives in `services/stats.ts` and cross-references the
  analyzer's duplicate branch — keep the two comments in sync when changing either.

## Offset semantics (ADR 0004)

`display time = timestamp − offset` with a **positive** offset making lyrics appear **earlier**
(per the [LRC format description](https://en.wikipedia.org/wiki/LRC_(file_format))). Two direct
consequences:

1. A uniform offset never changes relative order, so sorting uses raw timestamps.
2. *Apply offset* shifts raw stamps by `−offset` and deletes the tag — display timing is
   preserved exactly.

For players that interpret the sign the other way, *Invert [offset:] Sign* flips the first
valid tag (`+500` → `-500`) without touching any timestamp; the rewritten value always carries
an explicit sign, and duplicated tags are left untouched (players honour the first anyway).

## Design decisions index

- [ADR 0001 — Record architecture decisions](adr/0001-record-architecture-decisions.md)
- [ADR 0002 — Framework-free core with a thin adapter](adr/0002-framework-free-core.md)
- [ADR 0003 — Zero runtime dependencies, esbuild bundle](adr/0003-zero-runtime-dependencies.md)
- [ADR 0004 — `[offset:]` sign convention](adr/0004-offset-sign-convention.md)
