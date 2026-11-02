# Spec writing rules (PRD and delta-spec)

Used by `prd-authoring` and `delta-spec`. Each rule says what `gate-spec`
(`factory/scripts/gates/spec.mjs`) checks, so a passing exit check means the rule is met.

## IDs

| Kind | Pattern | Rule |
|---|---|---|
| requirement | `REQ-0001` | four digits; take it from "Next free IDs" in T0 |
| acceptance criterion | `AC-0001` | four digits; unique across the whole spec |
| non-functional | `NFR-1` | unique; no padding |
| open question | `OQ-1` | unique; no padding |

Never reuse an ID, even one a removed item had. A duplicate fails the gate (`duplicate`). A modified
requirement keeps the REQ ID the baseline gave it (the feature ledger's `requirements`); behaviour
the factory never specified gets a new ID.

## Requirements

- One requirement, one capability, written as an outcome for an actor: "A signed-in customer can
  reorder any past order line". Never a solution ("Add a Reorder button component").
- `sources`: every `SRC-nnn` and `HD-n` it comes from. No source, no requirement (`no-source`); a
  cited ID must exist (`unknown-source`).
- `priority`: `must` for the first release, `should` / `could` otherwise. A `must` requirement drives
  the story gate's unhappy-path rule.

## Acceptance criteria

Every AC is a check a test can make without interpretation.

1. **`kind` on every AC** — `happy`, `error`, `edge`, `permission` or `nfr`. A missing kind counts as
   `happy`.
2. **Every `must` requirement** gets at least one `happy` AC and at least one `error`, `edge` or
   `permission` AC. Without one, its story fails `unhappy-path-missing` unless the story writer can
   honestly state a `no_unhappy_path` reason (a pure calculation, a read-only view). The story
   writer cannot add ACs — they must be here.
3. **Observable outcome** — what the user sees or what the system returns, never how it is built.
4. **Exact values** — quote user-facing copy in double quotes; give numbers with their unit
   (`100.00 EUR`, `under 1 s`, `at most 3`). The story writer must repeat every quoted string and
   number in the Gherkin, so write them once, exactly.
5. **One behaviour per AC.** An AC with "and" between two outcomes that can fail separately is two.
6. **A precondition you can set up** — the state before the action is concrete enough for a
   `Given` step ("a cart with total 100.00 EUR").

| Kind | Use for | Example |
|---|---|---|
| `happy` | the main success path | 'Applying "B2B10" to a 100.00 EUR cart shows a -10.00 EUR discount line' |
| `error` | invalid input, a rejected request, a failing dependency | 'An expired coupon shows "This coupon has expired" and leaves the total unchanged' |
| `edge` | limits, empty data, boundaries, concurrency | 'A cart with 0 lines shows "Your cart is empty" and no coupon field' |
| `permission` | who may not, and what they see | 'A guest who opens /checkout/coupon is sent to "Sign in" and no coupon is applied' |
| `nfr` | a measurable quality of one behaviour | 'The discount line appears in under 300 ms after "Apply" on a 4G profile' |

## Measurable language

The gate rejects an AC or NFR that uses a vague term **and** has no measure (`vague-ac`, `vague-nfr`).
Text inside double quotes or backticks is ignored for the vague check — `"Quick add"` is a label.

**Vague terms** (`quality.vague_terms` in `factory/defaults.yaml`, matched as phrases): fast, quick,
quickly, easy, easily, intuitive, intuitively, user-friendly, simple, nice, helpful, clear message,
clear error, clearly, good, better, modern, robust, seamless, seamlessly, efficient, efficiently,
appropriate, appropriately, etc, works well, well enough, correctly, properly, gracefully, smooth,
smoothly, reasonable, reasonably, acceptable, adequate, sufficient, responsive, performant,
scalable, optimal, flexible, as expected, as needed, if needed, and so on, in a timely manner,
works fine, handles errors. A project may override the list.

**What counts as a measure:**

- a double- or single-quoted value: `"This coupon has expired"`;
- a comparison with a number: `< 2`, `>= 95`;
- money or a percentage: `€10`, `10.00 EUR`, `15%`;
- `at most`, `at least`, `within`, `no more than`, `less than`, `more than`, `under`, `over`,
  `up to`, `exactly` followed by a number;
- a number with a unit: ms, s, min, h, days, px, em, rem, kb, mb, gb, items, rows, results, requests,
  users, times, chars, characters, digits, decimals, lines, steps.

A named, versioned standard counts as a measure: WCAG 2.2 AA, OWASP ASVS L2, ISO 27001, RFC 9457,
PCI-DSS. "Every screen meets WCAG 2.2 AA and is usable with the keyboard only" passes; a vague word
with no standard or number ("is accessible", "is secure") does not.

| Weak | Measurable |
|---|---|
| "Reordering is fast" | "Reorder adds 50 lines to the cart in under 1 s at the 95th percentile" |
| "Shows a helpful error" | "Shows \"1 item could not be added\" and lists the part number" |
| "Handles errors gracefully" | "On a 503 from pricing, shows \"Prices are unavailable — try again\" and keeps the cart" |
| "Search works correctly" | "Searching \"brake\" returns at most 20 results whose name contains \"brake\"" |

Avoid the vague word instead of decorating it: the cleanest AC has none.

## Non-functional requirements

`non_functional: [{ id: NFR-n, category, text, sources? }]`. Categories: performance, accessibility,
security, reliability, privacy, observability, compatibility, localization.

- **A PRD must have performance, accessibility and security** (`nfr-missing`). A delta-spec adds
  NFRs only when the change affects them.
- Each text is measurable, as above. `sources` is optional: a domain default without a source is
  allowed, but then it should also be an open question when a wrong number would hurt.

| Category | Measurable example |
|---|---|
| performance | "The order list returns the first 20 orders in under 500 ms at the 95th percentile" |
| accessibility | "Every screen meets WCAG 2.2 AA; every action works with the keyboard only" |
| security | "A customer can read only their own orders; another customer's order returns 404" |
| reliability | "When pricing is down, checkout shows cached prices up to 15 minutes old" |
| privacy | "Exports omit email addresses; at most 1 export per user per 10 minutes" |

Performance and authentication targets come from the sources or from the human. Never invent a
generic web-app target without an open question carrying it as the default.

## Source fidelity

- Every SRC paragraph of the feature is cited by a requirement or listed in `sources_not_used` with a
  reason of at least 3 characters (`source-dropped`).
- Every number with a unit in a cited source reappears in a requirement, AC or NFR, or the gate warns
  (`number-dropped`, not blocking). Keep numbers verbatim: "24 hours" stays "24 hours".
- No template placeholder is left: `{{…}}` or `⟨…⟩` fail the gate (`placeholder`).

## Open questions

`open_questions: [{ id: OQ-n, severity, text, default, status, answer? }]`

| Field | Rule |
|---|---|
| `severity` | `blocker` (the feature is wrong if guessed wrong), `major` (rework), `minor` (cosmetic) |
| `default` | required unless `status: answered` (`no-default`); what happens if nobody answers |
| `status` | `open` (still to ask), `defaulted` (proceeding on the default, shown at GATE-A), `answered` |
| `answer` | the decision and its note: `"no (HD-2)"` |

A `blocker` or `major` question still `open` fails the gate. Ask it, or set `status: defaulted` when
proceeding on the default is safe. Never resolve a contradiction silently: it is a question.

## Human notes

Open notes are listed in T0 and T1. Every one must end up carried: cite `HD-n` in the `sources` of
what it shapes and map it in the envelope's `notes_mapped`. A note that changes nothing in this spec
is still mentioned by ID — for example as the reason of a `sources_not_used` entry or in an open
question.

## The PRD body

The YAML front matter is the contract; the Markdown body is narrative only. Refer to IDs; never
restate requirements. Start with a restatement the human can confirm line by line at GATE-A:

```
- Outcome:      what this delivers, in one line
- Users:        who benefits
- Why now:      what changed
- Success:      how we know it worked (cite the NFR or AC)
- Constraint:   the binding limit
- Out of scope: what we are explicitly not building
```

Then context and personas, and the backlog order with its reasoning.
