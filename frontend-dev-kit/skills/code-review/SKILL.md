---
name: code-review
description: Full code review of a React FSD change — a branch diff against a base ref, uncommitted work, or named paths. Checks coding standards, architecture (layer, slice, import direction, public API, state ownership), design-principle violations (SOLID, coupling, cohesion, YAGNI, code smells), pattern usage and misuse, best practices (correctness, performance, security, accessibility, tests), and optionally the originating issue or spec. Reports severity-tagged findings. Use before merging, when auditing a PR, or when asked to review code or a diff.
argument-hint: "[base-ref | path...] [--spec <file>] [--focus all|architecture|design|standards]"
allowed-tools: [Read, Glob, Grep, Bash]
---

# Code Review

Review a change on five axes and report severity-tagged findings. Read-only: do not edit unless the
user asks for fixes after the report.

| Axis | Question | Source |
|---|---|---|
| Standards | Does it follow this kit's documented rules? | `rules/*.mdc`, `references/conventions.md`, scripts |
| Architecture | Does it respect layers, slices, public APIs, and state ownership? | [architecture.md](references/architecture.md), `architecture-audit` skill |
| Design | Does it violate SOLID, coupling/cohesion, KISS/YAGNI/DRY, or carry smells? | [design-principles.md](references/design-principles.md), [design.md](references/design.md) |
| Patterns | Is the prescribed pattern used, and is none added without need? | [patterns.md](references/patterns.md) |
| Best practices | Is it correct, fast, secure, accessible, resilient, and tested? | [best-practices.md](references/best-practices.md), [accessibility.md](references/accessibility.md), [testing.md](references/testing.md) |
| Spec (optional) | Does it implement the issue or spec it came from? | `SPEC_PATH` |

Not this skill: a whole-tree structural audit of code nobody changed (`architecture-audit`);
scaffolding (`react-feature`).

## Inputs

- **Scope.** A base ref (`FIXED_POINT`), or paths, or nothing.
  - Ref: review `git diff <ref>...HEAD` plus uncommitted changes.
  - Paths: review those files and directories whole; there is no diff, so the architecture axis reads
    them with their importers.
  - Nothing: base is `git merge-base HEAD origin/develop`, then `origin/main`, then `origin/master`.
    If none resolves and the tree is dirty, review the uncommitted changes. Otherwise ask once.
- **`SPEC_PATH`** (`--spec`). Optional. Without it the spec axis is skipped; say so in the report.
  Do not require an issue-tracker file.
- **`--focus`.** `all` (default), or one of `architecture`, `design`, `standards`. A narrowed focus
  still runs the mechanical scripts.

## 1. Scope and buckets

Confirm the ref with `git rev-parse --verify <ref>` and that the changed-file list is non-empty.
Source files are `.ts` and `.tsx` that are not tests (`*.test.*`, `*.spec.*`, `/tests/`).

One bucket per slice segment:

- `entities/<slice>`
- `features/<slice>` model, hooks, and api
- `features/<slice>/ui`
- `widgets/<slice>`
- `pages/<slice>`
- `shared/ui`
- other `shared`
- `app`

A bucket over 8 source files splits into groups of 8. Tests ride with their segment. A diff of 5
source files or fewer is reviewed inline without subagents.

## 2. Mechanical checks

Run on the repo root. `$KIT` is this kit's directory (two levels above this `SKILL.md`).

```bash
node "$KIT/skills/code-review/scripts/scan-review-patterns.mjs" --base "$FIXED_POINT"
node "$KIT/skills/code-review/scripts/scan-duplicates.mjs" --base "$FIXED_POINT"
```

Also run the project's own `typecheck`, `lint` (ESLint and dependency-cruiser, when configured), and
unit-test scripts if they exist in `package.json`. A failure is a **Blocker** with its output line. A
check that could not run is listed under "Not verified", never assumed to pass.

Every printed script line is a finding with file and line. Do not drop one to shorten the report. The
pattern script covers nested `if`, `t(...)` stored in a local, a `` `${…}-${index}` `` key, raw
`<input>`, `localStorage`, a `className` on `Button` that sets color, radius, border, shadow, padding,
or type, `useQuery` / `useMutation` outside `api/`, `let` in a component, an IIFE, and a hand-rolled
`isLoading` / `isFetching` / `isPending` / `isError` / `error`. The duplicate script covers a copied
body and a raw `<input>`, `<button>`, or `<table>` that reimplements `shared/ui`.

## 3. Review in parallel

Start these together:

