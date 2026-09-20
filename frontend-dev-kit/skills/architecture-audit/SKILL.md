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

**REPORT_ONLY.** If the prompt contains `REPORT_ONLY`, run steps 1–5 and **stop**. Skip step 6.
Do not edit. Do not ask which findings to fix. Return the report markdown only. Feature-dev-kit
Stations 1.5 and 9.5 always pass this flag.

Not this skill: scaffolding (`react-feature`); a branch/PR standards review (`code-review`).

## Procedure

1. **Scope.** Default `src/`. If the user names a slice or path, audit that path **and** its importers (a feature is inconsistent if a page deep-imports it).
2. **Inventory.** Glob the six layers; list slices and their segments. Note layout drift: leftover `domain/`, `application/`, `processes/`, `state/`, or essence folders (`components/`, `types/`, `utils/`, `helpers/`) at slice level.
3. **Mechanical first.** If ESLint, dependency-cruiser, or boundary scripts exist, run them and keep every hit. Missing enforcement is a finding (`references/enforcement.md`) — do not skip silently.
4. **Walk topics.** Load only the matching `references/*.md` (skip table below). Do not invent rules. Prefer glob/grep; read a file when the check is semantic.
5. **Report, then stop.** Do not edit in this step.
6. **Fix** only if the user already asked, or after they confirm which findings. **Skip this step entirely when the prompt contains `REPORT_ONLY`.** Fix hard violations; leave judgment calls unless selected. Re-run mechanical checks on touched files. Do not generate a full ESLint/depcruise config unless that finding was confirmed.

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
| `testing-strategy` | no `*.test.*` / `tests/` / `e2e/` |
| `adoption` | no leftover hexagonal folders **and** no mixed legacy tree beside `src/features/` |

All other topics always run (enforcement, troubleshooting, and review-checklist included).

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
| 19 | [troubleshooting.md](references/troubleshooting.md) | residual bottlenecks |
| 20 | [review-checklist.md](references/review-checklist.md) | last — leftover smells only |
| 21 | [adoption.md](references/adoption.md) | mixed/legacy tree |

Load-bearing invariants (must appear as hard if broken):

- Import direction: `app → pages → widgets → features → entities → shared`; no cycles
- One public `index.ts` per slice; no deep imports from outside
- No feature↔feature, widget↔widget, or feature→widget
- `ui/` → `hooks/` → `models/`; `hooks/` ↘ `api/` → `models/`; `models/` never imports any `api/`; `ui/` never imports `api/`
- Widgets: no `models/` (plural) and no `api/`
- HTTP only via `@/shared/api/base`; query keys only from `@/shared/api/query-keys/`

Do not invent ports, domain events, `defineEvent`, or a `features/auth/` slice — those are the previous architecture.

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

Do not merge axes into one score. After the report, ask which findings to fix unless the user already said to fix them, **or the prompt contains `REPORT_ONLY`** — then return the report and stop.
