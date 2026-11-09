---
name: story-writing
description: Procedure for the factory story-writer — turn an approved spec into INVEST user stories whose acceptance criteria reuse the spec's AC IDs as Given/When/Then, plus UX notes per surface and state. Preloaded by the story-writer; not for direct use.
user-invocable: false
---

# Stories and UX notes

Runs on: story-writer (sonnet) — slicing an approved spec into buildable stories and turning each AC
into exact Given/When/Then, without changing what the spec says.

Write `02-stories/stories.yaml` ([fa-stories.yaml](../../templates/fa-stories.yaml)) and
`02-stories/ux-notes.md` ([fa-ux-notes.md](../../templates/fa-ux-notes.md)). INVEST, splitting,
Gherkin, surface naming and UX-note content in detail:
[fa-story-rules.md](references/fa-story-rules.md).

The spec passed its machine gate and is fixed (the human approves it at GATE-A). You reuse its REQ and AC IDs and its exact values. When it is
unclear, return `needs_clarification`; never guess.

## Procedure

1. **Read the spec** (T2: `prd.md` or `delta-spec.yaml`). For a delta-spec, the requirements are
   `added` plus `modified`. Note each requirement's priority and each AC's `kind`.
2. **Read the baseline names** — the capability map and, when T2 lists it, the component
   inventory. Existing screens keep their names.
3. **Group ACs into stories.** Start with one story per requirement; split a requirement only when
   `i_want` would name more than one capability (workflow step, business rule, data variation,
   role). Merge nothing across requirements unless one is meaningless alone.
4. **Write each story**: next free `STORY-nnnn`, `traces`, `as_a` with the spec's actor, one
   capability in `i_want`, the benefit in `so_that`.
5. **Turn each AC into Gherkin**: `Given` a concrete state, `When` one action, `Then` an observable
   outcome; every quoted string and number of the AC text copied verbatim.
6. **Check the unhappy path**: a story of a `must` requirement holds an `error`, `edge` or
   `permission` AC, or `no_unhappy_path` states why none exists. If the spec lacks one it should
   have, return `needs_clarification` naming the requirement.
7. **Surfaces and states**: for each user-facing story, `ux.surfaces` (PascalCase screen names,
   existing names reused exactly) and `ux.states` (kebab-case; `loading`, `empty`, `error` and the
   success state on data screens, plus one per distinct error or edge state).
8. **UX notes**: one section per surface with the states table, exact copy, empty / loading /
   error behaviour, responsive and accessibility notes.
9. **Human notes**: an open `HD-n` that concerns a story is mentioned there (in UX notes) or mapped in
   `notes_mapped`.
10. Run the exit check from T0; fix every failure; return `done`.

## What the stories gate checks

| Rule | Failure |
|---|---|
| `stories.yaml` valid against `stories.schema.json`; `feature` is this feature | `schema`, `feature-id` |
| story IDs unique | `duplicate` |
| every `traces` entry is a spec requirement | `unknown-req` |
| every AC ID is a spec AC, and its story traces the AC's requirement | `invented-ac`, `ac-req-not-traced` |
| every spec AC is in some story | `uncovered-ac` |
| each AC has `Given`, `When` and `Then` lines of three words or more | `missing-step`, `empty-step` |
| every quoted value and number of the spec AC appears in the Gherkin | `value-missing` |
| a story with surfaces lists states; `ux-notes.md` exists when any story has surfaces | `no-states`, `no-ux-notes` |
| a `must` story has an error / edge / permission AC or `no_unhappy_path` | `unhappy-path-missing` |
| `i_want` naming three things or more | `story-too-big` (warning only) |

The stage also tracks IDs: every REQ and AC of the spec, and every open human note, must appear in
`stories.yaml` or `ux-notes.md` (or the note be mapped).

## Mini example

Spec AC: `{ id: AC-0002, kind: error, text: 'Applying an expired coupon shows "This coupon has expired" and leaves the total unchanged' }`

```yaml
- id: AC-0002
  gherkin: |
    Given a cart with total 100.00 EUR and the coupon "OLD5" expired yesterday
    When I apply the coupon "OLD5"
    Then I see "This coupon has expired"
    And the total stays 100.00 EUR
```

The quoted message is copied exactly; the extra data ("OLD5", 100.00 EUR) only makes the `Given`
concrete. A `Then` of "an error is shown" would fail `value-missing`.

## When the spec is not enough

| Problem | Do |
|---|---|
| an AC cannot be written as an observable `Then` | `needs_clarification` with the AC ID and what is unobservable |
| a `must` requirement has no failure AC but clearly can fail | `needs_clarification` naming it |
| two ACs contradict each other | `needs_clarification` quoting both |
| a story would need an AC the spec lacks | never invent it; ask |

Questions go in the envelope's `open_questions`, one string each, recommended answer first:
`[AC-0004] Should a guest see the coupon field? (1) No, hidden (Recommended): REQ-0001 says signed-in (2) Yes — If unanswered: (1)`.
The answer returns as `HD-n`. When it needs a spec change (a new AC), return `needs_scope_change`
naming the requirement: you never edit the spec.
