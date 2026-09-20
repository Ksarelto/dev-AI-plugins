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
APPLY:      references/development-cycle.md, references/increment-protocol.md, references/⟨file⟩.md, {KIT_DIR}/rules/⟨file⟩.md; skill: ⟨skill-name⟩
BOUNDARY:   create/modify only under src/⟨layer⟩/⟨slice⟩/ and its index.ts;
            import only from layers strictly below; do NOT touch ⟨excluded paths⟩
KIT_DIR:    ⟨resolved plugin root — never hardcode .spec/feature-dev-kit/⟩
RETURN:     summary (≤10 lines) + list of files created/modified + the spec sections you updated.
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
TARGET:     entities/profile — segments: api
APPLY:      references/development-cycle.md, references/increment-protocol.md,
            references/fsd-architecture.md, references/fsd-import-boundaries.md,
            {KIT_DIR}/rules/tanstack-query-v5.mdc, {KIT_DIR}/rules/typescript-patterns.mdc
BOUNDARY:   create/modify only under src/entities/profile/api/;
            do NOT modify src/entities/profile/index.ts — the orchestrator wires the public API
KIT_DIR:    ⟨plugin root⟩
RETURN:     summary + file list + updated spec sections
```

---

## Field rules

| Field | Rule |
|-------|------|
| `OBJECTIVE` | One sentence, one deliverable. Two sentences means two workers. |
| `SPEC_SECTIONS` | Named headers only. "The spec" is not an allowlist — see `references/context-budget.md`. |
| `TARGET` | Exactly one slice. A worker spanning two slices cannot be worktree-isolated. |
| `APPLY` | Name the files. "Follow the conventions" loads nothing. |
| `BOUNDARY` | Always state what must **not** be touched, especially shared files two workers might both edit. |
| `RETURN` | Summary and paths only. Raw output in a return value is what floods the orchestrator's context. |

## Parallel dispatch

Independent slices in one layer are dispatched in a **single message**, one delegation block per
worker, each with its own slice-scoped `SPEC_SECTIONS`. Never inline every slice's sections into
every worker — parallel workers should not know about each other's files.
