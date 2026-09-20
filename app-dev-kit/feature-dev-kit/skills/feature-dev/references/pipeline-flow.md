# Pipeline Flow — feature-dev-kit

**CANONICAL station map. Single source of truth.** Every agent reads this before starting a station.
Where any other file disagrees with this one, this file wins.

`KIT_DIR` is the **plugin root** (the directory that contains `agents/` and `skills/`). The
`feature-dev` skill resolves it. Scripts and references are `{KIT_DIR}/skills/feature-dev/…`.
Never hardcode `.spec/feature-dev-kit/`.

Station *contracts* (delegation format, retry policy) live in `orchestration-protocol.md`.
Gate *commands and thresholds* live in `quality-gates.md`. Packets live in `packets.md`.
The nested implement → typecheck → test loop lives in `development-cycle.md` + `increment-protocol.md`.
This file owns **order, gates, and loop guards**.

---

## Station Sequence

```
── feature-dev skill (main loop — owns every human gate) ──────────
Resolve KIT_DIR
Station 0    Intake — upstream-interpreter (scoped YAML) then spec-analyst
             → .spec/features/<slug>.md  (CLARIFY_PACKET if gaps)
      ↓
Station 0.5  🧑 SPEC APPROVAL GATE — human confirms acceptance criteria
      ↓
  ⇢ spawn feature-orchestrator (MODE: build)
──────────────────────────────────────────────────────────────────

── feature-orchestrator subagent (MODE: build) ────────────────────
Station 1    Discovery (code-explorer)                  → FSD impact + Reuse map
      ↓
Station 1.5  Baseline architecture-audit (architecture-auditor, REPORT_ONLY)  → ## Architecture Baseline
      ↓
Station 1a   Investigation (research-analyst)           ← CONDITIONAL
      ↓
Station 1b   ⇢ RETURN DEP_PACKET to the skill           ← HARD STOP if any new package
      ↓
Station 2    Planning (orchestrator, blackboard only)   ← GATE: build-plan
      ↓
Station 3    shared/      (shared-engineer)             ← GATE: layer-green
      ↓
Station 4    entities/    (entities-engineer × N)       ← PARALLEL · GATE: layer-green
      ↓
Station 5    features/    (features-engineer × N)       ← PARALLEL · GATE: layer-green
      ↓
Station 6    widgets/ + pages/ (composition-engineer)   ← PARALLEL · GATE: layer-green
      ↓
Station 7    app/         (app-engineer)                ← GATE: layer-green
      ↓
Station 8    Tests (test-engineer × layer group)        ← GATE: coverage
      ↓
Station 9    Full gate sweep (quality-gate-runner)      ← GATE: all-green
      ↓
Station 9.5  Architecture-audit changed paths (architecture-auditor, REPORT_ONLY) ← GATE: architecture-clean
      ↓
Station 10   Auto-review (code-reviewer)                ← GATE: review-clean
      ↓
Station 11   Fix loop (owning engineer)                 ← max 3 iterations per gate
      ↓
  ⇢ RETURN REVIEW_PACKET or ESCALATION_PACKET to the feature-dev skill, then STOP
──────────────────────────────────────────────────────────────────

── feature-dev skill (main loop) ──────────────────────────────────
Station 12   🧑 HUMAN REVIEW GATE (max 3 cycles)
  • Approve         → status: done (human-only transition); tell the human to run /create-pr
  • Request changes → re-spawn orchestrator MODE: revise → new packet → repeat
  • Abort           → stop; branch stays as-is
──────────────────────────────────────────────────────────────────

── human, separately ──────────────────────────────────────────────
/create-pr   Never invoked by any agent (disable-model-invocation: true)
──────────────────────────────────────────────────────────────────
```

**Why every human gate is skill-owned:** the orchestrator is a subagent, and a subagent's
`AskUserQuestion` never reaches the real user — an in-agent gate would silently self-approve. Only
the skill runs in the main conversation loop, so only it can truly pause. The orchestrator *returns
a packet*; it never asks.

**Packets:** `CLARIFY_PACKET`, `DEP_PACKET`, `REVIEW_PACKET`, `ESCALATION_PACKET` — see `packets.md`.

