# Completeness credits (`01-requirements/completeness.yaml`)

Used by `prd-authoring` and `delta-spec` in the **requirements** stage. The patch tier
(`requirements-lite`) has no completeness file; the gate scores it only where the stage lists
`completeness` among its outputs. Schema: `factory/schemas/completeness.schema.json`; worked example:
[fa-completeness.yaml](../../../templates/fa-completeness.yaml).

You judge one credit per category. The engine (`factory/scripts/lib/completeness.mjs`) does the
arithmetic, so the same files always give the same score.

## The ten categories

Weights sum to 100. The order is also the order the engine asks gap questions in.

| Key | Weight | Full credit when the spec has… |
|---|---|---|
| `error_states` | 15 | an `error` AC for every user action that can fail (invalid input, rejected request, failure of a dependency) |
| `permissions_roles` | 15 | who may do each restricted action and what a refused user sees — `permission` ACs or a security NFR |
| `edge_cases` | 12 | `edge` ACs for the boundaries the sources imply: limits, empty data, dates, sizes, concurrency, offline |
| `non_functional` | 12 | at least one measurable performance, accessibility and security NFR |
| `backward_compatibility` | 8 | the impact on existing users, data and APIs: a `modified` requirement with ACs, `unchanged_guarantees` |
| `undo_rollback` | 8 | a confirmation or a reverse path for every destructive or costly action |
| `notifications` | 8 | every message that leaves the screen (email, push, in-app): event, recipient, wording |
| `data_lifecycle` | 8 | create, update and delete-or-archive of each primary entity; retention where the sources state it |
| `observability` | 7 | the events someone must be able to audit or trace, and their fields |
| `localization_accessibility` | 7 | languages, date and number formats, and the accessibility level |

## Credit levels

| Credit | Means | Needs | Example |
|---|---|---|---|
| `full` | the evidence above exists | `evidence:` spec IDs (REQ, AC, NFR) | `error_states: { credit: full, evidence: [AC-0002, AC-0005] }` |
| `partial` | some evidence, a concrete in-scope item missing | `evidence`, `gap`, `question`, `recommended` | permissions decided for customers, not for guests |
| `none` | nothing in the spec | `gap`, `question`, `recommended` | no way to remove an applied coupon |
| `n/a` | the category genuinely does not apply | `reason:` (at least 3 characters) | `backward_compatibility` on a greenfield app |

### What the engine does with them

- `full` whose evidence is empty or only `OQ-n` IDs counts as **partial**: a defaulted question is an
  assumption, not a decision.
- `n/a` without a `reason` counts as **none**.
- `partial` earns half the weight, rounded down (`permissions_roles` partial = 7).
- `n/a` categories leave the sum; the score is re-normalised:
  `score = round(100 × awarded / weight of applicable categories)`.
- Every evidence ID must be a REQ, AC, NFR or OQ the spec defines; an unknown one fails the gate
  (`unknown-evidence`).
- Every `partial` or `none` category needs a `question`; one without fails the gate (`no-question`).
- Below `quality.completeness_min` (default 85) the score does not insert a question round. The gaps
  are shown on `spec.md` at GATE-A as `<category> (<credit>): <question>`. A low score alone does not
  block the gate.

## Source conflicts

`completeness.yaml` may carry `conflicts: [{ topic, claims: [{ source, claim }, …], default_winner, status,
resolution? }]` — the contradictions found by diffing every source of the feature (analysis step 7). An
`open` one fails gate-spec (`unresolved-conflict`) and the engine asks the human exactly one question that
lists all of them with the default winner (the user's own brief). Write them as `open`; after the answer set
`resolved` with a `resolution`. A conflict still open after that one round goes to GATE-A as a warning.

Worked example (the template): full 15 + partial 7 + full 12 + full 8 + none 0 + full 7 = 49 awarded of
65 applicable (non_functional, notifications, data_lifecycle and observability are n/a) → **75**. Below
85, so the engine asks the two gap questions once.

## Valid n/a reasons

- greenfield, no existing users or data (`backward_compatibility`);
- owned by another system: "audit logging is the platform team's, unchanged" (`observability`);
- the behaviour does not exist: "no message leaves the checkout screen" (`notifications`);
- decided by a human or a source: "HD-3: no notifications in this release". An explicit "none needed"
  is a decision, never a partial — but cite where it was decided.

Never use `n/a` to skip work the feature has. A patch-sized change inside an existing screen often
has several `n/a` categories; a new app rarely has any but `backward_compatibility`.

## Writing gap, question and recommended

- `gap`: one sentence, what is missing in **this** app. "Nothing says how a customer removes an
  applied coupon." Not "undo is missing".
- `question`: the one decision that closes the gap, answerable in a few words, about this app —
  never about another system's internals. One decision per question; the engine shows it verbatim.
- `recommended`: the answer you would apply, phrased as an answer with its reason.
  "Yes — a \"Remove\" link next to the discount line restores the previous total."
- When the gap is already an open question in the spec, cite that `OQ-n` in `evidence` and reuse its
  wording, so the human answers it once.

## Procedure

1. Write the spec first; credit only what is written there.
2. Walk the ten categories in order. For each, find the IDs that satisfy the "full credit" column.
3. Improve the spec before you settle for partial: a missing `error` AC that a source implies is
   cheaper to add now than to ask about.
4. Write all ten keys, exactly these names, with `feature:` set to the feature ID.
5. Run the exit check. Below 85 is not a failure you fix by inflating credits: honest gaps with good
   questions are what the human needs.
