# Completeness Checklist — Source Fidelity + 10 Categories

**Used by**: `spec-completeness` (Station 5 category credits), `scripts/score-completeness.mjs`
(fidelity, score, gate), `spec-analyst` (gap detection), `spec-interrogator` (targeted questions)

Part 1 and the score formula are computed by `score-completeness.mjs`. The agent only judges each
category's credit level into `artifacts/completeness-credits.json`.

The gate has two parts. **Both** must pass:

1. **Source fidelity** — nothing the source states was dropped on the way into `enriched.json`.
2. **Category score ≥ 85** — the 10 categories research shows are most often missing.

The final, deterministic coverage check (every `must` requirement covered by an AC, rule, or other
item) runs later in `validate-spec.mjs` (`REQUIREMENT_UNCOVERED`). This gate catches losses early,
while they can still be fixed by enrichment instead of by a failed validation.

---

## Part 1 — Source fidelity

For every `intake.json` `raw_requirements[].id`, at least one `enriched.requirements[]` entry lists
it in `intake_refs`. Any id with no entry goes to `unmapped_source_requirements[]` (id + text).
`unmapped_source_requirements` non-empty → `gate_passes: false`, whatever the score.

Also check, and list under `fidelity_warnings[]`:

- a stated number (limit, timer, retention) that is in no `business_rules[].params` or entity `retention`;
- an assumption whose text matches a stated requirement (it should be the requirement);
- more than ~60 assumptions (conventions or over-splitting — see the enricher's limits).

---

## Part 2 — Category scoring

Each category has a weight; total 100. Score on **evidence in `enriched.json`**, not on mentions.

| # | Category | Weight | Full credit when (evidence) |
|---|----------|--------|-----------------------------|
| 1 | Error States | 15 | every user action (story candidate) has a failure requirement or rule with an `on_violation` / error outcome |
| 2 | Permissions & Roles | 15 | `roles[]` + a `permissions[]` row for every role-restricted action, incl. denied behaviour |
| 3 | Edge Cases | 12 | every source edge-case row is a requirement; boundaries for dates, sizes, concurrency, offline are stated |
| 4 | Non-Functional | 12 | performance, security, and accessibility each have ≥ 1 measurable constraint |
| 5 | Backward Compatibility | 8 | impact on existing users/data/APIs assessed, migration noted if breaking |
| 6 | Undo / Rollback | 8 | destructive actions have a confirmation or a reverse path stated |
| 7 | Notifications | 8 | `notifications[]` covers every notified event with recipients and copy |
| 8 | Data Lifecycle | 8 | each primary entity has create / update / archive-or-delete and `retention` where stated; lifecycle fields have `state_machines[]` |
| 9 | Observability | 7 | auditable events and their fields are named |
| 10 | Localization & Accessibility | 7 | language(s), date/number format, and a11y level are stated |

**Credit levels**: full = the evidence above; partial = half the weight (rounded down) when some
but not all of it exists; none = 0.

**Assumed ≠ stated**: a category whose evidence comes *only* from `assumptions[]` gets **partial**
credit at most.

**Not applicable**: a category that genuinely does not apply (e.g. Backward Compatibility for a
greenfield product with no existing users or data) is `credit: "n/a"`; its weight is removed and
the score is re-normalised to 100. `n/a` needs a one-line `reason`; never use it to skip work.

```
applicable   = categories where credit != "n/a"
score        = round(100 × Σ awarded / Σ weight(applicable))
gate_passes  = score >= 85 AND unmapped_source_requirements is empty
```

---

## Output (`artifacts/completeness.json`)

```json
{
  "completeness_score": 88,
  "gate_passes": false,
  "unmapped_source_requirements": [{ "id": "R-041", "text": "Listings are retired 14 days after move-out if not transferred" }],
  "fidelity_warnings": ["Notification table has 11 rows; enriched.notifications has 7"],
  "category_scores": {
    "error_states": { "awarded": 15, "max": 15, "credit": "full", "evidence": "BR-001..BR-009 on_violation; REQ-040..REQ-052" },
    "backward_compatibility": { "awarded": 0, "max": 8, "credit": "n/a", "reason": "greenfield, no existing users or data" }
  },
  "missing_categories": [{ "category": "Notifications", "weight": 8, "gap_description": "…", "example_question": "…" }],
  "partial_categories": []
}
```
