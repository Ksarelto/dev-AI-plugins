---
name: code-review
description: Full code review of a React FSD change — a branch diff against a base ref, uncommitted work, or named paths. Checks coding standards, architecture (layer, slice, import direction, public API, state ownership), design-principle violations (SOLID, coupling, cohesion, YAGNI, code smells), pattern usage and misuse, readability, best practices (correctness, performance, security, accessibility, tests), change size, and reuse of existing code, and optionally the originating issue or spec. Reports severity-tagged findings. Use before merging, when auditing a PR, or when asked to review code or a diff.
argument-hint: "[base-ref | path...] [--spec <file>] [--focus all|architecture|design|standards|readability|security|performance]"
allowed-tools: [Read, Glob, Grep, Bash]
---

# Code Review

Review a change on the axes below and report severity-tagged findings. Read-only: do not edit unless the
user asks for fixes after the report. Question sets, checklists, sizing, dead-code, disagreement, and
honesty rules are in [review-axes.md](references/review-axes.md). Walk that file for every axis the
focus includes.

| Axis | Question | Source |
|---|---|---|
| Standards | Does it follow this kit's documented rules? | `rules/*.mdc`, [conventions.md](references/conventions.md), scripts |
| Architecture | Does it respect layers, slices, public APIs, state ownership, and file boundaries? | [architecture.md](references/architecture.md), `architecture-audit` skill, [review-axes.md](references/review-axes.md) |
| Design | Does it violate SOLID, coupling/cohesion, KISS/YAGNI/DRY, or carry smells? | [design-principles.md](references/design-principles.md), [design.md](references/design.md) |
| Patterns | Is the prescribed pattern used, and is none added without need? | [patterns.md](references/patterns.md) |
| Readability | Can another engineer understand it, and is there a shorter version? | [review-axes.md](references/review-axes.md) |
| Correctness | Does it do what was asked, including edges, errors, and tests? | [best-practices.md](references/best-practices.md), [testing.md](references/testing.md), [review-axes.md](references/review-axes.md) |
| Security | Does the change introduce a vulnerability? | [best-practices.md](references/best-practices.md) Security, [review-axes.md](references/review-axes.md) |
| Performance | Does the change introduce a performance problem? | [best-practices.md](references/best-practices.md) Performance, [review-axes.md](references/review-axes.md) |
| Spec (optional) | Does it implement the issue or spec it came from? | `SPEC_PATH` |

Accessibility and resilience are reported on Correctness, via [accessibility.md](references/accessibility.md)
and the Resilience section of [best-practices.md](references/best-practices.md).

Not this skill: a whole-tree structural audit of code nobody changed (`architecture-audit`);
scaffolding (`react-feature`).

## Inputs

- **Scope.** A base ref (`FIXED_POINT`), or paths, or nothing.
  - Ref: review `git diff <ref>...HEAD` plus uncommitted changes.
  - Paths: review those files and directories whole; there is no diff, so the architecture axis reads
    them with their importers. Sizing uses the file line counts, since there is no diff stat.
  - Nothing: base is `git merge-base HEAD origin/develop`, then `origin/main`, then `origin/master`.
    If none resolves and the tree is dirty, review the uncommitted changes. Otherwise ask once.
- **`SPEC_PATH`** (`--spec`). Optional. Without it the spec axis is skipped; say so in the report.
  Do not require an issue-tracker file. Spec still runs when set, whatever `--focus` is.
- **`--focus`.** `all` (default) runs every axis. One of `architecture`, `design`, `standards`,
  `readability`, `security`, `performance` runs that axis only. `design` includes Patterns. A
  narrowed focus still runs the mechanical scripts.

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
source files or fewer is reviewed inline without subagents. Inline review still walks
[review-axes.md](references/review-axes.md).

Record `git diff --stat` for the ref range and the uncommitted diff, and the line count of each
touched source file. Apply the sizing rules in [review-axes.md](references/review-axes.md). Crossing
~500 changed lines, or materially growing a file already near ~500 lines, is a **Should fix** that
asks to split or extract first. Size alone is not a Blocker. Complete file deletions and automated
refactors are the exception: check intent, not every line.

