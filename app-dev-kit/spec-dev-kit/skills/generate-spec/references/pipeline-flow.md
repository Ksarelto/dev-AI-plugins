# Pipeline Flow — Spec Dev Kit (CANONICAL)

**Orchestrated by**: `spec-orchestrator` (subagent)
**Invoked by**: the `generate-spec` skill (`SKILL.md`) — **this skill owns every human gate**

> This file is the **single source of truth** for station numbering, ordering, loop guards, and
> ownership. `SKILL.md`, `spec-orchestrator.md`, and every agent header reference stations by the
> numbers defined here — they must never re-define the order locally. If another file disagrees with
> this one, this file wins.

---

## The Four Non-Negotiable Principles

1. **The spec is the single source of truth** — diagrams and YAML both derive from the spec, never
   the reverse. If a diagram contradicts the spec, the spec wins.
2. **No silent decisions** — every assumption and conflict resolution is surfaced to the user.
3. **Nothing enters the YAML unsourced** — every requirement links to a source file or is logged as
   an explicit `assumptions[]` entry.
4. **Nothing leaves without validation** — the schema gate is a hard gate. Malformed YAML never
   leaves the kit. The gate is **deterministic** (`scripts/validate-spec.mjs`), not probabilistic.

---

## Ownership invariants (P0 — do not drift)

- **`AskUserQuestion` has exactly one owner: the `generate-spec` skill.** It runs in the main
  conversation. The orchestrator is a subagent; a subagent prompt never reaches the user, so an
  in-agent gate would silently self-approve. `spec-interrogator` and `spec-review-facilitator`
  return structured packets; the orchestrator wraps them (`CLARIFY_PACKET` / `REVIEW_PACKET` /
  `ESCALATION_PACKET`) and **stops**. No agent holds `AskUserQuestion` in its tool list.
- **Output path is fixed everywhere**: `.spec/app/spec-{timecode}_{slug}/spec.md`.
- **Status lifecycle**: the synthesizer emits `status: reviewing` — never `approved`. Only human
  approval at Station 9 unlocks `approved`, which the **skill** sets at Station 10 (publish).
- **Diagrams derive from a validated spec**: Station 8 runs only after Station 7 passes.
- **Orchestrator has no `Write` / `Edit`.** Workers persist their own artifacts. The skill writes
  `intake.json`, `qa-log.md`, and the approved `spec.md`.
- **Scripts run from `{KIT_DIR}`**, never a hardcoded `.spec/spec-dev-kit/` path. The skill
  resolves `KIT_DIR` (plugin root).

---

## Canonical Station Map

| # | Station | Owner | Model / Effort | Notes |
|---|---------|-------|----------------|-------|
| 0 | Context discovery + naming | **skill** | — | globs `.spec/context/*.md`, freezes timecode, derives slug, scaffolds run dir via `{KIT_DIR}/skills/generate-spec/scripts/new-run.sh` |
| 1 | Intake & normalize | **skill** | — | reads + normalizes context files per `references/context-protocol.md`; writes `artifacts/intake.json` |
| 2 | Gap & conflict analysis | `spec-analyst` | sonnet / **xhigh** (`effort: xhigh`) | writes `artifacts/analysis.json` |
| 2a | Clarification questions | `spec-interrogator` → **skill** asks | sonnet / **xhigh** | interrogator returns `questions[]`; orchestrator returns `CLARIFY_PACKET`; skill calls `AskUserQuestion` |
| 2b | Re-analysis | `spec-analyst` | sonnet / **xhigh** | folds answers back in; skill re-spawns orchestrator `MODE: resume` |
| 3 | Pre-enrich gate | orchestrator | opus | **blocking-gap check BEFORE enrichment** |
| 4 | Enrichment | `spec-enricher` | sonnet / **xhigh** | writes `artifacts/enriched.json` |
| 5 | Completeness gate | `spec-completeness` | haiku | writes `artifacts/completeness.json`; `< 85` → analysis re-entry → `CLARIFY_PACKET` |
| 6 | Synthesis | `spec-synthesizer` | sonnet / **xhigh** | writes `{RUN_DIR}/spec.md`; `status: reviewing` |
| 7 | Validation gate | orchestrator + `validate-spec.mjs` | — | Bash; on fail ×2 return `ESCALATION_PACKET` |
| 8 | Diagram generation | `spec-diagram` | sonnet | patches `## Visual Reference` in `spec.md` |
| 9 | Review loop (HARD STOP) | `spec-review-facilitator` → **skill** asks | sonnet | orchestrator returns `REVIEW_PACKET`; skill asks; `MODE: revise` to apply |
| 10 | Publish | **skill** | — | sets `status: approved` in `{RUN_DIR}/spec.md` |

