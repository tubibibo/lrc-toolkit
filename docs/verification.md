# Verification report

*Environment: Windows 11 (10.0.26200), Node v24.14.0, npm 11.9.0, TypeScript 5.7, ESLint 9.
Verification date: 2026-11-05. Reproduce with `npm ci && npm run verify`.*

## Automated gate — `npm run verify`

| Step | Command | Result |
| --- | --- | --- |
| Strict typecheck | `tsc --noEmit` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`) | ✅ 0 errors |
| Lint | `eslint .` (includes the *no `vscode` in `src/core/**`* guardrail) | ✅ 0 problems |
| Format check | `prettier --check .` | ✅ clean |
| Unit tests | `vitest run` | ✅ **81 passed** (5 files: time / parser / analyzer / services+commands / grammar) |
| Bundle | `node esbuild.mjs` | ✅ `dist/extension.js` ≈ 42.3 KB (43,341 B) bundle + sourcemap |
| Adapter smoke test | `node scripts/smoke-adapter.mjs` | ✅ activates the real bundle against a stubbed `vscode` module; asserts 7 commands + 4 providers + diagnostic collection + output channel register |
| Package | `vsce package --no-dependencies` | ✅ `lrc-toolkit-0.1.0.vsix` — 12 files, **23,635 bytes ≈ 23.1 KB** |
| JSON assets | `python -I -c "json.load(...)"` over grammar/snippets/language-config/launch/tasks | ✅ all parse |

Exact bytes vary by a few dozen when `README.md`/`CHANGELOG.md` (which are packaged) change;
`≈ 23.1 KB` is the stable documented figure (1024-based KB, as printed by vsce).

## What each layer of verification proves

1. **Unit tests (vitest)** — the framework-free core: parser structure & spans, all 12
   diagnostic codes, every service transformation (sort stability, shift clamping, offset
   baking direction, precision rounding, spacing normalization, word-timing stripping,
   multi-stamp expansion, stats & gap detection), command dispatch. Fixtures:
   `test/fixtures/sample.lrc` (clean) and `test/fixtures/messy.lrc` (deliberately broken).
2. **Adapter smoke test** — the *actual esbuild bundle* (`dist/extension.js`) is loaded in a
   Node child process with a stubbed `vscode` module and `activate()` is executed; the test
   fails unless every command id from `package.json` and every provider registration is
   present. This proves the shipped artifact wires up, not just that TypeScript compiles.
3. **Packaging** — `vsce` validates the manifest (engines ↔ `@types/vscode` lockstep, icon,
   contributes section, `.vscodeignore` completeness).

## Manual verification steps (requires a UI)

```
F5 in this repository  →  Extension Development Host opens
open a .lrc file       →  highlighting + Problems panel diagnostics
hover a timestamp      →  absolute/effective time, Δ, instrumental gap
Ctrl+Shift+P           →  run "LRC: Sort Lines by Timestamp", "LRC: Show Document Statistics", …
```

## Real-machine verification (P0-1)

Beyond the stubbed smoke test, the extension was verified against the **installed VS Code
1.144.1** (`E:\Microsoft VS Code`):

1. `code --install-extension lrc-toolkit-0.1.0.vsix --force` → installed as `awwdd.lrc-toolkit`,
   confirmed via `code --list-extensions`.
2. A headless integration harness (kept outside the repository, `@vscode/test-electron` pointed
   at the installed `Code.exe`, extension loaded via `--extensionDevelopmentPath`) opened
   `test/fixtures/messy.lrc` and `test/fixtures/sample.lrc` inside the real extension host and
   asserted: 8/8 programmatic checks passed —

| # | Acceptance item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Syntax colors | ⚠️ visual-only | Mechanism verified: grammar ⇔ parser equivalence tests (`test/unit/grammar.test.ts`) + grammar accepted by the real host; colors need human eyeballing |
| 2 | Problems panel diagnostics | ✅ pass | 7 codes present (`invalid-timestamp`, `unrecognized-token`, `stray-line`, `decreasing-timestamp`, `word-timing-disorder`, `empty-cue-text`, …), source `LRC Toolkit`, ranges valid |
| 3 | Timestamp hover | ✅ pass | `00:12.00 (12.00 s)`, `Effective with [offset:]: 00:11.50`, `Gap to next line`; Δ-from-previous verified on `sample.lrc` |
| 4 | Tag hover | ✅ pass | `ti:` → "Title of the song"; `offset:` → global-shift explanation |
| 5 | Outline | ✅ pass | 9 symbols: 3 tags (`ti:`/`ar:`/`offset:`) + 6 cues with clock labels |
| 6 | Quick Fix on `decreasing-timestamp` | ✅ pass | `Sort all lines by timestamp` offered (alongside editor built-ins) |
| 7 | Commands | ✅ pass | All 7 `lrcToolkit.*` commands registered in the real host; context-menu entries are static `contributes`; input validation covered by unit tests |
| 8 | Format Document | ✅ pass | Applying the returned edits turns `[00:01.00]   spaced  ` + `[ti:x]   ` into `[00:01.00]spaced` / `[ti:x]`; a probe document confirms the leading-space removal comes from this extension's formatter |
| 9 | Explorer icon | ⚠️ visual-only | `media/lrc-file-icon.svg` registered via `contributes.languages[].icon` and packaged; rendering needs human eyeballing |

3. `code test/fixtures/messy.lrc` opens the file in the GUI for the manual pass on items 1 and 9
   (if VS Code was already running, reload the window to pick up the freshly installed build).

## Known limitations

- The real-host integration harness lives outside the repository (temp directory) and is not
  part of CI: it depends on a locally installed VS Code and exists to verify the shipped
  artifact on the author's machine. CI relies on unit tests + the stubbed smoke test, which do
  not require an editor download.
- Syntax colors and the Explorer file icon are visual renderings that cannot be asserted
  programmatically; their mechanisms (grammar equivalence tests, `contributes` registration)
  are verified, and a manual pass completes the picture.
- The `[offset:]` sign convention varies across players — see
  [ADR 0004](adr/0004-offset-sign-convention.md) for the decision and the safe alternative.
