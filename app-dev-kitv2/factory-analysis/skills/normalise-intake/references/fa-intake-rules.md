# Intake rules: describing sources and rating coverage

Used by `normalise-intake` (intake-normaliser, S0). Adapted from the v1 spec kit's atomic extraction
rules. The engine already split every **text** source mechanically (one ID per paragraph, one per
list item). These rules are for what only you can do: describing screenshots, PDFs and other files
so the requirements analyst can cite each fact, and judging coverage honestly.

## Atomic split: one entry per fact a requirement could cite

Write the description as blank-line separated paragraphs. Each paragraph starts with a new
`[SRC-nnn]` ID and holds exactly one entry:

| In the source | One entry per | Example |
|---|---|---|
| table | **row** — quote the whole row with its column names; never split a row into cells | `[SRC-041] Table "Who is told", row: Event "Order shipped" · Recipient "Buyer" · Channel "Email"` |
| bullet or numbered list | **item** — a lead-in ending in `:` is repeated at the start of each child | `[SRC-042] Checkout rules: "A coupon applies to the subtotal only"` |
| prose paragraph with a signal word | **paragraph** — do not split it into sentences | `[SRC-043] Page 3: "Orders older than 24 months are archived and can no longer be reordered."` |
| screen region | **region or control** that a requirement could depend on | `[SRC-044] Header right: a "Sign in" button; no account menu is shown` |
| form | **field** with its label, hint, required marker and visible limits | `[SRC-045] Field "Coupon code", placeholder "e.g. B2B10", no required marker` |
| flow diagram | **step or decision** with its outgoing branches | `[SRC-046] Step 3 "Payment" → on "Declined" back to step 2 with message "Card declined"` |
| error, empty or loading state shown | **state** with its exact copy | `[SRC-047] Empty state: "No orders yet" and a "Browse catalogue" link` |

**Signal words** that make a prose paragraph requirement-bearing: must, shall, should, cannot,
never, always, at most, at least, required, not allowed, only, notify / notification, expire, lapse,
retain, within, until. A paragraph without one is still an entry when it states behaviour; pure
narrative (background, pain points) is one entry per paragraph too, so the analyst can set it aside
with a reason.

Skip document furniture: page numbers, running headers, a table of contents, "This document
describes…", link-only lines, logos. Never skip a footnote that states a rule.

## Fidelity

- **Quote visible text exactly** in double quotes: labels, button text, messages, column names.
  Keep the source's spelling, capitalisation and punctuation.
- **Keep every number verbatim** with its unit and qualifier: "at most three active borrows",
  "lapses after 24 hours", "max 5 MB", "10.00 EUR". Never round, convert or compute. A digit alone
  ("Step 2") does not make an entry.
- **Describe layout in plain words** ("left column", "below the total", "modal over the cart").
- **Never infer.** A greyed-out button is "shown greyed out", not "disabled for guests". Behaviour
  the image does not show (what happens on click) is not described. An unreadable value is
  "illegible", never a guess.
- **One fact, one home.** A fact repeated on two pages is described once, at its first occurrence;
  mention the second location in the same paragraph ("also on page 7").

## Headings: keep the document's structure

Keep the source's own section headings as Markdown headings (`## Out of scope`) on their own line,
followed by a blank line and the tagged paragraphs. The gate skips heading lines but requires every
paragraph under them to start with an SRC ID. The analyst routes paragraphs by the heading they sit
under:

| Heading in the source | Means for the analyst |
|---|---|
| Glossary, Terms, Definitions | the words requirements must use |
| Decisions, Agreed, Minutes | decided — cited, never asked again |
| Out of scope, Not now, Later, Non-goals | `out_of_scope`, never a requirement |
| Success measures, KPIs, Goals | measurable outcomes — candidates for NFRs and ACs |
| Open questions, TBD | open questions with defaults |
| Background, Context, Problem | context, set aside with a reason |
| Copy, Tone, Messages | exact wording for ACs |

When a screenshot or PDF has no headings, add none: do not invent structure.

## File format of a description

```
# checkout-mockup.png

## Checkout summary panel

[SRC-044] Top: the heading "Order summary" and the cart's line count "3 items".

[SRC-045] Below the lines: a text field labelled "Coupon code" and an "Apply" button to its right.

[SRC-046] Under the field, in red: "This coupon has expired".
```

- Replace only the `<!-- … -->` placeholder; keep the first heading line the engine wrote.
- Continue IDs after the highest SRC ID in `context/index.yaml`; never reuse one.
- Add every new ID to that source's `ids` list in `context/index.yaml`, in order. An ID in the file
  but not in the list fails `unlisted-id`; an ID in the list but not in the file fails `phantom-id`.
- No blank line inside a paragraph: a blank line starts a new one, which then has no ID.

## Coverage honesty

`coverage.yaml` rates each topic in `intake.coverage_topics` (default: users, goals, scope, data,
rules, nfr, acceptance). Rate what the sources say, not what you could imagine.

| Topic | Covered when a source or note states… | Typical gap |
|---|---|---|
| `users` | who uses it: roles, personas, "B2B customers" | "users" mentioned with no role |
| `goals` | why it is wanted: the problem or the outcome | a feature list with no purpose |
| `scope` | what is in, and ideally what is out | no boundary at all |
| `data` | the business objects and their fields | entities named, fields unknown |
| `rules` | limits, permissions, calculations, lifecycles | only the happy path |
| `nfr` | speed, availability, security, accessibility targets | nothing stated |
| `acceptance` | examples, "done when", test cases | no examples |

| Status | Use when | Gate rule |
|---|---|---|
| `covered` | at least one SRC or HD answers it | `sources` required and must exist |
| `gap` | missing, and the analyst can propose a default | `note` required: what is missing |
| `blocker_gap` | missing and nothing sensible can be assumed | ask the human (fails the gate until answered) |
| `not_applicable` | the topic does not apply to this request | `note` required: why |

- `users` and `goals` are essential (`intake.essential_topics`): `covered` with a source, or
  `blocker_gap` and asked. Never a plain `gap`. A patch-tier change is exempt.
- **Covered means answered, not mentioned.** A source that says "fast" covers nothing for `nfr`: it
  is a `gap` with the note "speed mentioned without a target".
- **Partial is a gap.** Cite the sources that cover part of it in the note, and say which part is
  missing.
- `not_applicable` is rare: "no new data — a copy change only". Never use it for "nobody said".
- A human note answering a topic is cited like a source (`sources: [HD-2]`).
