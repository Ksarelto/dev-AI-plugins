# Development Cycle — feature-dev-kit

How a feature is built **step by step**. `pipeline-flow.md` is canonical for station order.
This file is the human-readable cycle the hub and every build spoke follow.

Load this before Station 1 (orchestrator) and before writing any `src/` file (build engineers).

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
  each increment: implement ≤100 lines → typecheck → colocated test → stop if red
```

The inner loop is specified in `increment-protocol.md`. Every build engineer's `APPLY` list
must name both this file and `increment-protocol.md`.

---

## Outer cycle (hub)

| Step | Station | Who | Done when |
|------|---------|-----|-----------|
| 1. Intake | 0 | `upstream-interpreter` + `spec-analyst` | Blackboard exists; scoped to one screen-task |
| 2. Spec approval | 0.5 | `feature-dev` skill (human) | `status: approved` |
| 3. Discover | 1 | `code-explorer` | FSD Impact + Reuse Map written |
| 4. Baseline architecture | 1.5 | `architecture-auditor` (REPORT_ONLY) | `## Architecture Baseline` written |
| 5. Investigate | 1a–1b | `research-analyst` (conditional) + skill (human deps) | No unapproved packages |
| 6. Plan | 2 | orchestrator | Build plan + AC coverage table |
| 7. Layer cycle | 3–7 | layer engineers (or `slice-engineer` when small) | Each layer green before the next |
| 8. Tests | 8 | `test-engineer` | Coverage thresholds + every AC has a test |
| 9. Gate sweep | 9 | `quality-gate-runner` | All mechanical gates green |
| 10. Architecture audit | 9.5 | `architecture-auditor` (REPORT_ONLY) | Zero hard violations on changed paths |
| 11. Auto-review | 10 | `code-reviewer` | No `[CRITICAL]`, no unresolved `[IMPORTANT]` |
| 12. Fix | 11 | owning engineer | Failed gate or finding cleared; cap 3 |
| 13. Human review | 12 | `feature-dev` skill (human) | `approve` → `done`; never a PR |

Do not start a higher FSD layer on a red gate. Do not skip 1.5 or 9.5.

---

## Inner cycle (spoke)

Inside one assigned slice, follow `increment-protocol.md`:

1. `model/` types + schema — compiles, no `any`
2. `api/` hooks or mutations — query keys + invalidation
3. `lib/` pure helpers — unit-tested without rendering
4. `ui/` happy path — renders with mock props
5. `ui/` loading, empty, error — each state has a test
6. `index.ts` public API — export only what consumers need

After every increment: `yarn typecheck` on the slice, then the colocated test. Never write
the whole slice and typecheck once at the end.

---

## Architecture-audit in the cycle

Spawn **`architecture-auditor`**. That agent preloads `frontend-dev-kit:architecture-audit`.
Do not copy its references into this kit. Factory invocation is always `REPORT_ONLY` — no
auto-fix, no `AskUserQuestion`. The hub does not hold a `Skill` tool.

- **1.5** audits existing `src/` so the plan does not build on a broken tree. Hard
  violations on files this feature will touch → `ESCALATION_PACKET` unless the build plan
  already remediates them. Skip only when `src/` has no FSD layers yet.
- **9.5** audits the **changed paths and their importers**. Hard violations fail like
  `review-clean` and enter Station 11. Judgment calls go to `## Human Review`, they do not block.

If the agent or companion skill cannot be resolved (frontend-dev-kit not installed) →
`ESCALATION_PACKET`. Never skip the audit gate.
