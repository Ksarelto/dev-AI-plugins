---
name: documentation
description: When documentation is required vs. skipped — READMEs, ADRs, and docstrings — and how to sweep .md/.txt/.mdc/.yaml/.json files for stale values after a feature or approach change. Use when adding/updating a README, deciding whether a decision needs an ADR, deciding whether a function needs a docstring, or finishing a change whose details shifted mid-development. Applies to any language.
---

# Documentation

## When to use

- Starting a new project/service and deciding what the README needs to cover.
- Making a non-obvious, hard-to-reverse decision and deciding whether it warrants an ADR.
- Writing or reviewing docstrings and unsure whether one is required.
- Changing behavior that existing docs describe.

## Default: code should explain itself

Per the `clean-code` skill, well-named functions and types don't need a comment restating what they do. Documentation is for the things code *can't* express: why a decision was made, what a module is for at a glance, or a decision with tradeoffs future readers will want to revisit.

## README

Required at the root of any project/service a new contributor would need to run. Must cover: what it does (one paragraph), how to run it locally, how to run tests, and where to find deeper docs (ADRs, API docs). Skip it for a throwaway script or a subdirectory that's fully described by the parent README.

## Architecture Decision Records (ADRs)

Write one when a decision is non-obvious, hard to reverse, or someone will reasonably ask "why did we do it this way" in six months — choice of database, a new service boundary, dropping a library, an unconventional pattern. Don't write one for a decision with only one reasonable option, or one easily reversed in a single PR.

Minimal format: title, status (proposed/accepted/superseded), context (the problem), decision, consequences (what this makes harder/easier). One page is enough.

## Keeping docs current

A README/ADR/docstring describing behavior that changed is worse than missing — it actively misleads. When a change makes an existing doc wrong, updating it is part of the change, not a follow-up task.

## Consistency sweep after a feature or approach change

When a feature's implementation detail changes mid-development (a renamed field, a different default, a swapped dependency, a changed endpoint/path, an abandoned approach in favor of another), stale values can be left behind in documentation that isn't code and so isn't caught by tests or type checks.

Before calling the change done:

1. Identify what changed: names, defaults, paths, ports, config keys, flags, commands, version numbers, or the approach/architecture itself.
2. Search every doc-like file for the old values — not just the README. Check `.md`, `.txt`, `.mdc`, `.yaml`/`.yml`, and `.json` files (e.g. `grep -rn` for the old value across these extensions), including nested docs (`docs/`), rule files (`rules/*.mdc`), examples, and config/manifest files that double as documentation (`plugin.json`, `marketplace.json`, schemas).
3. For each hit, confirm it's actually stale (not a historical reference, changelog entry, or an intentionally-different example) before editing.
4. Update all hits to the same, current value — pick one canonical value/term and use it everywhere; don't leave two docs describing the old and new approach side by side.
5. If the old approach is described at length (rationale, diagrams, comparisons) rather than just named, update the reasoning too, not just the value — a doc that flips the value but keeps the old justification is still misleading.