**Small-scope heuristic:** 1–2 slices in a single layer → one `slice-engineer` (parameterised
`LAYER` + `SLICE`) instead of three layer workers. APPLY names the matching `create-*` skill
(`slice-engineer.md`).

---

## Gates

| Gate | Station | Condition | On failure |
|------|---------|-----------|-----------|
| `spec-approved` | 0.5→1 | Human confirms acceptance criteria; spec status `approved` | STOP — back to spec-analyst for another clarification round |
| `dep-approved` | 1b→2 | Every package in `## Dependencies` marked human-approved | HARD STOP — orchestrator returns DEP_PACKET and halts |
| `build-plan` | 2→3 | Build plan written, every affected slice assigned, parallel groups marked | STOP — re-run Station 1 discovery |
| `layer-green` | 3–7 | typecheck + lint + FSD boundaries pass for the layer just built | Fix loop (Station 11) — never build the next layer on a red gate |
| `coverage` | 8→9 | Thresholds in `quality-gates.md` met; every acceptance criterion has a test | Route uncovered paths back to `test-engineer` |
| `all-green` | 9→9.5 | Full gate sweep passes from gate #1 | Fix loop |
| `architecture-clean` | 9.5→10 | `architecture-auditor` REPORT_ONLY: zero hard violations on changed paths + importers | Fix loop (owning engineer). Missing agent/companion skill → ESCALATION_PACKET |
| `review-clean` | 10→11 | No `[CRITICAL]`; no unresolved `[IMPORTANT]` | Route each finding to the owning engineer |
| `human-approved` | 12 | Human replies `approve` | Skill sets `status: done`. Request-changes → `MODE: revise`. Never merge, never open a PR |

**Gate bypass is never allowed.** A gate that "would probably pass" has not passed. After any fix,
re-run the gate sequence **from gate #1** — targeted re-runs miss regressions the fix introduced.

Station 1.5 (baseline audit) is not a hard fail for the whole tree: hard violations **on files this
feature will touch** escalate; unrelated legacy issues go to `## Architecture Baseline` as notes.

---

## Loop Guards

| Loop | Location | Max cycles | Exit condition | On exceed |
|------|----------|-----------|----------------|-----------|
| Clarification | Station 0 | 3 rounds | Acceptance criteria unambiguous and testable | Remaining unknowns → `## Decisions & Open Questions`; ask the human to decide |
| Fix loop (per gate) | Station 11 | 3 attempts | The failing gate passes | Escalate: append gate log to spec, status `awaiting-human`, ESCALATION_PACKET |
| Coverage loop | Station 8 | 2 attempts | Thresholds met | Escalate — never game coverage with assertion-free tests |
| Auto-review loop | Station 10 | 2 attempts | No CRITICAL / unresolved IMPORTANT | Escalate with the finding list |
| Human review | Station 12 (skill) | 3 cycles | Human approves | Ask: accept-as-is, keep iterating, or abort |

Escalation is a **success path**, not a failure. Three failed attempts on the same gate means the
spec or the plan is wrong, and more attempts will not discover that.

---

## Parallelism Rules

### Parallel by default (stations 4, 5, 6)

Independent slices inside one layer are spawned **in a single message**. Sequential spawning
serializes execution and defeats the point.

| Station | Parallel unit | Isolation |
|---------|--------------|-----------|
| 4 | one `entities-engineer` per entity slice | `isolation: worktree` |
| 5 | one `features-engineer` per feature slice | `isolation: worktree` |
| 6 | one `composition-engineer` per widget/page | `isolation: worktree` |

Two slices are independent only when neither imports the other and they share no files. A slice
pair that both edit `shared/config/textContent.ts` is **not** independent — sequence them.

### Strictly sequential (stations 1, 1.5, 2, 3, 7, 8, 9, 9.5, 10)

The FSD layer order *is* the dependency order: each layer's imports must already exist. Never start
a layer before the layer below it is green. Architecture-audit and auto-review are sequential
because they read the whole diff.

### Worker-count heuristic (scale effort to complexity)

