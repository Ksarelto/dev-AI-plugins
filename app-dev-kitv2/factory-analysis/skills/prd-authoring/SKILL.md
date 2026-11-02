---
name: prd-authoring
description: Procedure for the factory requirements-analyst on a greenfield app — write the product requirements document (prd.md) with traceable requirements, measurable acceptance criteria, open questions with defaults and a feature backlog. Preloaded by the requirements-analyst; not for direct use.
user-invocable: false
---

# PRD for a new app (greenfield)

Runs on: requirements-analyst (opus) — turning a whole customer brief into a traceable, testable
product spec when nothing is built yet.

Write `01-requirements/prd.md` (YAML front matter + a short Markdown body, shape:
[fa-prd.md](../../templates/fa-prd.md)) and, in the requirements stage,
`01-requirements/completeness.yaml` ([fa-completeness.yaml](../../templates/fa-completeness.yaml)).

References — read them in this order the first time:

| Reference | For |
|---|---|
| [fa-analysis-steps.md](references/fa-analysis-steps.md) | classifying sources, CRUD trace, dependencies, conflicts, defaults |
| [fa-spec-writing.md](references/fa-spec-writing.md) | IDs, AC kinds, measurable language, vague terms, NFRs, open questions |
| [fa-completeness.md](references/fa-completeness.md) | the 10 weighted categories and how to credit them |
| [fa-clarification-protocol.md](../guided-interview/references/fa-clarification-protocol.md) | when and how to ask |

## Procedure

1. **Read the pack.** T0 gives the feature ID, the output paths, the next free IDs and the exit
   check. T2 lists the normalised sources, `context/index.yaml`, `coverage.yaml` and, after bootstrap,
   `app-profile.yaml`. The coverage file tells you which topics intake found thin: start there.
2. **Analyse** with [fa-analysis-steps.md](references/fa-analysis-steps.md): classify every SRC
   paragraph of the feature, reframe vague statements, check story parts, trace each entity through
   create / read / update / delete, check the implied dependencies, find conflicts, walk each
   requirement as every role.
3. **Write the requirements** — one capability each, an outcome for an actor, `sources` on every one,
   `priority` from the sources' own signals.
4. **Write the ACs** — `kind` on every AC; every `must` requirement has a `happy` AC and an `error`,
   `edge` or `permission` AC; exact quoted copy and numbers with units; no vague term without a
   measure.
5. **Write `non_functional`** — at least one measurable `performance`, `accessibility` and
   `security` NFR. Performance and auth targets come from the sources or become open questions.
6. **Account for every source paragraph** — cited by a requirement, or in `sources_not_used` with a
   reason (`context: …`, `glossary: …`, `out of scope`). Put out-of-scope items in `out_of_scope`.
7. **Open questions** — every gap you could not settle is an `OQ-n` with `severity`, `default` and
   `status`. Contradictions are always questions.
8. **Backlog** — split the PRD into features users can see, in build order (below).
9. **Body** — the restatement block (outcome, users, why now, success, constraint, out of scope),
   context and personas. Refer to IDs; never restate the front matter.
10. **Completeness** — credit the ten categories from what the spec now says
    ([fa-completeness.md](references/fa-completeness.md)); improve the spec before settling for
    partial; give every partial or none a `gap`, a `question` and a `recommended` answer.
11. **Ask or finish.** A blocker no default can carry → follow `guided-interview` and return
    `needs_clarification`. Otherwise run the exit check, fix every failure, return `done`.

## The backlog

After GATE-A the engine turns each backlog entry into its own feature, so the entries are the
delivery plan.

- One entry = one user-visible outcome (a vertical slice across roles), titled the way a user
  would name it: "Reorder from order history", not "Order API".
- The first entry is the walking skeleton: sign-in (when the app has users) plus the primary
  entity's read path, so later features have users and data to build on.
- Every requirement sits in exactly one entry (`unplaced`, `duplicate-placement`).
- `depends_on` names earlier entries by exact title; never itself (`unknown-dependency`,
  `self-dependency`). List order = build order.
- No empty entry; no REQ that is not in `requirements` (`empty-entry`, `unknown-req`).
- A typical app has 3–8 entries; a single-feature brief may have one entry or no backlog.

## What the spec gate checks

| Rule | Failure |
|---|---|
| front matter valid against `prd.schema.json`; `feature` equals the feature ID | `schema`, `feature-id` |
| IDs unique across REQ, AC, NFR and OQ | `duplicate` |
| every requirement cites an existing SRC or HD | `no-source`, `unknown-source` |
| every SRC paragraph of the feature cited or in `sources_not_used` | `source-dropped` |
| no vague term without a measure in an AC or NFR | `vague-ac`, `vague-nfr` |
| performance, accessibility and security NFRs present | `nfr-missing` |
| no `{{…}}` or `⟨…⟩` placeholder left | `placeholder` |
| every question not answered has a default; no `blocker` / `major` still `open` | `no-default`, `blocker-open`, `major-open` |
| backlog places each REQ once and names real dependencies | see above |
| `completeness.yaml` valid, evidence IDs defined, every gap has a question, score ≥ 85 | `missing`, `unknown-evidence`, `no-question`, `below-threshold` |
| a sourced number with a unit missing from the spec | `number-dropped` (warning only) |

The stage also tracks human notes: every open `HD-n` must be cited in your outputs or mapped in
`notes_mapped`, or the stage fails.

## Mini example

Source: `[SRC-003] Customers phone us to reorder the same parts every month. It must take two clicks.`

```yaml
- id: REQ-0001
  text: A signed-in customer can reorder all lines of a past order in two clicks
  sources: [SRC-003]
  priority: must
  acs:
    - { id: AC-0001, kind: happy, text: 'From "My orders", "Reorder" adds every line with the same quantities in at most 2 clicks' }
    - { id: AC-0002, kind: edge, text: 'A discontinued part is skipped and the message "1 item could not be added" names it' }
```

The phoning paragraph is not a separate requirement — it is the requirement's context, cited by it.
