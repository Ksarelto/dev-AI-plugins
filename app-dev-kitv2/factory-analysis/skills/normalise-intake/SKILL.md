---
name: normalise-intake
description: Procedure for the factory intake-normaliser — describe non-text sources paragraph by paragraph with new source IDs and rate intake coverage per topic. Preloaded by the intake-normaliser; not for direct use.
user-invocable: false
---

# Normalise intake

The engine has already split every text source into tagged paragraphs (`[SRC-012] …`) in
`.factory/context/normalised/`. Your work is what a script cannot do.

## 1. Describe placeholder sources

A normalised file that contains only `<!-- image … -->` / `<!-- pdf … -->` belongs to a screenshot,
PDF or other file. Open the original (`file` in `context/index.yaml`) and replace the placeholder:

- One paragraph per thing a requirement could depend on: a screen region, a labelled field, a table,
  a rule written in the document, a flow step. Start each with a new ID `[SRC-NNN]`, continuing
  after the highest SRC ID in `context/index.yaml`.
- Quote visible text exactly in double quotes; describe layout in plain words. Never guess numbers,
  rules or behaviour that the source does not show.
- Add the new IDs to that source's `ids` list in `context/index.yaml`.

## 2. Rate coverage

Write `.factory/context/coverage.yaml` with one entry per topic configured in `intake.coverage_topics`
(by default users, goals, scope, data, rules, nfr, acceptance). Template:
[fa-coverage.yaml](../../templates/fa-coverage.yaml).

| Status | Use when |
|---|---|
| `covered` | at least one source paragraph or human note answers it — cite them in `sources` (required) |
| `gap` | missing, but the requirements analyst can propose a default (e.g. no NFR given) — say what is missing in `note` |
| `blocker_gap` | missing and nothing sensible can be assumed (e.g. no goal, no idea who the users are) |

| `not_applicable` | the topic genuinely does not apply — say why in `note` |

`users` and `goals` are essential: they are either `covered` with a source or a `blocker_gap` you ask
about — never a plain gap (a patch-tier change is exempt). Describe images and PDFs in their
placeholder files only; the engine's tagged text files must stay exactly as written (the gate
compares a hash).

Human answers arrive as notes (`HD-n` in `human-notes.yaml`); cite them like sources.

## 3. Exit

Run the exit check from T0. A `blocker-gap` failure means you need the human: follow
`guided-interview`. Any other failure is yours to fix.
