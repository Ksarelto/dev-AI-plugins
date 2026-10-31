---
name: story-writing
description: Procedure for the factory story-writer — turn an approved spec into INVEST user stories whose acceptance criteria reuse the spec's AC IDs as Given/When/Then, plus UX notes per surface and state. Preloaded by the story-writer; not for direct use.
user-invocable: false
---

# Stories and UX notes

Write `02-stories/stories.yaml` ([fa-stories.yaml](../../templates/fa-stories.yaml)) and
`02-stories/ux-notes.md` ([fa-ux-notes.md](../../templates/fa-ux-notes.md)).

## Stories

- **INVEST**: independent, negotiable, valuable, estimable, small, testable. A story a user would not
  notice on its own is a task, not a story.
- `traces` lists the requirement(s) the story delivers. Every spec AC must appear in a story
  (normally exactly one); never invent an AC ID.
- Write each AC as Gherkin with concrete data: `Given … When … Then …` (`And` for more steps). Copy
  the exact values from the spec's AC text.

## UX notes

For every story with a user-facing surface, set `ux.surfaces` and `ux.states`, then describe each
state in `ux-notes.md`: what the user sees in empty, loading, success, error and any edge state the
ACs mention. Name existing components from the capability map when the surface already exists.

Run the exit check from T0 before you return.
