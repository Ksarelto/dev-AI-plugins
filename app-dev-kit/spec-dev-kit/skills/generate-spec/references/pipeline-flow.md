# Pipeline Flow — Spec Dev Kit (CANONICAL)

**Orchestrated by**: `spec-orchestrator` (subagent)
**Invoked by**: the `generate-spec` skill (`SKILL.md`) — **this skill owns every human gate**

> This file is the **single source of truth** for station numbering, ordering, loop guards, and
> ownership. `SKILL.md`, `spec-orchestrator.md`, and every agent header reference stations by the
> numbers defined here — they must never re-define the order locally. If another file disagrees with
> this one, this file wins.

---

## The Five Non-Negotiable Principles

1. **The spec is the single source of truth** — diagrams and YAML both derive from the spec, never
   the reverse. If a diagram contradicts the spec, the spec wins.
2. **No silent decisions** — every assumption and conflict resolution is surfaced to the user.
3. **Nothing enters the YAML unsourced, and nothing stated is lost** — every stated rule becomes a
   `requirements[]` entry with `source-ref: file#Lline` and `covered-by` ids; every inference is an
   explicit `assumptions[]` entry. `validate-spec.mjs` fails a `must` requirement with no coverage.
5. **One home per fact** — each item is written once and referenced by id. The body never restates
   the YAML; human tables are generated (`render-spec-views.mjs`).
4. **Nothing leaves without validation** — the schema gate is a hard gate. Malformed YAML never
   leaves the kit. The gate is **deterministic** (`scripts/validate-spec.mjs`), not probabilistic.

---

## Ownership invariants (P0 — do not drift)

- **`AskUserQuestion` has exactly one owner: the `generate-spec` skill.** It runs in the main
  conversation. The orchestrator is a subagent; a subagent prompt never reaches the user, so an
  in-agent gate would silently self-approve. `spec-interrogator` and `spec-review-facilitator`
  return structured packets; the orchestrator wraps them (`CLARIFY_PACKET` / `REVIEW_PACKET` /
  `ESCALATION_PACKET`) and **stops**. No agent holds `AskUserQuestion` in its tool list.
- **Output path is fixed everywhere**: `.spec/spec/spec-{timecode}_{slug}/spec.md`. The shared pointer is `.spec/app/current.json` (`references/app-state.md`).
- **Status lifecycle**: the synthesizer emits `status: reviewing` — never `approved`. Only human
  approval at Station 9 unlocks `approved`, which the **skill** sets at Station 10 (publish).
- **Diagrams derive from a validated spec**: `render-spec-views.mjs` draws them at Station 9, after Station 7 passes.
- **Orchestrator has no `Write` / `Edit`.** Workers persist their own artifacts. The skill writes
  `intake.json`, `qa-log.md`, and the approved `spec.md`.
- **Scripts run from `{KIT_DIR}`**, never a hardcoded `.spec/spec-dev-kit/` path. The skill
  resolves `KIT_DIR` (plugin root).

---

## Canonical Station Map

| # | Station | Owner | Model / Effort | Notes |
|---|---------|-------|----------------|-------|
| 0 | Context discovery + naming | **skill** | — | globs `.spec/context/*.md` only, freezes timecode, scaffolds `.spec/spec/` via `continue-spec.mjs` (copies the last spec when `current.json` exists) |
| 1 | Intake & normalize | **skill** + `extract-intake.mjs` | — | script does the **atomic** split per `references/context-protocol.md` (every rule, number, and table row is one `raw_requirements` entry) into `artifacts/intake.json`; the skill adds only type hint, entities, roles, conflicts, drift |
| 2 | Gap & conflict analysis | `spec-analyst` | sonnet / **xhigh** (`effort: xhigh`) | writes `artifacts/analysis.json` |
| 2a | Clarification questions | `spec-interrogator` → **skill** asks | sonnet | interrogator returns `questions[]`; orchestrator returns `CLARIFY_PACKET`; skill calls `AskUserQuestion` |
| 2b | Re-analysis | `spec-analyst` | sonnet / **xhigh** | folds answers back in; skill re-spawns orchestrator `MODE: resume` |
| 3 | Pre-enrich gate | orchestrator + `gate-check.mjs` | — | **blocking-gap check BEFORE enrichment** (same script as the Station 2 exit) |
| 4 | Enrichment | `build-enriched.mjs` + `spec-enricher` | sonnet / **xhigh** | script seeds one REQ per intake entry; agent writes only edits + other sections (`enriched.patch.json`); script merges into `artifacts/enriched.json` |
| 5 | Completeness gate | `spec-completeness` + `score-completeness.mjs` | haiku | agent judges category credits (`completeness-credits.json`); script computes **source fidelity** (every intake requirement carried into `enriched.json`), score, and `gate_passes` into `artifacts/completeness.json`; fail → analysis re-entry → `CLARIFY_PACKET` |
| 6 | Synthesis | `spec-synthesizer` | sonnet / **xhigh** | schema 2.0 incl. `requirements`, `roles`, `permissions`, `business-rules`, `state-machines`, `notifications`, and the `delivery-plan`; first run writes `spec.md`; a continued run writes `artifacts/delta.yaml`, then `merge-spec.mjs` writes `spec.md`. `status: reviewing` |
| 7 | Validation gate | orchestrator + `validate-spec.mjs` | — | Bash; structure + contract quality + coverage + delivery plan (rule codes in `spec-schema.md`); on fail ×2 return `ESCALATION_PACKET` |
| 8 | Diagram generation | `render-spec-views.mjs` (run at Station 9) | — | no agent; state machines, screen navigation, API sequences, and must-story user flows as Mermaid in `spec.views.md` |
| 9 | Review loop (HARD STOP) | `render-spec-views.mjs` + `compose-review.mjs` → **skill** asks; `spec-review-facilitator` applies changes | sonnet (apply only) | scripts write `spec.views.md` and `artifacts/review-packet.md` (summary or delta, delivery plan, coverage, validator warnings); orchestrator returns `REVIEW_PACKET`; `MODE: revise` runs the facilitator apply pass |
| 10 | Publish | **skill** + `publish-spec.mjs` | — | sets `status: approved`, re-validates, renders `spec.views.md`, writes `slices/SL-NNN.yaml` briefs |

