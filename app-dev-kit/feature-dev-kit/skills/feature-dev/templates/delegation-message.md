# Template — Delegation Message

The exact briefing the orchestrator sends to a worker agent (Stations 3–8). Every field is
mandatory; a missing field is how workers duplicate or overshoot each other's work.

Before the spawn, write the worker's card:
`node {KIT_DIR}/skills/feature-dev/scripts/board.mjs card .spec/features/⟨slug⟩.md --row ⟨n⟩[,⟨m⟩] --agent ⟨agent⟩`
(prints `{"card": path, "bytes", "board_bytes"}`).

```
OBJECTIVE:  ⟨one sentence — what this worker must produce⟩
SLUG:       ⟨feature-slug⟩
CARD:       .spec/features/⟨slug⟩.context/cards/row-⟨n⟩.md   — read this, not the blackboard
WRITE_BACK: board.mjs row … --row ⟨n⟩ --status done --note "⟨one line⟩"; board.mjs append … --section "Reuse Map" | "Decisions & Open Questions"
TARGET:     ⟨layer⟩/⟨slice⟩[, ⟨slice⟩…] — segments: ⟨ui|model|api|lib|config⟩
CHECKPOINT: .spec/features/⟨slug⟩.context/orchestrator-checkpoint.md
APPLY:      skill: ⟨one skill name⟩
CONTRACT:   {KIT_DIR}/skills/feature-dev/references/ui-build-contract.md
PROTOTYPE_INVENTORY: .spec/features/⟨slug⟩.context/prototype-inventory.md   (omit when absent; the card names it too)
FINDINGS:   .spec/features/⟨slug⟩.context/fix-batch-⟨k⟩.md   (Station 11 only)
BOUNDARY:   create/modify only under src/⟨layer⟩/⟨slice⟩/ (each listed slice) and its index.ts;
            import only from layers strictly below; do NOT touch ⟨excluded paths⟩
KIT_DIR:    ⟨resolved plugin root — never hardcode .spec/feature-dev-kit/⟩
RETURN:     HANDOFF: .spec/features/⟨slug⟩.context/⟨agent⟩-⟨station⟩.md
            CONTAINS: ⟨one line — files touched, gate result, open questions⟩
            Do NOT return file contents, diffs, or command output.
```

---

## Worked example

```
OBJECTIVE:  Implement the useDeclineProfile mutation hook and its query-key invalidation.
SLUG:       decline-profile
CARD:       .spec/features/decline-profile.context/cards/row-2.md
WRITE_BACK: board.mjs row .spec/features/decline-profile.md --row 2 --status done --note "…"
CHECKPOINT: .spec/features/decline-profile.context/orchestrator-checkpoint.md
TARGET:     entities/profile — segments: api
APPLY:      skill: create-entity
CONTRACT:   ⟨plugin root⟩/skills/feature-dev/references/ui-build-contract.md
BOUNDARY:   create/modify only under src/entities/profile/api/ and src/entities/profile/index.ts
            (export useDeclineProfile only — the feature imports it); do NOT touch src/shared/
KIT_DIR:    ⟨plugin root⟩
RETURN:     HANDOFF: .spec/features/decline-profile.context/entities-engineer-4.md
            CONTAINS: one line
```

---

## Field rules

| Field | Rule |
|-------|------|
| `OBJECTIVE` | One sentence, one deliverable. Two sentences means two workers — except a batch row, where one sentence names the same change for every listed slice. |
| `CARD` | Always a `board.mjs card` path. Never the blackboard path — see `references/context-budget.md`. |
| `WRITE_BACK` | `board.mjs row` for the worker's rows; `board.mjs append` for Reuse Map / Decisions. No Edit on the board. |
| `TARGET` | Exactly one slice, or the slices of one batch row / fix batch (same layer, same change). |
| `FINDINGS` | Station 11 only: the fix-batch file. One spawn per batch, never one per finding or per slice. |
| `APPLY` | One skill. Do not name rule files or the pipeline references. |
| `CONTRACT` | Always `ui-build-contract.md` for Stations 3–8 — the checklist the conventions gate and reviewer enforce. |
| `PROTOTYPE_INVENTORY` | Pass to every worker that renders UI when the file exists. |
| `BOUNDARY` | Always state what must **not** be touched, especially shared files two workers might both edit. |
| `RETURN` | `HANDOFF` path plus one `CONTAINS` line, as the worker's final message. The detail is the file. |

## Sequential dispatch

Rows in one layer are dispatched one after another on the feature branch, each with its own card.
Do not spawn them in one parallel message and do not use a git worktree.
