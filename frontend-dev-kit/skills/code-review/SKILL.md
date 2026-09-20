---
name: code-review
description: Two-axis review of the diff between HEAD and a fixed point the user supplies — does the code conform to this repo's documented coding standards, and does it faithfully implement the originating issue/spec. Runs both axes as parallel sub-agents so they don't pollute each other's context, then aggregates their findings. Use before merging, when auditing a branch or PR, or when asked to review a diff against a base ref.
---

# Code Review

Two-axis review of the diff between HEAD and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as parallel sub-agents so they don't pollute each other's context, then this skill
aggregates their findings.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing,
tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.).
If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is
against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff
is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via
   the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.

If nothing is found, ask the user where the spec is. If they say there isn't one, the Spec
sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or
`CONTRIBUTING.md`.

This kit's own standards are also always in scope, sourced as follows:

- Where a dedicated rule file already exists, use it directly — `rules/typescript.md`,
  `rules/react.mdc`, `rules/general-coding-principles.md`, `rules/honesty.mdc`. No copy of
  these lives in this skill; read the rule file itself.
- FSD architecture (layers, slices, segments, public APIs, query keys, state ownership) lives in
  the `architecture-audit` skill, not a rule. Load that skill and only the `references/*.md` files
  that match the changed paths. Do not invent a second architecture summary.
- Where no rule file exists yet (the topic only lives inside a skill today), use this skill's own
  `references/*.md` instead: `references/styling-and-shadcn.md`, `references/accessibility.md`,
  `references/i18n.md`, `references/data-fetching.md`, `references/testing.md`.

Include whichever of these — rule file or reference file — match the changed file types (see the
table in [References](#references) for which applies to what). Treat all of them as the default
standards when the repo documents nothing more specific; a repo-level doc always overrides where
the two disagree.

On top of whatever the repo documents, the Standards axis always carries the smell baseline below:
a fixed set of Fowler code smells (*Refactoring*, ch. 3) that applies even when a repo documents
nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the
  baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never
  a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads what it is → how to fix; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or
  holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. →
  extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the
  method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be
  born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its
  own type. → give the concept its own small type.
- **Repeated Switches**: the same switch/if-cascade on the same type recurs across the change. →
  replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. →
  gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each
  module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't
  have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the
  walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real
  target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it
  inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3 — repo docs, matching kit rule files,
  matching `architecture-audit` `references/*.md` for `src/**` diffs, and matching
  `references/*.md` files from this skill — with their contents pasted in full, plus the
  smell baseline from step 3 pasted in full (the sub-agent has no other access to any of this).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented
  standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and
  quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches
  can be hard, but baseline smells are always judgement calls, and a documented repo standard
  overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b)
  behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented
  but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned.
Do not merge or rerank findings, because the two axes are deliberately separate (see
[Why two axes](#why-two-axes)).

End with a one-line summary: total findings per axis, and the worst issue within each axis (if
any). Don't pick a single winner across axes: that's the reranking the separation exists to
prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → Standards pass, Spec fail.
- Code that does exactly what the issue asked but breaks the project's conventions → Spec pass,
  Standards fail.

Reporting them separately stops one axis from masking the other.

## References

Baseline standards for the Standards axis — see [step 3](#3-identify-the-standards-sources) for
when to include which.

Existing kit rule files — read directly, no copy kept here:

| File | Applies to |
|---|---|
| `rules/typescript.md` | any `.ts`/`.tsx` |
| `rules/react.mdc` | `.tsx` |
| `rules/general-coding-principles.md` | any `.ts`/`.tsx` |
| `rules/honesty.mdc` | any `.ts`/`.tsx`/`.md` (always applies) |
| `architecture-audit` skill | `src/**` — load matching `references/`, not a rule file |

Topics with no dedicated rule file yet — distilled into this skill's own reference file instead:

| File | Distilled from | Applies to |
|---|---|---|
| [references/styling-and-shadcn.md](references/styling-and-shadcn.md) | `tailwind-styles`, `shadcn-usage` skills | `.tsx` |
| [references/accessibility.md](references/accessibility.md) | `accessibility` skill | interactive `.tsx` |
| [references/i18n.md](references/i18n.md) | `i18n` skill | new/changed user-facing copy |
| [references/data-fetching.md](references/data-fetching.md) | `react-query-hook` skill | `api/`, `**/hooks/use*.ts` |
| [references/testing.md](references/testing.md) | `testing` skill | any non-trivial component/hook/utility |

The reference files are a snapshot, not a live link — if the source skill changes, re-derive the
matching reference file. If any of those topics later gets a dedicated rule file of its own, drop
its reference file here and read the rule file directly instead, same as the ones above.
