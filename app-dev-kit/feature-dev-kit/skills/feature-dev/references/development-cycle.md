# Development Cycle — feature-dev-kit

How a feature is built **step by step**. `pipeline-flow.md` is canonical for station order and tiers.
Spokes do not load this file. The delegation station card is enough.

---

## Two nested loops

```
Outer (hub — feature-orchestrator)
  intake → spec approval → discover → [investigate] → plan
       → layer cycle (shared → entities → features → widgets/pages → app)
       → tests → quality gates → architecture-audit → auto-review → fix
       → human review

Inner (each build spoke, one slice)
  model → api → lib → ui → index.ts
  implement the slice → typecheck once → colocated test
```

The inner loop is specified in `increment-protocol.md`. Name that file only if the station card says so.

---

## Outer cycle (hub)

| Step | Station | Who | Done when |
|------|---------|-----|-----------|
| 1. Intake | 0 | `upstream-interpreter` + `spec-analyst` | Blackboard exists; scoped to one feature |
| 2. Spec approval | 0.5 | `feature-dev` skill (human) | `status: approved` |
| 3. Discover | 1 | `code-explorer` | FSD Impact + Reuse Map written |
| 4. Baseline architecture | 1.5 | `architecture-auditor` (REPORT_ONLY), **full tier only** | Summary + path on the blackboard; report in the context dir |
| 5. Investigate | 1a–1b | `research-analyst` (conditional) + skill (human deps) | No unapproved packages |
| 6. Plan | 2 | orchestrator | Build plan + AC coverage table |
| 7. Layer cycle | 3–7 | layer engineers, or `slice-engineer` when the layer has one slice | `--until fsd` green before the next layer |
| 8. Tests | 8 | `test-engineer`, only if Station 9 coverage fails | Coverage thresholds + every AC has a test |
| 9. Gate sweep | 9 | `quality-gate-runner` | All mechanical gates green |
| 10. Architecture audit | 9.5 | `architecture-auditor` (REPORT_ONLY) | Zero hard violations on changed paths |
| 11. Auto-review | 10 | `code-reviewer` | No `[CRITICAL]`, no unresolved `[IMPORTANT]` |
| 12. Fix | 11 | owning engineer | Failed gate or finding cleared; cap 3 |
| 13. Human review | 12 | `feature-dev` skill (human) | `approve` → `done`; never a PR |

Do not start a higher FSD layer on a red `--until fsd` gate. Station 1.5 runs on the full tier only. Station 9.5 (`DIFF_SCOPE`) runs on standard and full. Patch skips both.

---

## Inner cycle (spoke)

Inside one assigned slice, follow `increment-protocol.md`:

1. `model/` types + schema — compiles, no `any`
2. `api/` hooks or mutations — query keys + invalidation
3. `lib/` pure helpers — unit-tested without rendering
4. `ui/` happy path — renders with mock props
5. `ui/` loading, empty, error — each state has a test
6. `index.ts` public API — export only what consumers need

When the assigned slice is complete: `yarn typecheck` once, then the colocated test. Do not
typecheck between segments.

---

## Architecture-audit in the cycle

Spawn **`architecture-auditor`**. That agent preloads `frontend-dev-kit:architecture-audit`.
Do not copy its references into this kit. Factory invocation is always `REPORT_ONLY` — no
auto-fix, no `AskUserQuestion`. The hub does not hold a `Skill` tool.

- **1.5** (full tier) audits paths in `## FSD Impact` plus importers, not all of `src/`. Hard
  violations on those paths → `ESCALATION_PACKET` unless the build plan already remediates them.
  Skip when `src/` has no FSD layers, and skip entirely on patch and standard.
- **9.5** (standard and full) passes `DIFF_SCOPE` and a short `TOPICS` list. Scope is the changed
  paths and their importers. Hard violations enter Station 11. Judgment calls are a one-line note
  plus the handoff path.

If the agent or companion skill cannot be resolved on a tier that requires the audit →
`ESCALATION_PACKET`. Patch does not run this gate.