**xhigh effort** lives in agent frontmatter (`effort: xhigh`). Do **not** pass Claude-only
`thinking: { budget_tokens }` into the Agent tool. Cursor maps high effort via
`model: …[effort=high]` when a consumer pins a Cursor model id; plugin files use `sonnet`/`opus`/`haiku`.

---

## Orchestrator modes

| MODE | Runs | Stops with |
|------|------|------------|
| `build` | Station 2 onward until a human gate | `CLARIFY_PACKET` / `REVIEW_PACKET` / `ESCALATION_PACKET` / `READY_TO_PUBLISH` |
| `resume` | `RESUME_AT` (`2b` \| `3` \| `5` \| `7`) with `NEW_ANSWERS` | same |
| `revise` | Station 9 apply (+ Station 8 if structural) | `REVIEW_PACKET` (delta) / `READY_TO_PUBLISH` / `ESCALATION_PACKET` |

---

## Clarification Loop (Stations 2 → 2a → 2b)

```
Station 2: ANALYSIS (spec-analyst writes analysis.json)
    gap_score ≤ 25 AND no conflicts ──────────────► EXIT to Station 3
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

**Exit**: `gap_score ≤ 25` AND `conflicts.length === 0`.
**Override**: after 3 rounds, remaining gaps become `assumptions[]`.

---

## Pre-Enrich Gate (Station 3)

Runs **before** enrichment. The orchestrator verifies:

- Every `analysis_report.gaps[]` with `severity: high` AND `blocks_synthesis: true` is either
  `status: resolved` OR `can_assume_default: true`.
- If a blocking gap is neither AND clarification rounds remain → `CLARIFY_PACKET` (one more 2a).

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
   exit 0 ? ──► EXIT to Station 8
   │ (exit 1)
   attempt < 2 ? ──YES──► Station 6 correction → back to 7
   │ (≥ 2)
   ESCALATION_PACKET → skill AskUserQuestion
```

Structural errors come from the script. Semantic quality is Station 9.

---

## Review Loop (Station 9 — HARD STOP)

The facilitator **composes**; the **skill** asks.

```
Station 9 compose → REVIEW_PACKET → skill AskUserQuestion
   approved ? ──► READY_TO_PUBLISH → skill Station 10
   │ (changes)
   skill re-spawns MODE: revise + CHANGE_REQUEST
   facilitator apply; if structural → Station 8 delta
   cycle < 3 ? ──YES──► REVIEW_PACKET (delta only)
   │ (≥ 3) ESCALATION_PACKET (approve-as-is / drop / replace)
```

**Exit**: explicit user approval (`clarification-protocol.md` § Restate & Confirm). New scope in
review goes to `open-questions[]`.

---

## Key Ordering Rules

1. **Ask before enriching** — Station 3 precedes Station 4.
2. **Completeness loops back to Analysis**, not directly to the interrogator.
3. **Diagrams after validation** — Station 8 follows a green Station 7.
4. **Review shows deltas** — full re-reads on cycle 2+ are forbidden.
5. **Schema first** — `references/spec-schema.md` defines "complete".

---

## Artifact Handoffs & Persistence

Workers (and the skill) persist stage output so later stages read **paths**, not prompt blobs
(see `references/context-budget.md`).

```
.spec/app/spec-{tc}_{slug}/
  spec.md                      ← synthesizer writes (reviewing); skill sets approved
  artifacts/
    intake.json                ← Station 1 (skill)
    analysis.json              ← spec-analyst (overwritten per round)
    completeness.json          ← spec-completeness
    qa-log.md                  ← skill, every AskUserQuestion round (## Round {n})
    enriched.json              ← spec-enricher
```

---

## Parallel Execution Points

| Point | Runs in parallel | Why safe |
|-------|------------------|----------|
| Station 0 → 1 | slug derivation + context-file read/normalize | independent; both finish before Station 2 |
| *(none other)* | — | Stations 2–10 have hard data dependencies |

Do **not** fan-out Stations 2–10. Do **not** run Station 8 before Station 7.

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

After the spec is published at `.spec/app/spec-{tc}_{slug}/spec.md`:

- **feature-dev-kit** (station 0): `Glob(".spec/app/spec-*_{slug}/spec.md")` → latest timecode;
  pre-populate the feature blackboard (skips duplicate clarification).
- **html-generator-kit** (`/generate-html`): same glob; read `ui-surface.screens[]` and `entities[]`.
