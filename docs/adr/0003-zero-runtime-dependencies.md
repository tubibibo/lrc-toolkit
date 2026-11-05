# ADR 0003 — Zero runtime dependencies, esbuild bundle

*Status: accepted · Date: 2026-11-05*

## Context

LRC is a small text format. A toolkit for it should not carry a runtime dependency graph:
extensions that ship `node_modules` (or declare runtime dependencies for `vsce` to resolve)
grow to megabytes and slow activation. At the same time, hand-rolled multi-file CommonJS output
from `tsc` is fine but leaves the package with dozens of files.

## Decision

- The extension declares **zero runtime dependencies**; everything (parsers, services, command
  layer) is implemented in-repo.
- `esbuild` bundles `src/vscode-host/extension.ts` into a single `dist/extension.js`
  (CommonJS, `platform: node`, `target: node18`, external: `vscode`).
- Packaging uses `vsce package --no-dependencies`, so the artifact is exactly what we reviewed.
- Development-time tooling (TypeScript, ESLint, Prettier, Vitest, vsce) lives in
  `devDependencies` only.

## Consequences

- The packaged extension is ≈ 25.5 KB (12 files) and activates with a single file read.
- No supply-chain surface at runtime; `npm audit` only gates development tooling.
- Bumping `@types/vscode` must stay in lockstep with `engines.vscode` (packaging validation
  catches drift).