## 2. Mechanical checks

Run on the repo root. `$KIT` is this kit's directory (two levels above this `SKILL.md`).

```bash
node "$KIT/skills/code-review/scripts/scan-review-patterns.mjs" --base "$FIXED_POINT"
node "$KIT/skills/code-review/scripts/scan-duplicates.mjs" --base "$FIXED_POINT"
```

Also run the project's own `typecheck`, `lint` (ESLint and dependency-cruiser, when configured), and
unit-test scripts if they exist in `package.json`. A failure is a **Blocker** with its output line. A
check that could not run is listed under "Not verified", never assumed to pass. Run `build` when the
project has one; a failure is a Blocker, a missing script is "Not verified".

Every printed script line is a finding with file and line. Do not drop one to shorten the report. The
pattern script covers nested `if`, `t(...)` stored in a local, a `` `${…}-${index}` `` key, raw
`<input>`, `localStorage`, a `className` on `Button` that sets color, radius, border, shadow, padding,
or type, `useQuery` / `useMutation` outside `api/`, `invalidateQueries` outside the hooks role (`api/hooks.ts` or `api/hooks/**`), `let` in a component, an IIFE, and a hand-rolled
`isLoading` / `isFetching` / `isPending` / `isError` / `error`. The duplicate script covers a copied
body and a raw `<input>`, `<button>`, or `<table>` that reimplements `shared/ui`.

## 3. Review in parallel

Start the items the focus includes:

1. **Architecture** — one subagent for the whole change, following
   [architecture.md](references/architecture.md). Run `architecture-audit` with `REPORT_ONLY`,
   `DIFF_SCOPE`, and the topics for the changed paths. Also walk the Architecture checklist in
   [review-axes.md](references/review-axes.md): file size, a conditional bolted onto an unrelated
   flow, and where reused code belongs. Runs only when focus is `all` or `architecture`.
2. **One subagent per bucket** for the axes in focus. On `all`: Standards, Design, Patterns,
   Readability, Correctness, Security, and Performance. On `design`: Design and Patterns. On
   `standards`, `readability`, `security`, or `performance`: that axis only. The prompt names the
   bucket's source files and says: read every file in full, check callers when a signature changed,
   walk the checklists in [review-axes.md](references/review-axes.md) for those axes and the
   references named below, and return one line per file, `path: clean` or
   `path: <findings with severity, line, rule, cost, fix>`. Also return, per new component, hook,
   helper, mapper, constant, enum, or feature, the simpler-path note and any existing symbol that should be reused. Tests are
   read only when a finding needs them. Pass paths of the standards to read, not their text.
3. **Spec** — one subagent per spec file when `SPEC_PATH` is set. Each acceptance criterion is `done`,
   `partial`, or `none`. `partial` and `none` quote the criterion. Scope the spec did not ask for is
   its own line.

A bucket summary with no per-file line is incomplete; re-spawn that bucket once. The coordinator does
not paste subagent text. For each rule a bucket names, search the rest of the diff and add the
matches. Checked-clean questions stay off the report.

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
| [review-axes.md](references/review-axes.md) | every changed file, for the axes in focus |
| [conventions.md](references/conventions.md) | every `src/**` `.ts`/`.tsx` |
| [design.md](references/design.md) | every changed component under `ui/` |
| [design-principles.md](references/design-principles.md) | every changed file |
| [patterns.md](references/patterns.md) | every changed file |
| [best-practices.md](references/best-practices.md) | every changed file |
| [styling-and-shadcn.md](references/styling-and-shadcn.md) | `.tsx` |
| [accessibility.md](references/accessibility.md) | interactive `.tsx` |
| [i18n.md](references/i18n.md) | new or changed user-facing copy |
| [data-fetching.md](references/data-fetching.md) | `api/`, and any file that calls `useQuery`, `useMutation`, `useQueryClient`, or `invalidateQueries` |
| [testing.md](references/testing.md) | every executable file in the diff |

