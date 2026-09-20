---
name: architecture-audit
description: Audit a React FSD app for layer, slice, and segment consistency — import direction, public APIs, query-key registry, state ownership, auth, widgets, entities — then report violations and fix them after confirmation. Use when checking whether the current implementation matches the architecture, verifying FSD boundaries, or asking if features, entities, and widgets are structured correctly.
argument-hint: "[src-path]"
disable-model-invocation: false
context: fork
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write]
---

# Architecture Audit

Check the current tree against the FSD layer/slice/segment model. Report first. Edit only after confirmation (or when the user already asked to fix).

Not this skill: scaffolding (`react-feature`); a branch/PR standards review (`code-review`).

## Procedure

1. **Scope.** Default `src/`. If the user names a slice or path, audit that path **and** its importers (a feature is inconsistent if a page deep-imports it).
2. **Inventory.** Glob the six layers; list slices and their segments. Note layout drift: leftover `domain/`, `application/`, `processes/`, or essence folders (`components/`, `types/`, `utils/`, `helpers/`) at slice level.
3. **Mechanical first.** If ESLint, dependency-cruiser, or boundary scripts exist, run them and keep every hit. Missing enforcement is a finding (`references/enforcement.md`) — do not skip silently.
4. **Walk topics.** Load only the matching `references/*.md` (skip table below). Do not invent rules. Prefer glob/grep; read a file when the check is semantic.
5. **Report, then stop.** Do not edit in this step.
6. **Fix** only if the user already asked, or after they confirm which findings. Fix hard violations; leave judgment calls unless selected. Re-run mechanical checks on touched files. Do not generate a full ESLint/depcruise config unless that finding was confirmed.

## Skip when absent

| Topic | Skip if |
|-------|---------|
| `entities-vs-features` | no `entities/` |
| `cross-feature-communication` | fewer than two features **and** no widgets |
| `api-layer-and-query-keys` | no `shared/api/` and no slice `api/` |
| `routing-and-boundaries` | no `app/router/` and no `pages/` |
| `authentication` | no `shared/lib/auth/`, no session/login, and no `features/auth/` |
| `realtime-sse` | no `shared/api/realtime/`, no `EventSource`, no SSE hooks |
| `i18n` | no `locales/`, no i18n lib, no `useTranslation` |
| `styling` / `component-structure` | no `ui/` under scope |
| `testing-strategy` | no `*.test.*` / `tests/` |

All other topics always run (enforcement and review-checklist included).

## Topics

Load in this order. Each file states what to evaluate and how.

| # | File | When |
|---|------|------|
| 1 | [layers-and-segments.md](references/layers-and-segments.md) | always |
| 2 | [the-six-layers.md](references/the-six-layers.md) | always |
| 3 | [public-api-and-slices.md](references/public-api-and-slices.md) | slices exist |
| 4 | [entities-vs-features.md](references/entities-vs-features.md) | `entities/` |
| 5 | [cross-feature-communication.md](references/cross-feature-communication.md) | 2+ features or any widget |
| 6 | [cross-slice-workflows.md](references/cross-slice-workflows.md) | always |
| 7 | [state-ownership.md](references/state-ownership.md) | always |
| 8 | [api-layer-and-query-keys.md](references/api-layer-and-query-keys.md) | api present |
| 9 | [routing-and-boundaries.md](references/routing-and-boundaries.md) | router/pages |
| 10 | [cross-cutting-concerns.md](references/cross-cutting-concerns.md) | always |
| 11 | [authentication.md](references/authentication.md) | auth present |
| 12 | [realtime-sse.md](references/realtime-sse.md) | SSE present |
| 13 | [i18n.md](references/i18n.md) | i18n present |
| 14 | [styling.md](references/styling.md) | `ui/` |
| 15 | [component-structure.md](references/component-structure.md) | `ui/` |
| 16 | [testing-strategy.md](references/testing-strategy.md) | tests present |
| 17 | [enforcement.md](references/enforcement.md) | always |
| 18 | [lifecycle-and-scaling.md](references/lifecycle-and-scaling.md) | always |
| 19 | [review-checklist.md](references/review-checklist.md) | last — residual smells only |

Load-bearing invariants (must appear as hard if broken):

- Import direction: `app → pages → widgets → features → entities → shared`; no cycles
- No feature↔feature, widget↔widget, or feature→widget
- `ui/` → `hooks/` → `api/`; `models/` never imports any `api/`
- HTTP only via `@/shared/api/base`; query keys only from `@/shared/api/query-keys/`

## Report

```
## Architecture audit (<scope>)

### Hard violations
- [<topic>] `path:line` — invariant

### Judgment calls
- [<topic>] `path` — smell (review)

### Missing / skipped
- <topic>: reason

### Summary
N hard, M judgment, K skipped
```

Do not merge axes into one score. After the report, ask which findings to fix unless the user already said to fix them.