**xhigh effort** lives in agent frontmatter (`effort: xhigh`). Do **not** pass Claude-only
`thinking: { budget_tokens }` into the Agent tool. `agents/` uses Claude aliases; Cursor loads
`cursor-agents/`, generated from it with Cursor model ids by `scripts/build-cursor-agents.mjs`
(map: `scripts/model-tiers.json`).

---

## Orchestrator modes

| MODE | Runs | Stops with |
|------|------|------------|
| `build` | Station 2 onward until a human gate | `CLARIFY_PACKET` / `REVIEW_PACKET` / `ESCALATION_PACKET` / `READY_TO_PUBLISH` |
| `resume` | `RESUME_AT` (`2b` \| `3` \| `5` \| `7`) with `NEW_ANSWERS` | same |
| `revise` | Station 9 apply, then re-render views | `REVIEW_PACKET` (delta) / `READY_TO_PUBLISH` / `ESCALATION_PACKET` |

---

## Clarification Loop (Stations 2 → 2a → 2b)

```
Station 2: ANALYSIS (spec-analyst writes analysis.json)
    gate-check.mjs analysis.json --round N
    decision PROCEED ─────────────────────────────► EXIT to Station 3
         │  (else)
         ▼
    Station 2a: INTERROGATION
      interrogator returns questions[] (batched)
      orchestrator returns CLARIFY_PACKET ──────► skill AskUserQuestion
         │  (skill appends qa-log.md, re-spawns MODE: resume, RESUME_AT: 2b)
         ▼
    Station 2b: RE-ANALYSIS
      round_count < 3 ? ──YES──► back to the decision at Station 2
         │ (round_count ≥ 3)
         ▼
      remaining gaps → assumptions (requires-confirmation: true) → EXIT Station 3
```

**Exit** is decided by `scripts/gate-check.mjs`, never by the orchestrator's judgement. It
recomputes the score from `analysis.json` gaps and returns:

| Decision | When | Next |
|----------|------|------|
| `ASK` | an open high + `blocks_synthesis` gap (even with a default — confirm it as the Recommended option), an open conflict, or askable score > 25 | Station 2a |
| `PROCEED` | askable score ≤ 25, no blocking gap, no conflict | Station 3; assumable gaps become assumptions |
| `PROCEED_WITH_ASSUMPTIONS` | round cap (3) reached | Station 3; open askable gaps become low-confidence assumptions **and** blocking `open-questions[]` |

Assumable gaps never force a question, however many there are — they are logged as assumptions
and shown at review.

---

## Pre-Enrich Gate (Station 3)

Runs **before** enrichment. The orchestrator verifies:

- `gate-check.mjs` returns no `blocking_gaps` and no `open_conflicts`.
- If it does AND clarification rounds remain → `CLARIFY_PACKET` (one more 2a).

Only when this gate passes does Station 4 run.

---

## Completeness Loop (Station 5 → analysis re-entry)

An incomplete spec (`completeness_score < 85`) re-enters **Analysis**, not the interrogator
directly.

```
Station 5: COMPLETENESS  (score ≥ 85 ? ──► EXIT to Station 6)
   │ (< 85)
   ▼
Analyst MODE: completeness_gap_analysis → interrogator (max 4)
   orchestrator returns CLARIFY_PACKET (resume_at: 5)
   skill asks → resume: enricher update pass → Station 5 again
   │
   round < 3 ? ──YES──► back to Station 5
   │ (≥ 3) add uncovered categories to open-questions[] → EXIT Station 6
```

---

## Synthesis Correction Loop (Station 6 ↔ Station 7)

```
Station 7: node {KIT_DIR}/skills/generate-spec/scripts/validate-spec.mjs {RUN_DIR}/spec.md
   exit 0 ? ──► EXIT to Station 9 (diagrams render there)
   │ (exit 1)
   attempt < 2 ? ──YES──► Station 6 correction → back to 7
   │ (≥ 2)
   ESCALATION_PACKET → skill AskUserQuestion
```