When a finding under `rules/general-coding-principles.mdc` needs its rationale, naming table, or an
example, read [clean-code-principles.md](references/clean-code-principles.md) and
[code-syntax-and-formatting.md](references/code-syntax-and-formatting.md). For one under
`rules/typescript.mdc`, read [typescript-patterns.md](references/typescript-patterns.md).

## 4. Simpler path and reuse

Required on every review, including a narrowed focus. Bounded to symbols and shapes the diff
introduces. Searching the repo for an existing solution is part of the review; a whole-tree
structural audit stays in `architecture-audit`.

- **Simpler path.** For the change as a whole, state whether the same behavior could be done in
  substantially fewer lines. A roughly tenfold expansion with no extra behavior is a **Should fix**
  and names the shorter shape. `none` is a valid answer when the diff is already the short version.
- **Reuse.** For each new component, hook, helper, mapper, constant, enum, or feature, search the
  repo for an existing implementation of that job. Keep every line the duplicate script printed. Destination:
  - a primitive that already exists in `shared/ui` is reused
  - domain logic stays on the owning entity or feature; `shared/` does not gain a business noun
  - a stack-wide helper with no business noun promotes to `shared/lib` on the third use
  - a new conditional bolted onto an unrelated flow is a design finding: extract a helper, state, or policy

## 5. Severity, honesty, and dead code

Tag every finding with [severity.md](references/severity.md): **Blocker**, **Must fix**,
**Should fix**, or **Consider**. A finding names `path:line`, the rule or principle, the concrete
cost or failing case, and the fix. Flag what is missing as well as what is wrong: a component folder
without `tests/`, a new endpoint hook without a schema, a slice without a public `index.ts`.

Critical means **Blocker**. Required means **Must fix**. There is no second severity scale.

A documented rule overrides a design smell. Skip anything a script already listed. A principle is
reported only when the diff introduces or worsens the violation — pre-existing debt is one line under
"Pre-existing" at most. An issue this change introduced is fixed in this change. "I'll clean it up
later" is not a resolution. A Should fix may be deferred only with a written justification. Blocker
and Must fix may not. When surrounding pre-existing debt should be fixed separately, name it and ask
for a filed bug. Leave untouched code out of the required fixes.

Apply the honesty and disagreement rules in [review-axes.md](references/review-axes.md). A bug that
will hit production is a Blocker. Quantify the cost. Name an alternative. Comment on the code. Reject
the rationalizations listed in that file. If the author has the full context and disagrees on a
Consider, defer and record the disagreement.

**Dead code.** List code the change left unreachable or unused: orphaned exports, `_unused` bindings,
backwards-compat shims, commented-out removals. Ask: "Should I remove these now-unused elements:
[list]?" Do not delete them in the review.

## 6. Report

```
## Review <ref>...HEAD (<n> files) — focus: <focus>

### Verdict
<Approve | Approve with changes | Request changes> — <one sentence>

### Mechanical
typecheck: pass|fail|not run · lint: pass|fail|not run · tests: pass|fail|not run · build: pass|fail|not run
<every script line>

### Sizing
<changed lines> changed; largest file <path> <n> lines — <within limit | Should fix: <strategy>>

### Simpler path
<none | shorter shape and line delta>

### Reuse
<existing symbol and destination layer, or none found>

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

### Dead code
<list and the removal question, or none>

### Consider
<judgement calls, 400 words>

### Verification
- [ ] typecheck, lint, and tests match Mechanical, or the gap is under Not verified
- [ ] build matches Mechanical, or the project has no build script
- [ ] dependency changelog read, one package in this change, lockfile diff reviewed — or n/a

### Not verified
<checks not run and why>
```

Fill Verification from the checklist in [review-axes.md](references/review-axes.md) before choosing
the verdict. Unresolved Blockers mean Request changes. Must fix with no Blocker means Approve with
changes. Neither means Approve. A deferred Should fix carries its justification on that line. Say
plainly when a section is empty. After the report, offer to fix the Blockers and Must fix items, and
ask the dead-code question when the list is non-empty. Do not start without a yes.
