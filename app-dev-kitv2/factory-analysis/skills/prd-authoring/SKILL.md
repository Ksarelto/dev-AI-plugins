---
name: prd-authoring
description: Procedure for the factory requirements-analyst on a greenfield app — write the product requirements document (prd.md) with traceable requirements, measurable acceptance criteria, open questions with defaults and a feature backlog. Preloaded by the requirements-analyst; not for direct use.
user-invocable: false
---

# PRD for a new app (greenfield)

Write `01-requirements/prd.md`: YAML front matter (the contract) plus a short narrative body.
Follow [fa-prd.md](../../templates/fa-prd.md) exactly for structure.

## Requirements

- One requirement = one capability a user or the business needs. Write it as an outcome
  ("A customer can reorder…"), never as a solution ("Add a Reorder button component").
- `sources` lists every SRC paragraph or HD note it comes from. No source, no requirement.
- Every SRC paragraph of this feature is cited by a requirement or listed in `sources_not_used` with a
  reason (context, history, out of scope) — a paragraph nobody accounts for fails the gate.
- `priority`: `must` for the first release, `should` / `could` otherwise.
- Use new IDs continuing the project's counters; never reuse an ID.

## Acceptance criteria

Each requirement has at least one AC, and each AC is checkable by a test without interpretation:

| Weak (the gate rejects vague words — well, correctly, fast, user-friendly… — without a quoted value, a number with a unit, or a comparison) | Measurable |
|---|---|
| "Reordering is fast" | "Reorder adds all lines to the cart in under 1 s for 50 lines" |
| "Shows a helpful error" | "Shows \"1 item could not be added\" and lists the part number" |

Cover the unhappy paths the sources imply: invalid input, empty state, permissions, limits.

## Open questions

Conflicts or gaps you cannot resolve from the sources become `open_questions` with a `severity`
(`blocker`, `major`, `minor`) and a `default` (every question has one). A blocker or major question
still `open` fails the gate — ask with `guided-interview`, or set `status: defaulted` when proceeding on
the default is safe. The human sees every unanswered question and its default at GATE-A.

## Backlog

Split the PRD into vertical features users can see, each listing its requirements and
`depends_on` (by title). After GATE-A the engine turns each entry into its own feature.

Run the exit check from T0 before you return.
