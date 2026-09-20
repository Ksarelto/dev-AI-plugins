---
name: generate-feature-spec
description: Turn a raw feature request or a scoped spec-dev-kit YAML slice into a structured, testable blackboard at intake with clarifying questions returned as a CLARIFY_PACKET. Produces .spec/features/<slug>.md per the feature-spec-format. Never AskUserQuestion, never self-finalizes blackboard status.
argument-hint: <feature-slug> "<raw request>"
disable-model-invocation: false
allowed-tools: [Read, Write, Glob, Grep]
---

# Generate Feature Spec

## When to use

Station 0 (intake). Used by `spec-analyst`. Prefer an existing `.spec/features/<slug>.md` created by
`new-feature.sh` / `import-upstream.mjs` — update it rather than starting from a blank file.

## Steps

1. **Slug** — already derived by the skill; do not reuse the app `metadata.slug` for a screen-task.

2. **Open** `.spec/features/<slug>.md`. If missing, copy `templates/feature-spec.md` and stamp
   front matter (`status: draft`). Leave `approved` unset.

3. **If a compact upstream slice or import-upstream output is present**, copy its Request, ACs,
   UI Surface, and API contract. Do not add sibling screens.

4. **Populate `## Request`** with the verbatim ask plus imported context. Do not paraphrase.

5. **Draft `## Acceptance Criteria`** as numbered testable checkboxes. Prefer imported `AC-xxx`
   lines. Mark unknowns as `- [ ] TBD: <question>`.

6. **Draft `## UI Surface`** for **this screen only** (id, title, route, states, prototype-page).

7. **Draft `## API Contract / Data Model`** from imported entities/endpoints only.

8. **Identify gaps**. Collect questions. Do **not** call `AskUserQuestion`. The agent returns a
   `CLARIFY_PACKET`; the `feature-dev` skill asks.

9. After answers exist under `## Clarifications`, replace resolved `TBD`s.

10. Leave `status` as `draft` or `awaiting-clarification`. **Never** set `approved`.

## What this skill does NOT do

- Does not read or modify `src/`.
- Does not dump a whole `type: app` spec into one blackboard.
- Does not make architecture decisions (FSD Impact, Reuse Map, Build Plan).
- Does not start the build.
