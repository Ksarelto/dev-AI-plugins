# Pipeline Flow — feature-dev-kit

**CANONICAL station map.** Where any other file disagrees with this one, this file wins.

`KIT_DIR` is the plugin root (the directory that contains `agents/` and `skills/`). Scripts and
references are `{KIT_DIR}/skills/feature-dev/…`. Never hardcode `.spec/feature-dev-kit/`.

The `feature-orchestrator` reads this file **once** at the start of a run. Workers do not. A
delegation station card is enough for a spoke. Gate commands live in `quality-gates.md`. Handoff
shape lives in `context-budget.md`.

---

## Tiers

Chosen by the `feature-dev` skill after Station 0.5, from the approved blackboard only (slice
count, new package, new route). Do not read the upstream app spec to classify.

| Tier | When | What runs |
|------|------|-----------|
| **patch** | One layer, at most two slices, no new dependency, no new route | No `feature-orchestrator`. One `slice-engineer` (no worktree), then `run-gates.sh --until fsd`. Skip Stations 1, 1.5, 1a, 8, 9 build/coverage, 9.5, and 10. Station 12 still happens. |
| **standard** | One screen, up to five slices | Spawn `feature-orchestrator` with `TIER: standard`. Skip Station 1.5. Layer gates are `--until fsd`. Build and coverage once at Station 9. `test-engineer` only if coverage fails. Station 9.5 is `DIFF_SCOPE`. |
| **full** | Six or more slices, or a new route plus a new entity | Same as standard, plus Station 1.5 scoped to `## FSD Impact` paths (not all of `src/`). Parallel worktree engineers only when a layer has two or more independent slices. One slice in a layer uses `slice-engineer`. |

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
  Classify TIER. patch → slice-engineer, then Station 12.
  standard | full → spawn feature-orchestrator (MODE: build, TIER)
──────────────────────────────────────────────────────────────────

── feature-orchestrator subagent (MODE: build) ────────────────────
Station 1    Discovery (code-explorer)                  → FSD impact + Reuse map
      ↓
Station 1.5  Baseline architecture-audit (architecture-auditor, REPORT_ONLY)  → full tier only
      ↓
Station 1a   Investigation (research-analyst)           ← CONDITIONAL
      ↓
Station 1b   ⇢ RETURN DEP_PACKET to the skill           ← HARD STOP if any new package
      ↓
Station 2    Planning (orchestrator, blackboard only)   ← GATE: build-plan
      ↓
Station 3    shared/      (shared-engineer)             ← GATE: layer-green (--until fsd)
      ↓
Station 4    entities/    (entities-engineer × N)       ← PARALLEL · GATE: layer-green
      ↓
Station 5    features/    (features-engineer × N)       ← PARALLEL · GATE: layer-green
      ↓
Station 6    widgets/ + pages/ (composition-engineer)   ← PARALLEL · GATE: layer-green
      ↓
Station 7    app/         (app-engineer)                ← GATE: layer-green
      ↓
Station 8    Tests (test-engineer × layer group)        ← only if Station 9 coverage fails
      ↓
Station 9    Full gate sweep (quality-gate-runner)      ← GATE: all-green (build + coverage once)
      ↓
Station 9.5  Architecture-audit changed paths (architecture-auditor, REPORT_ONLY, DIFF_SCOPE)
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
`AskUserQuestion` never reaches the real user. The orchestrator returns a packet; it never asks.

**Packets:** `CLARIFY_PACKET`, `DEP_PACKET`, `REVIEW_PACKET`, `ESCALATION_PACKET` — see `packets.md`.
Each packet is small JSON plus a file path. The body lives in `.spec/features/<slug>.context/`.

---

## Gates

| Gate | Station | Condition | On failure |
|------|---------|-----------|-----------|
| `spec-approved` | 0.5→1 | Human confirms acceptance criteria; spec status `approved` | STOP — back to spec-analyst |
| `dep-approved` | 1b→2 | Every package in `## Dependencies` marked human-approved | HARD STOP — `DEP_PACKET` |
| `build-plan` | 2→3 | Build plan written, every affected slice assigned | STOP — re-run Station 1 |
| `layer-green` | 3–7 | `run-gates.sh --until fsd` (types, lint, fsd) | Fix loop — never build the next layer on a red gate |
| `coverage` | 9 | Thresholds in `quality-gates.md`; every AC has a test | Spawn `test-engineer` for the failing layer group (Station 8), then re-run coverage |
| `all-green` | 9→9.5 | Full sweep, including build and coverage, once | Fix loop |
| `architecture-clean` | 9.5→10 | `architecture-auditor` REPORT_ONLY + `DIFF_SCOPE`: zero hard violations on changed paths | Fix loop. Missing agent or companion skill → `ESCALATION_PACKET` |
| `review-clean` | 10→11 | No `[CRITICAL]`; no unresolved `[IMPORTANT]` | Owning engineer |
| `human-approved` | 12 | Human replies `approve` | Skill sets `status: done` |

**Gate bypass is never allowed.** A patch run still runs `--until fsd`. It does not run `yarn build`
or `yarn test:auto`.

