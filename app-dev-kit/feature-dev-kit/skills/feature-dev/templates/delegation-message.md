# Template — Delegation Message

The exact briefing the orchestrator sends to a worker agent (Stations 3–8). Every field is
mandatory; a missing field is how workers duplicate or overshoot each other's work.

```
OBJECTIVE:  ⟨one sentence — what this worker must produce⟩
SLUG:       ⟨feature-slug⟩
SPEC:       .spec/features/⟨slug⟩.md
SPEC_SECTIONS:
  read:     ⟨exact section headers this worker needs — nothing more⟩
  write:    ⟨exact section headers this worker will update⟩
TARGET:     ⟨layer⟩/⟨slice⟩ — segments: ⟨ui|model|api|lib|config⟩
CHECKPOINT: .spec/features/⟨slug⟩.context/orchestrator-checkpoint.md
APPLY:      skill: ⟨one skill name⟩
BOUNDARY:   create/modify only under src/⟨layer⟩/⟨slice⟩/ and its index.ts;
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
SPEC:       .spec/features/decline-profile.md
SPEC_SECTIONS:
  read:     ## API contract / Data model, ## Dependencies
  write:    ## Build plan (entities rows), ## Gate log
CHECKPOINT: .spec/features/decline-profile.context/orchestrator-checkpoint.md
TARGET:     entities/profile — segments: api
APPLY:      skill: create-entity
BOUNDARY:   create/modify only under src/entities/profile/api/;
            do NOT modify src/entities/profile/index.ts — the orchestrator wires the public API
KIT_DIR:    ⟨plugin root⟩
RETURN:     HANDOFF: .spec/features/decline-profile.context/entities-engineer-4.md
            CONTAINS: one line
```

---

## Field rules

| Field | Rule |
|-------|------|
| `OBJECTIVE` | One sentence, one deliverable. Two sentences means two workers. |
| `SPEC_SECTIONS` | Named headers only. "The spec" is not an allowlist — see `references/context-budget.md`. |
| `TARGET` | Exactly one slice. |
| `APPLY` | One skill. Do not name rule files or the pipeline references. |
| `BOUNDARY` | Always state what must **not** be touched, especially shared files two workers might both edit. |
| `RETURN` | `HANDOFF` path plus one `CONTAINS` line. The detail is the file. |

## Sequential dispatch

Slices in one layer are dispatched one after another on the feature branch, each with its own
slice-scoped `SPEC_SECTIONS`. Do not spawn them in one parallel message and do not use a git worktree.
