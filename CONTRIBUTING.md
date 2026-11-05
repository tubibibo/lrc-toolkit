# Contributing to LRC Toolkit

Thanks for considering a contribution! The project keeps a strict
framework-free core so the whole feature set stays testable without an
editor runtime — please read the rules below before opening a PR.

## Development setup

```bash
git clone https://github.com/tubibibo/lrc-toolkit.git
cd lrc-toolkit
npm ci          # lockfile-tracked install
npm run verify  # typecheck → lint → format → tests → bundle → smoke → package
```

Useful scripts:

| Script                    | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `npm test`                | Unit tests with V8 coverage (thresholds 90/80/90/90). |
| `npm run lint`            | ESLint (includes the *no vscode in core* guardrail).  |
| `npm run format:check`    | Prettier check.                                       |
| `npm run compile`         | esbuild bundle to `dist/`.                            |
| `npm run smoke`           | Headless adapter smoke test over the real bundle.     |
| `npm run package`         | `vsce package --no-dependencies`.                     |
| `npm run verify`          | Everything above, in order — the full gate.           |

Debugging in the editor: press **F5** ("Run LRC Toolkit Extension").

## Architecture rules (enforced by CI)

1. **The core stays framework-free.** `src/core/**` must never import
   `vscode`; ESLint fails the build if it does
   (see [docs/adr/0002-framework-free-core.md](docs/adr/0002-framework-free-core.md)).
   All document logic lives there as pure functions over plain data.
2. **The adapter stays thin.** `src/vscode-host/**` translates between the
   editor and the core; it must not contain parsing or business logic.
3. **Zero runtime dependencies.** New npm packages are allowed only as
   devDependencies (see ADR-0003).
4. **Behavior changes need tests.** Parser, analyzer and service changes
   belong in `test/unit/*.test.ts`; grammar ⇔ parser consistency is guarded
   by `test/unit/grammar.test.ts`.
5. **Architecturally significant decisions need an ADR** in `docs/adr/`
   (next free number, never edit an accepted ADR).

## Branches

- Feature branches off `main`; PRs target `main`.
- `main` stays green: CI runs the full gate on Node 20 and 22.

## Commits and PRs

- Use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Keep PRs focused; the PR template includes the checklist CI cares about.
- User-visible behavior changes are recorded under `[Unreleased]` in
  `CHANGELOG.md` in the same PR.

## Reporting issues

Use the issue templates and attach a minimal `.lrc` snippet — most
diagnostics and hovers can be reproduced from the file content alone.
