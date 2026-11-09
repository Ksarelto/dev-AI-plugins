# Story rules: INVEST, Gherkin, surfaces and UX notes

Used by `story-writing` (story-writer, S2). Each rule names the `gate-stories` check it satisfies
(`factory/scripts/gates/stories.mjs`) where one exists.

## INVEST, applied

| Letter | Test the story against | When it fails |
|---|---|---|
| Independent | can it be built and shown without another story of this feature being done first? | merge the two, or accept the order and say so in the summary |
| Negotiable | does it state an outcome, leaving the UI and code open? | remove component names and layout from `i_want` |
| Valuable | would a user notice it on its own? | it is a task, not a story — fold it into the story it serves |
| Estimable | are its ACs concrete enough to size? | the spec is unclear: `needs_clarification`, never guess |
| Small | one capability; `i_want` names one thing | split (below); three or more wants warn `story-too-big` |
| Testable | every AC is Given / When / Then with the spec's values | see Gherkin |

### Splitting a story

Split along the first line that applies, so each part is still valuable:

1. **Workflow step** — "browse, add to cart, check out" → three stories.
2. **Business rule** — "apply a coupon" and "coupons cannot stack" when the rule has its own ACs.
3. **Data variation** — one kind of input first, others after ("pay by card", "pay by invoice").
4. **Role** — the same capability for a customer and for an admin, when their ACs differ.
5. **Simple first, then complex** — the plain case, then the case with limits and exceptions.

Never split happy and unhappy paths of one capability into different stories: the error ACs
belong with the behaviour they protect. When a `must` requirement's ACs are spread over two
stories, **each** story needs its own `error`, `edge` or `permission` AC, or a `no_unhappy_path`
reason.

## Fields

| Field | Rule |
|---|---|
| `id` | the next free `STORY-nnnn` from T0; unique (`duplicate`) |
| `traces` | the REQ IDs the story delivers; each must exist in the spec (`unknown-req`) |
| `as_a` | the actor exactly as the spec names it ("signed-in customer"), never "user" when the spec says more |
| `i_want` | one capability, in the user's words |
| `so_that` | the benefit, from the requirement or its source |
| `acs` | spec AC IDs with their Gherkin; never a new ID (`invented-ac`) |
| `ux` | `surfaces` and `states` for a story with a user-facing surface |
| `no_unhappy_path` | at least 10 characters: why a story of a `must` requirement has no unhappy AC |

Every spec AC lands in exactly one story (`uncovered-ac` when in none), and that story traces the
AC's own requirement (`ac-req-not-traced`).

## Gherkin

```gherkin
Given a cart with total 100.00 EUR
When I apply the coupon "B2B10"
Then the discount line shows -10.00 EUR
And the order total is 90.00 EUR plus shipping
```

- One `Given`, one `When`, one `Then` line at least, each starting with exactly that word
  (`missing-step`). `And` and `But` add steps.
- Each of those lines has at least three words, keyword included, and names a real state, action
  or outcome (`empty-step`). "Given a cart" fails; "Given a cart with 2 lines" passes.
- **Copy every value from the spec's AC text**: each double-quoted or single-quoted string and each
  standalone number must appear verbatim in the Gherkin (`value-missing`). `100.00` is not `100`;
  `"This coupon has expired"` is not `"Coupon expired"`. Thousands separators are ignored
  (`1,000` = `1000`); numbers glued to letters (`95th`, `OAuth2`) are not checked.
- `Given` is a state you can set up in a test: concrete data, the signed-in role, the screen.
- `When` is one user action or one system event.
- `Then` is observable: what the user sees or what is stored and visible — never an
  implementation detail ("the reducer updates state").
- First person ("I apply…") or the role ("the customer applies…") — pick one per feature.
- Turn the AC into steps; never add behaviour, and never drop a condition the AC states.

## AC kinds and the unhappy-path rule

The `kind` comes from the spec (`happy`, `error`, `edge`, `permission`, `nfr`; missing = `happy`).
A story that traces a `must` requirement needs at least one AC of kind `error`, `edge` or `permission`
(`unhappy-path-missing`). You cannot add one — only the spec can. So:

- the spec has such an AC for the requirement → put it in the story;
- the requirement truly has no failure mode → `no_unhappy_path` with the reason: "a pure
  calculation over validated lines; invalid coupons are STORY-0001's error AC";
- the requirement should have one but the spec lacks it → `needs_clarification` naming the
  requirement, so the analyst adds the AC.

## Surfaces: stable screen identifiers

A surface name is a screen's identity across stories and features.

- A **surface** is a screen a user navigates to, or a modal or drawer big enough to be designed on
  its own. A region inside a screen (the coupon field) is not a surface: describe it in the UX notes
  under its screen.
- Name it in PascalCase as a noun phrase: `OrderHistory`, `CheckoutSummary`, `SupplierDetail`.
  Its kebab-case form (`order-history`) is the screen id, so two different screens must
  never share a name, and one screen never gets two names.
- **Reuse existing names exactly.** Take the capability map's feature name or the component
  inventory's name. The engine counts a surface as new when its lower-cased name matches neither a
  capability nor an inventory component.
- Every story touching the same screen uses the same name, in this feature and later ones.
- A story with no user-facing change (a calculation, a background job) has no `ux` block.

### States

- `states` are lower-case kebab-case words (`loading`, `empty`, `error`, `applied`, `no-results`):
  each one is a distinct state of the page.
- A screen that shows data lists at least `loading`, `empty`, `error` and its success state.
- Add one state per `edge` or `error` AC that looks different (`expired`, `limit-reached`).
- A surface without states fails `no-states`.

## UX notes (`02-stories/ux-notes.md`)

Required as soon as any story has a surface (`no-ux-notes`). Shape:
[fa-ux-notes.md](../../../templates/fa-ux-notes.md). One section per surface, titled
`## <Surface> — <region> (STORY-…)`, covering:

| Part | Content |
|---|---|
| states table | one row per state in `ux.states`: what the user sees, the exact copy, the AC it proves |
| copy | every user-facing string the ACs quote, verbatim; nothing invented beyond labels the screen needs |
| empty / loading / error | the explanation and next action when empty; a skeleton or spinner while loading; the error copy, whether input is kept, and how to retry |
| responsive | what changes on a narrow screen (stacking, hidden columns, sticky actions) |
| accessibility | labels, focus order and where focus goes after the action, what is announced to screen readers, keyboard path, status not by colour alone |
| existing parts | components or screens from the capability map the surface reuses, by name |

Describe what a user sees and does; never components, props or code. Cite AC IDs, not their text,
when a row only proves an AC already quoted.
