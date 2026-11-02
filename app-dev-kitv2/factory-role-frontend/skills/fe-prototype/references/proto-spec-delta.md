# Spec deltas from the prototype

Building a screen is the first time the spec is looked at as a page. What you learn goes into
`spec_delta` (your screen note; the designer's report for shell-level findings). At GATE-P the
human sees every delta; approving with any `breaking: true` delta sends the feature back to
requirements with those deltas (once — `budgets.backward_edges.prototype_to_requirements`), rejecting
has the prototype revised. So a delta must be specific, honest and correctly classified.

## Entry shape

```yaml
spec_delta:
  - change: "AC-0002 shows the expiry error under the field, but the UX notes put it in a toast; the page uses the inline error"
    kind: invalidated
    breaking: false
    affects: [AC-0002, STORY-0001]
```

`change` is one sentence a product owner can act on: what the spec says, what the page shows or
needs, and the decision it asks for. `affects` lists the REQ, AC or STORY ids it touches.

## `kind`

| kind | Use when | Example |
|---|---|---|
| `validated` | the page makes an AC concrete and it works as written | "AC-0001 fits the summary: discount line under the subtotal, total recalculated" |
| `invalidated` | an AC cannot work as written on the page, or two ACs / an AC and the UX notes contradict each other | "AC-0004 asks for the coupon field above the line items, but STORY-0002 needs the subtotal visible while typing" |
| `discovered` | the page needs something no AC covers: a state, a field, a message, a navigation path, a permission | "No AC says what happens when a second coupon is applied — replace or reject?" |

Record a `validated` entry only for an AC that was in doubt (an open question, a vague UX note) and
the page settles; a plain "it works" for every AC is noise.

## `breaking`

`breaking: true` means **the approved spec must change before the feature can be built as
specified** — an AC's text, a requirement, a story's surfaces or states, or the scope. Mark it when:

- an AC is `invalidated` (its outcome cannot be shown or contradicts another AC);
- a `discovered` need would add or change an AC or a requirement (a missing error state of a
  must-have story, a field the form cannot work without, a second surface the flow needs);
- the page shows the story needs a surface or a state that `stories.yaml` does not list.

Keep it `false` when the spec can stand as written and the point is a decision the architect or the
builders can take: layout, wording inside the AC's meaning, the order of fields, which component to
use, a placeholder screen it links to.

| Finding | kind | breaking |
|---|---|---|
| The exact AC message fits the inline error | validated | false |
| The UX notes say toast, the AC says inline; the AC is clear | invalidated | false (the AC wins; the UX notes are corrected later) |
| Two ACs require opposite outcomes for the same input | invalidated | true |
| No AC for an empty cart on the checkout screen | discovered | true when the story is a must; false for a nice-to-have with a sensible default |
| The page needs a "Remove coupon" action no story mentions | discovered | true |
| A nicer label for the Apply button | — | not a delta: leave it out |

## Rules

- List only differences from the current spec; never restate an AC as a delta.
- One finding per entry; no duplicates of the designer's report entries (read it first).
- Use the ids from the spec; never invent new ones (the analyst assigns them).
- Never change the page to hide a breaking delta: build what the spec says, and record the conflict.
- A delta about another screen goes into that screen's note only if you build it; otherwise into
  `notes` of yours, for the designer.
