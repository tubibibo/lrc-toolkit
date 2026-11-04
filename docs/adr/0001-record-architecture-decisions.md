# ADR 0001 — Record architecture decisions

*Status: accepted · Date: 2026-11-05*

## Context

Engineering choices (layering, dependency policy, format semantics) outlive the code that
implements them. Without a written record, later contributors can only guess whether an
unusual structure is deliberate.

## Decision

We record architecture decisions as lightweight Architecture Decision Records
(Michael Nygard's format) in `docs/adr/`, numbered sequentially and never edited after
acceptance — superseding decisions get a new ADR that references the old one.

## Consequences

- Every non-obvious choice in this repository should be traceable to an ADR.
- ADRs are immutable history; corrections happen in new ADRs.
- The index of decisions lives in [docs/design.md](../design.md).
