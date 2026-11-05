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
| `src/core/services/*` | Deterministic transformations returning `TextEdit[]` | parser, analyzer, util/time |
| `src/core/commands.ts` | Command registry: `runCommand(id, text, options)` → edits + messages | parser, services |
| `src/vscode-host/*` | Providers, command registration, diagnostics collection, settings | core (index only) |

## Data flows

- **Diagnostics**: `onDidOpen/onDidChange` → `DocumentStore.get` (parse, version-keyed) →
  `core.analyze` → map plain diagnostics to `vscode.Diagnostic` → collection per URI.
- **Commands**: palette/context menu → adapter reads document text → `core.runCommand` →
  `TextEdit[]` → one `WorkspaceEdit` → diagnostics refresh via the change event.
- **Code actions**: `core.analyze` intersected with the requested range for quick fixes;
  document-shape-driven source actions (sort always; strip/apply-offset only when relevant).
- **Formatting**: `core.normalizeSpacing` mapped to `vscode.TextEdit[]`.

## Diagnostic codes

| Code | Severity | Trigger |
| --- | --- | --- |
| `invalid-timestamp` | error | Bracket token looks like a timestamp but is malformed (seconds > 59, 4-digit fraction, garbage) — as a leading token, a stray token, **or buried in lyric text** |
| `invalid-offset` | error | `[offset:]` value not an integer (`[offset:abc]`, `[offset:]`) |
| `unrecognized-token` | warning | Leading bracket token is neither stamp nor tag |
| `stray-line` | warning | Line with neither brackets nor timestamps |
| `decreasing-timestamp` | warning | Cross-line or within-line timeline goes backwards |
| `duplicate-offset` | warning | Second valid `[offset:]` tag |
| `word-timing-before-cue` | warning | Word timing earlier than its line's timestamp |
| `word-timing-disorder` | warning | Word timings not ascending |
| `invalid-word-timing` | warning | *Timing-shaped* `<digits:…>` token that fails to parse (`<00:60>`); non-timing brackets like `<2>` or `<b>` are lyric text |
| `duplicate-timestamp` | info | Adjacent cue lines/ stamps with equal times (reported once per group) |
| `empty-cue-text` | info | Timestamp with no lyric text |
| `empty-tag-value` | info | Content tags (`ti`, `ar`, `al`, `au`, `length`, `by`) with empty value — including tags sharing a line |

## Bracket rendering policy

Red (`invalid.illegal`) is reserved for **timing-shaped** tokens that failed their valid rule:

- `[digits:…]` that is not a valid timestamp (e.g. `[01:60]`) — the analyzer reports the same
  spans as `invalid-timestamp`, whether the token leads the line or sits inside lyric text;
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

## Offset semantics (ADR 0004)

`display time = timestamp − offset` with a **positive** offset making lyrics appear **earlier**
(per the [LRC format description](https://en.wikipedia.org/wiki/LRC_(file_format))). Two direct
consequences:

1. A uniform offset never changes relative order, so sorting uses raw timestamps.
2. *Apply offset* shifts raw stamps by `−offset` and deletes the tag — display timing is
   preserved exactly.

## Design decisions index

- [ADR 0001 — Record architecture decisions](adr/0001-record-architecture-decisions.md)
- [ADR 0002 — Framework-free core with a thin adapter](adr/0002-framework-free-core.md)
- [ADR 0003 — Zero runtime dependencies, esbuild bundle](adr/0003-zero-runtime-dependencies.md)
- [ADR 0004 — `[offset:]` sign convention](adr/0004-offset-sign-convention.md)