Station 1.5 is full tier only. Scope is the paths in `## FSD Impact` plus their importers, not `src/`.
Hard violations on those paths escalate. Unrelated legacy issues stay as notes.

After a fix, re-run the **failed** gate plus `types`. Re-run `fsd` only if the fix touched imports.
Re-run `coverage` only if the fix touched tests. Do not rebuild after a type error.

---

## Loop Guards

| Loop | Location | Max cycles | Exit condition | On exceed |
|------|----------|-----------|----------------|-----------|
| Clarification | Station 0 | 3 rounds | Acceptance criteria unambiguous and testable | Unknowns → `## Decisions & Open Questions` |
| Fix loop (per gate) | Station 11 | 3 attempts | The failing gate passes | `ESCALATION_PACKET` |
| Coverage loop | Station 8 | 2 attempts | Thresholds met | Escalate — never game coverage |
| Auto-review loop | Station 10 | 2 attempts | No CRITICAL / unresolved IMPORTANT | Escalate with the finding list |
| Human review | Station 12 (skill) | 3 cycles | Human approves | Ask: accept-as-is, keep iterating, or abort |

---

## Parallelism Rules

Independent slices inside one layer are spawned **in a single message**.

| Station | Parallel unit | Isolation |
|---------|--------------|-----------|
| 4 | one `entities-engineer` per entity slice, only when that layer has 2+ independent slices | `isolation: worktree` |
| 5 | one `features-engineer` per feature slice, only when 2+ | `isolation: worktree` |
| 6 | one `composition-engineer` per widget/page, only when 2+ | `isolation: worktree` |

A single slice in a layer uses `slice-engineer` with no worktree. Two slices that both edit
`shared/config/textContent.ts` are not independent — sequence them.

Stations 1, 1.5, 2, 3, 7, 9, 9.5, and 10 stay sequential.

---

## Context Passing Rules

Spokes return a handoff path, not a report. See `context-budget.md`.

| Agent | Receives |
|-------|----------|
| `upstream-interpreter` | `UPSTREAM_SPEC` path + ids — never spec body |
| `spec-analyst` | Compact slice path, or the standalone request |
| `code-explorer` | Acceptance criteria + Request section paths |
| `research-analyst` | The capability gap only |
| `shared-engineer` | Checkpoint path + its build-plan rows |
| `entities-engineer` | Checkpoint path + its entity rows |
| `features-engineer` | Checkpoint path + its feature rows |
| `composition-engineer` | Checkpoint path + its screen rows |
| `app-engineer` | Checkpoint path + the app row |
| `slice-engineer` | The one `LAYER` + `SLICE` |
| `test-engineer` | Acceptance criteria path + `SLICE_PATHS` for one layer group |
| `quality-gate-runner` | `PROFILE: layer` (`--until fsd`) or `PROFILE: full` |
| `architecture-auditor` | `MODE` + `SCOPE`. Diff mode also gets `DIFF_SCOPE` and `TOPICS` |
| `code-reviewer` | Changed-file **list**. It reads diffs per file |

After each layer, the orchestrator rewrites `orchestrator-checkpoint.md` and spawns the next
worker with that path plus one handoff link. It does not restate earlier spoke chat.

---

## Revise Re-entry Points

When the human requests changes at Station 12, re-enter at the **lowest** station the change
touches, then replay Stations 9, 9.5, and 10 before a new `REVIEW_PACKET`. Patch-tier revisions
stay on `slice-engineer` plus `--until fsd` unless the change adds a dependency, a route, or a
second layer — then promote to `standard`.

| Change type | Re-entry | Cascade |
|-------------|----------|---------|
| Copy, label, or text content | Owning slice | Re-run 9–10 (including 9.5) on standard/full |
| Styling / component variant | Owning slice | Re-run from that layer up |
| Interaction behaviour | Station 5 | Re-run 6–10 |
| API contract or data shape | Station 4 | Re-run 5–10 |
| New route / navigation | Station 7 | Re-run 8–10 |
| Architecture-audit hard violation | Owning engineer, then 9.5 | Re-run 9–10 |
| Acceptance criteria changed | Station 0 | Full re-plan |

---

## Anti-Patterns

| Never | Why |
|-------|-----|
| Orchestrator calls `AskUserQuestion` | Subagent prompts never reach the user |
| Orchestrator edits files under `src/` | Workers own `src/` |
| Build the next layer on a red gate | Later layers inherit the defect |
| Pass raw `git diff` or a worker report into the orchestrator chat | Return `HANDOFF` + `CONTAINS` |
| Pass the full app spec body to the hub | One run is one screen-task |
| Spawn `feature-orchestrator` for a patch | The skill runs `slice-engineer` directly |
| Run `yarn build` or `yarn test:auto` after every layer | Those run once at Station 9 |
| Audit all of `src/` at Station 1.5 | Scope is `## FSD Impact` |
| Any agent runs `/create-pr`, `git push`, or merges | Shipping is human-only |
| Skip `DIFF_SCOPE` architecture-audit on standard/full because Steiger passed | Steiger is import direction; 9.5 checks segments, public APIs, and query keys |