Structural, contract-quality, coverage, and delivery-plan errors all come from the script.
Warnings (e.g. `SLICE_COVERAGE_GAP`, `STORY_TOO_BIG`, `DUPLICATE_STATEMENT`) go into the Station 9
review packet.

---

## Review Loop (Station 9 — HARD STOP)

`compose-review.mjs` **composes**; the **skill** asks; the facilitator **applies**.

```
Station 9 compose (script) → REVIEW_PACKET → skill AskUserQuestion
   approved ? ──► READY_TO_PUBLISH → skill Station 10
   │ (changes)
   skill re-spawns MODE: revise + CHANGE_REQUEST
   facilitator apply; re-render spec.views.md
   cycle < 3 ? ──YES──► REVIEW_PACKET (delta only)
   │ (≥ 3) ESCALATION_PACKET (approve-as-is / drop / replace)
```

**Exit**: explicit user approval (`clarification-protocol.md` § Restate & Confirm). New scope in
review goes to `open-questions[]`.

---

## Key Ordering Rules

1. **Ask before enriching** — Station 3 precedes Station 4.
2. **Completeness loops back to Analysis**, not directly to the interrogator.
3. **Diagrams after validation** — they render from the spec that passed Station 7.
4. **Review shows deltas** — full re-reads on cycle 2+ are forbidden.
5. **Schema first** — `references/spec-schema.md` defines "complete".

---

## Artifact Handoffs & Persistence

Workers (and the skill) persist stage output so later stages read **paths**, not prompt blobs
(see `references/context-budget.md`).

```
.spec/spec/spec-{tc}_{slug}/
  spec.md                      ← synthesizer or merge-spec.mjs (reviewing); skill sets approved
  spec.views.md                ← render-spec-views.mjs (Station 9 and publish): tables + diagrams
  slices/SL-NNN.yaml           ← write-slice-briefs.mjs (publish) — build briefs for downstream kits
  kit-result.json              ← write-kit-result.mjs
  base.spec.md                 ← copy of the previous spec when MODE=continue; not a model prompt
  artifacts/
    prior-index.json           ← continue-spec.mjs (ids + one line per existing screen)
    prior-items.yaml           ← lookup-spec.mjs, full items for modified ids
    delta.yaml                 ← synthesizer, continue runs: add, modify, and removed:
    delta.md                   ← synthesizer, only when the narrative changes
    changes.json               ← merge-spec.mjs
    intake.json                ← extract-intake.mjs + skill judgement fields (Station 1); archived at publish
    analysis.json              ← spec-analyst (overwritten per round)
    completeness-credits.json  ← spec-completeness (category credits)
    completeness.json          ← score-completeness.mjs
    qa-log.md                  ← skill, every AskUserQuestion round (## Round {n})
    review-packet.md           ← compose-review.mjs (Station 9)
    review-changes.json        ← spec-review-facilitator apply pass
    requirements.seed.json     ← build-enriched.mjs --seed; archived at publish
    enriched.patch*.json       ← spec-enricher (edits + other sections); archived at publish
    enriched.json              ← build-enriched.mjs merge; archived at publish

.spec/processed/{spec-id}/artifacts/   ← archive-context.mjs moves the four files above here after approval
```

---

## Parallel Execution Points

| Point | Runs in parallel | Why safe |
|-------|------------------|----------|
| Station 0 → 1 | slug derivation + context-file read/normalize | independent; both finish before Station 2 |
| *(none other)* | — | Stations 2–10 have hard data dependencies |

Do **not** fan-out Stations 2–10. Do **not** render views before Station 7 passes.

---

## Error Handling

| Error | Action |
|-------|--------|
| `.spec/context/` empty | **skill**: report and STOP (do not spawn orchestrator) |
| Context file unreadable | skip with warning, continue |
| gap_score never converges | after 3 rounds, remaining → assumptions, proceed |
| `validate-spec.mjs` fails ×2 | `ESCALATION_PACKET` → skill asks |
| User rejects spec ×3 | `ESCALATION_PACKET` → skill asks (approve-as-is / drop / replace) |
| Agent spawn fails | retry once, then `ESCALATION_PACKET` |

---

## Downstream Integration

After the spec is published, `.spec/app/current.json` points at `.spec/spec/spec-{tc}_{slug}/spec.md`
and the inbox has moved to `.spec/processed/{spec-id}/`.

- **html-generator-kit**, **feature-dev-kit**, **backend-dev-kit**, **agent-dev-kit**, and both
  orchestrators read `current.json` in a fresh session. They do not glob for the newest spec.
- Orchestrators plan from `delivery-plan.slices` in order and pass `SLICE_REF`. feature-dev-kit,
  backend-dev-kit, and agent-dev-kit read `slices/{SLICE_REF}.yaml`. html-generator-kit reads every
  `ui-surface.screens[]` row on the approved spec and does not read a slice brief. Field-by-field
  contract: `references/consumer-contract.md`.