1. **Architecture** — one subagent for the whole change, following
   [architecture.md](references/architecture.md): `architecture-audit` with `REPORT_ONLY`,
   `DIFF_SCOPE`, and the topics for the changed paths. Skipped by `--focus design|standards`.
2. **One subagent per bucket** for Standards, Design, Patterns, and Best practices. The prompt names
   the bucket's source files and says: read every file in full, check callers when a signature
   changed, walk the checklists named below, and return one line per file, `path: clean` or
   `path: <findings with severity, line, rule, cost, fix>`. Tests are read only when a finding needs
   them. Pass paths of the standards to read, not their text.
3. **Spec** — one subagent per spec file when `SPEC_PATH` is set. Each acceptance criterion is `done`,
   `partial`, or `none`. `partial` and `none` quote the criterion. Scope the spec did not ask for is
   its own line.

A bucket summary with no per-file line is incomplete; re-spawn that bucket once. The coordinator does
not paste subagent text. For each rule a bucket names, search the rest of the diff and add the
matches.

Standards a bucket reads, for the file types in it:

| File | Applies to |
|---|---|
| `rules/typescript.mdc` | any `.ts`/`.tsx` |
| `rules/react.mdc` | `.tsx` |
| `rules/general-coding-principles.mdc` | any `.ts`/`.tsx` |
| `rules/styling.mdc` | `.tsx`, `styles.ts`, `.css` |
| `rules/shadcn.mdc` | `shared/ui/**`, `components.json`, `globals.css` |
| `rules/i18n.mdc` | `.tsx`, `locales/**`, `constants.ts`, `config/**`, `model(s)/**` |
| `rules/testing.mdc` | any `src/**` `.ts`/`.tsx` and tests |
| `rules/component-structure.mdc` | component folders under `ui/` |
| `rules/api-contract.mdc` | `api/**` |
| `rules/honesty.mdc` | any `.ts`/`.tsx`/`.md` |

| Reference | Applies to |
|---|---|
| [conventions.md](references/conventions.md) | every `src/**` `.ts`/`.tsx` |
| [design.md](references/design.md) | every changed component under `ui/` |
| [design-principles.md](references/design-principles.md) | every changed file |
| [patterns.md](references/patterns.md) | every changed file |
| [best-practices.md](references/best-practices.md) | every changed file |
| [styling-and-shadcn.md](references/styling-and-shadcn.md) | `.tsx` |
| [accessibility.md](references/accessibility.md) | interactive `.tsx` |
| [i18n.md](references/i18n.md) | new or changed user-facing copy |
| [data-fetching.md](references/data-fetching.md) | `api/` |
| [testing.md](references/testing.md) | every executable file in the diff |

When a finding under `rules/general-coding-principles.mdc` needs its rationale, naming table, or an
example, read [clean-code-principles.md](references/clean-code-principles.md) and
[code-syntax-and-formatting.md](references/code-syntax-and-formatting.md). For one under
`rules/typescript.mdc`, read [typescript-patterns.md](references/typescript-patterns.md).

## 4. Severity and judgement

Tag every finding with [severity.md](references/severity.md): **Blocker**, **Must fix**,
**Should fix**, or **Consider**. A finding names `path:line`, the rule or principle, the concrete
cost or failing case, and the fix. Flag what is missing as well as what is wrong: a component folder
without `tests/`, a new endpoint hook without a schema, a slice without a public `index.ts`.

A documented rule overrides a design smell. Skip anything a script already listed. A principle is
reported only when the diff introduces or worsens the violation — pre-existing debt is one line under
"Pre-existing" at most.

## 5. Report

```
## Review <ref>...HEAD (<n> files) — focus: <focus>

### Verdict
<Approve | Approve with changes | Request changes> — <one sentence>

### Mechanical
typecheck: pass|fail|not run · lint: pass|fail|not run · tests: pass|fail|not run
<every script line>

### Blockers
- `path:line` [axis] rule — cost — fix

### Must fix
...

### Should fix
...

### Architecture
<what the change does to layers, slices, and boundaries — 3 lines max, then findings above>

### Spec
<criterion id>: done | partial | none
<quote, for partial and none>   (or: skipped, no SPEC_PATH)

### Files
<one line per source file, after the coordinator's re-search>

### Consider
<judgement calls, 400 words>

### Not verified
<checks not run and why>
```

Verdict rule: any Blocker → Request changes; Must fix without Blocker → Approve with changes;
neither → Approve. Say plainly when a section is empty. After the report, offer to fix the Blockers
and Must fix items; do not start without a yes.
