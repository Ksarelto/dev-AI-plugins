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
  features: models → api → hooks → lib → ui → index.ts
  entities: model → api → lib → ui → index.ts
  implement the slice → typecheck once → behavior test
```

The inner loop is in `ui-build-contract.md` (simplicity ladder, inside the slice, § 5). Do not name a second file.

---

## Outer cycle (hub)

| Step | Station | Who | Done when |
|------|---------|-----|-----------|
| 1. Intake | 0 | `import-upstream.mjs` + `spec-analyst` | Blackboard exists; scoped to one feature |
| 2. Spec approval | 0.5 | `feature-dev` skill (human) | `status: approved` |
| 3. Discover | 1 | `code-explorer` | FSD Impact + Reuse Map written |
| 4. Baseline architecture | 1.5 | `architecture-auditor` (REPORT_ONLY), **full tier only** | Summary + path on the blackboard; report in the context dir |
| 5. Investigate | 1a–1b | `research-analyst` (conditional) + skill (human deps) | No unapproved packages |
| 6. Plan | 2 | orchestrator | Build plan + AC coverage table |
| 7. Layer cycle | 3–7 | layer engineers, or `slice-engineer` when the layer has one slice; each writes its behavior tests | `--until fsd` green before the next layer |
| 8. Test gaps | 9 | `test-engineer` — only on `missing-test` or a coverage miss | Every new executable file has a behavior test |
| 9. Gate sweep | 9 | `run-gates.sh` (orchestrator Bash) | All mechanical gates green |
| 10. Architecture audit | 9.5 | `architecture-auditor` (REPORT_ONLY) | Zero hard violations on changed paths |
| 11. Auto-review | 10 | `code-reviewer` | No `[CRITICAL]`, no unresolved `[IMPORTANT]` |
| 12. Fix | 11 | owning engineer | Failed gate or finding cleared; cap 3 |
| 13. Human review | 12 | `feature-dev` skill (human) | `approve` → `done`; never a PR |

Do not start a higher FSD layer on a red `--until fsd` gate. Station 1.5 runs on the full tier only. Station 9.5 (`DIFF_SCOPE`) runs on standard and full. Patch skips both.

---

## Inner cycle (spoke)

Inside one assigned slice, follow `ui-build-contract.md`:

1. Stub `index.ts` first.
2. `models/` (features) or `model/` (entities) — types and pure invariants, no `any`. No React, no network, no locale keys. A form schema is `ui/<form>/schema.ts`.
3. `api/` fetchers and `endpoints.ts`. Query keys stay in `shared/api/query-keys/`.
4. `hooks/` (features only) — the query or mutation hook. `ui/` imports this, never `api/`.
5. `lib/` pure helpers — unit-tested without rendering
6. `ui/` happy path — renders with mock props
7. `ui/` loading, empty, error — each state has a test. A widget does not own these; the feature does.
8. Finalize `index.ts` — export only what consumers need. Pages default-export.

When the assigned slice is complete: `yarn typecheck` once, then the behavior test (colocated `{name}.test.tsx` for a component; `tests/` for hooks, api, models, lib, route modules, and guards). Do not
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
