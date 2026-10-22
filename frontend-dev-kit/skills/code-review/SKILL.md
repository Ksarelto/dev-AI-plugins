---
name: code-review
description: Two-axis review of the diff between HEAD and a fixed point the user supplies — does the code conform to this repo's documented coding standards, and does it faithfully implement the originating issue/spec. Runs both axes as parallel sub-agents so they don't pollute each other's context, then aggregates their findings. Use before merging, when auditing a branch or PR, or when asked to review a diff against a base ref.
---

# Code Review

Review the diff against this repo's standards and the spec. Hard violations are listed in full.
The 400-word cap applies only to smell judgement calls.

`FIXED_POINT` is the parent branch or the ref the caller passes. `SPEC_PATH` is the spec file.
A human who passes neither is asked once for the missing one. Do not require `docs/agents/issue-tracker.md`.

## 1. Diff and buckets

Confirm `git rev-parse <FIXED_POINT>` and that `git diff --name-only <FIXED_POINT>...HEAD` is non-empty.
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

A bucket over 8 source files splits into groups of 8. Tests ride with their segment. They are not their own bucket.

## 2. Pattern scan

Run, on the repo root:

```bash
node frontend-dev-kit/skills/code-review/scripts/scan-review-patterns.mjs --base "$FIXED_POINT"
node app-dev-kit/feature-dev-kit/skills/feature-dev/scripts/scan-duplicates.mjs --base "$FIXED_POINT"
```

From a feature-dev-kit run the paths are `{FRONTEND_KIT}/skills/code-review/scripts/scan-review-patterns.mjs` and `{KIT_DIR}/skills/feature-dev/scripts/scan-duplicates.mjs`.

Every printed line is a finding: file and line. Do not drop one to shorten the report. The pattern script covers nested `if`, `t(...)` stored in a local, a `` `${…}-${index}` `` key, raw `<input>`, `localStorage`, a `className` on `Button` that sets color, radius, border, shadow, padding, or type, `useQuery` / `useMutation` outside `api/`, `let` in a component, an IIFE, and a hand-rolled `isLoading` / `isFetching` / `isPending` / `isError` / `error`. The duplicate script covers a copied body and a raw `<input>`, `<button>`, or `<table>` that reimplements `shared/ui`.

## 3. One subagent per bucket

Spawn the buckets in parallel. Each prompt names its source files and says: read every source file in this bucket. Return one line per file, `path: clean` or `path: <findings>`. Tests are read only when a finding needs them.

A short summary with no per-file line is incomplete. Re-spawn that bucket once. The publisher does not paste the subagent text. For each rule a bucket names, search the rest of the diff and add the matches.

Standards the bucket reads, for the file types in the bucket: the matching `rules/*.mdc`, `references/conventions.md`, `references/design.md` for `ui/` components, and the matching rows in [References](#references). Do not paste those files into the prompt. Tell the subagent which paths to read.

## 4. Spec, one file at a time

One subagent per spec file. Each acceptance criterion is `done`, `partial`, or `none`. `partial` and `none` quote the criterion. No word cap. Scope that the spec did not ask for is its own line.

## 5. Report

```
## Patterns
<every script line>

## Files
<one line per source file, after the publisher's re-search>

## Spec
<criterion id>: done | partial | none
<quote, for partial and none>

## Smells
<Fowler judgement calls, 400 words>
```

Smells stay judgement calls. A documented standard overrides a smell. Skip anything the scripts already listed. The smell list:

- **Mysterious Name** — rename it.
- **Duplicated Code** — same shape, not the same text the duplicate script already flagged.
- **Feature Envy** — move the method onto the data it uses.
- **Data Clumps** — bundle the fields that always travel together.
- **Primitive Obsession** — give the domain concept a type.
- **Repeated Switches** — one map, or polymorphism.
- **Shotgun Surgery** — gather what changes together.
- **Divergent Change** — split a module that changes for several reasons.
- **Speculative Generality** — delete the unused abstraction.
- **Message Chains** — hide `a.b().c().d()` behind one method.
- **Middle Man** — call the real target.
- **Refused Bequest** — drop the inheritance.

## References

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
| `architecture-audit` skill | `src/**` — load matching `references/` |

| File | Applies to |
|---|---|
| [references/conventions.md](references/conventions.md) | every `src/**` `.ts`/`.tsx` |
| [references/design.md](references/design.md) | every changed component under `ui/` |
| [references/styling-and-shadcn.md](references/styling-and-shadcn.md) | `.tsx` |
| [references/accessibility.md](references/accessibility.md) | interactive `.tsx` |
| [references/i18n.md](references/i18n.md) | new or changed user-facing copy |
| [references/data-fetching.md](references/data-fetching.md) | `api/` |
| [references/testing.md](references/testing.md) | every executable file in the diff |
