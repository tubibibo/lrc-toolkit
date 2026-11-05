# ADR 0002 — Framework-free core with a thin VS Code adapter

*Status: accepted · Date: 2026-11-05*

## Context

VS Code extensions are usually written as one layer: provider code parses, computes and renders
in the same functions, which makes the logic testable only through an extension-host integration
harness (a full editor download, slow CI, brittle fixtures).

This extension is small, but its value is almost entirely in *logic*: parsing LRC text, judging
timelines and computing deterministic text edits.

## Decision

Split the codebase into two layers with a hard boundary:

- `src/core/**` + `src/util/**` — pure TypeScript. No `vscode` import. Diagnostics, hover
  targets and text edits are **plain data** (absolute character offsets).
- `src/vscode-host/**` — the only layer that imports `vscode`. It parses nothing and decides
  nothing; it converts between `vscode.*` types and plain data and registers providers.

The boundary is **enforced by ESLint** (`no-restricted-imports` rejecting `vscode` inside
`src/core/**`/`src/util/**`) and runs in CI — the rule is a guardrail, not documentation.

## Consequences

- The whole feature set is unit-testable in plain Node (81 vitest tests, no editor download).
- A future port to another host (Neovim via LSP, a web editor) reuses `src/core` as-is.
- The adapter layer has little logic of its own, so it is covered by a headless smoke test of
  the real bundle (`scripts/smoke-adapter.mjs`) instead of Electron integration tests.
- Mapping offsets to `Position`s is the adapter's job; `positionAt` conversions must happen
  against the pre-edit document, which matches how `WorkspaceEdit` applies ranges.