| Scope | Strategy |
|-------|----------|
| Copy/text tweak, 1 file | No orchestrator. Run the authoring skill inline. |
| 1–2 slices, single layer | One consolidated `slice-engineer` for all segments |
| 3–5 slices across 2 layers | One engineer per layer group |
| 6+ slices or cross-cutting | One parallel engineer per slice, worktree-isolated |

Spawning five agents for a two-file change costs more than it saves.

---

## Context Passing Rules

Each agent receives **only** the spec sections it needs — never the whole upstream app spec, never
raw diffs, never another worker's file list. The per-agent allowlist and size guards live in
`context-budget.md`; that file is binding. Upstream YAML filtering is in `upstream-contract.md`.

| Agent | Receives |
|-------|----------|
| `upstream-interpreter` | `UPSTREAM_SPEC` path + `SCREEN_REF` / `AC_REFS` / `ENTITY_REFS` / `PROTOTYPE_REF` — never spec body |
| `spec-analyst` | Raw request + compact slice from upstream-interpreter (or standalone request) |
| `code-explorer` | Acceptance criteria + Request |
| `research-analyst` | The capability gap only — not the build plan |
| `shared-engineer` | Dependencies, Reuse map, Build plan (shared rows) |
| `entities-engineer` | API contract, Data model, Build plan (its entity rows) |
| `features-engineer` | UI surface (its interaction), Build plan (its feature rows) |
| `composition-engineer` | UI surface (its screen), Reuse map, Build plan (its rows), prototype-page path if any |
| `app-engineer` | UI surface (route map), Build plan (app row) |
| `slice-engineer` | The one LAYER + SLICE it was parameterised with, plus that row's spec sections |
| `test-engineer` | Acceptance criteria + `SLICE_PATHS` for one layer group |
| `quality-gate-runner` | Gate log section only |
| `architecture-auditor` | `MODE` + scope (FSD Impact or changed-file list). Returns report markdown; hub writes the blackboard |
| `code-reviewer` | Changed-file **list** — it reads diffs itself, per file. No FSD architecture-audit references — those ran at 9.5 |

---

## Revise Re-entry Points

When the human requests changes at Station 12, the orchestrator re-enters at the **lowest** station
the change touches, then replays every station above it.

| Change type | Re-entry | Cascade |
|-------------|----------|---------|
| Copy, label, or text content | Station 6 (target page/widget) | Re-run 8–10 (including 9.5) |
| Styling / component variant | Station 3 if `shared/ui`, else the owning slice's station | Re-run from that layer up |
| Interaction behaviour | Station 5 (target feature slice) | Re-run 6–10 |
| API contract or data shape | Station 4 (entity slice) | Re-run 5–10 — everything above depends on it |
| New route / navigation | Station 7 | Re-run 8–10 |
| Architecture-audit hard violation | Station 9.5 after the owning engineer fixes | Re-run 9–10 |
| Acceptance criteria changed | Station 0 | Full re-plan; the spec changed, so the plan is stale |

Always re-run Stations 9, 9.5, and 10 before returning a new REVIEW_PACKET. A revision that skips
the gate sweep is how a "small fix" ships a type error.

---

## Anti-Patterns

| Never | Why |
|-------|-----|
| Orchestrator calls `AskUserQuestion` | Subagent prompts never reach the user — the gate self-approves silently |
| Orchestrator edits files under `src/` | It is a coordinator; direct edits bypass the boundary contract workers are held to |
| Build the next layer on a red gate | Every later layer inherits the defect and multiplies the fix cost |
| Pass raw `git diff` to `code-reviewer` | Reviewer prompt grows linearly with feature size; use the file list |
| Pass the full app spec body to the hub | Context overflow; one run is one screen-task (`upstream-contract.md`) |
| Spawn parallel workers in separate messages | Serializes them; no speedup, same token cost |
| Loop a failing gate more than 3× | Repeated failure is a spec/plan problem, not an effort problem |
| Any agent runs `/create-pr`, `git push`, or merges | Shipping is human-only, by construction |
| Skip architecture-audit because Steiger passed | Steiger is mechanical import direction; `architecture-auditor` checks segments, public APIs, query keys |
| Re-plan from scratch on a copy tweak | Route to the lowest re-entry station instead |
