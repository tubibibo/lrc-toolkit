# Verification report

*Environment: Windows 11 (10.0.26200), Node v24.14.0, npm 11.9.0, TypeScript 5.7, ESLint 9.
Verification date: 2026-11-05. Reproduce with `npm ci && npm run verify`.*

## Automated gate — `npm run verify`

| Step | Command | Result |
| --- | --- | --- |
| Strict typecheck | `tsc --noEmit` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`) | ✅ 0 errors |
| Lint | `eslint .` (includes the *no `vscode` in `src/core/**`* guardrail) | ✅ 0 problems |
| Format check | `prettier --check .` | ✅ clean |
| Unit tests | `vitest run` | ✅ **74 passed** (4 files: time / parser / analyzer / services+commands) |
| Bundle | `node esbuild.mjs` | ✅ `dist/extension.js` ≈ 41 KB bundle + sourcemap |
| Adapter smoke test | `node scripts/smoke-adapter.mjs` | ✅ activates the real bundle against a stubbed `vscode` module; asserts 7 commands + 4 providers + diagnostic collection + output channel register |
| Package | `vsce package --no-dependencies` | ✅ `lrc-toolkit-0.1.0.vsix` — 12 files, ≈ 19 KB |
| JSON assets | `python -I -c "json.load(...)"` over grammar/snippets/language-config/launch/tasks | ✅ all parse |

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

## Known limitations

- No Electron-based integration test (`@vscode/test-electron`): the headless smoke test plus
  unit coverage was chosen instead to keep CI dependency-free; the manual F5 pass above covers
  the visual surface (highlighting, hovers, menus) that stubs cannot.
- The `[offset:]` sign convention varies across players — see
  [ADR 0004](adr/0004-offset-sign-convention.md) for the decision and the safe alternative.
