# 13 — Roadmap

Build the brakes before the engine: the control plane first, then the analysis half (most value, least risk), then frontend execution, then the parts that make it trustworthy, then brownfield and new roles.

```mermaid
gantt
    title AI Factory — phased build (indicative)
    dateFormat  YYYY-MM-DD
    axisFormat  W%W
    section Foundations
    P0 Control plane + schemas + hooks      :p0, 2026-11-09, 10d
    section Analysis half
    P1 Intake → spec → stories → plan       :p1, after p0, 14d
    section Frontend execution
    P2 FE role + react-fsd stack + task loop :p2, after p1, 18d
    section Trust
    P3 Verification, QA, delivery to PR      :p3, after p2, 14d
    P4 Evals, metrics, hardening             :p4, after p3, 10d
    section Scale
    P5 Brownfield discovery + change requests :p5, after p3, 14d
    P6 Backend role + parallel worktrees     :p6, after p4, 14d
    P7 AI-agent role                         :p7, after p6, 10d
```

## Phases

| Phase | Deliverables | Success criterion (exit) |
|---|---|---|
| **P0 Foundations** | `factory-core` skeleton; `.factory/` layout; schemas (state, envelope, spec, delta-spec, tasks, pack); Gatekeeper + Loop Warden + Scheduler scripts; protected-path / owns_paths / envelope hooks; control-plane test suite | A hand-written spec passes `gate-spec`; Layer-1 tests green; a protected-path write is actually blocked |
| **P1 Analysis half** | intake-normaliser, requirements-analyst, story-writer, solution-architect, contract-steward, planner, test-strategist; `/factory:intake`, `next`, `run`, `status`, `gate`; GATE-A and GATE-B | From a messy customer folder → approved spec, stories, contract and `tasks.yaml` with full traceability in < 45 min |
| **P2 Frontend execution** | `factory-role-frontend` (fe-builder, fe-test-author, fe-auditor); `frontend-dev-kit` as the stack pack (slim rules, golden files, scaffold scripts); Context Broker + packs; red → green task loop (`gate-red`, red-test hooks, pipelined red phase) with escalation ladder; Cartographer v1 (greenfield index) | A 5-task feature implemented end-to-end with green machine gates and ≤ 1 human intervention, < 90 min |
| **P3 Verification & delivery** | acceptance-test-author, reviewer (7 lenses, parallel), qa-engineer + heuristics skill, release-manager, `factory-adapter-github`, PR template + provenance, S9 feedback loop, CI required checks | An auto-generated PR that a senior dev approves with only nit comments |
| **P4 Hardening** | golden tickets GT-01…08, 10, 11; replace the estimates in [15](15-walkthrough-and-estimates.md) with measurements; metrics report; budget tuning; curator digests; headless runner | First-pass gate rate > 70%; golden tickets green; overnight headless run of 3 features without babysitting |
| **P5 Brownfield** | Discovery stage (codebase-analyst, conformance validator, baseline ledger); delta-spec flow; characterisation-test tasks; behaviour-preservation lens mandatory | GT-03…05 green; extending an existing app adds a feature with zero rewritten unrelated files and zero duplicated components |
| **P6 Backend role** | `factory-role-backend` on top of the existing `node-backend-dev-kit` + `backend-boilerplate`, worktree tracks, integration merge order, contract conformance gate | A full-stack feature delivered with FE and BE built in parallel; **zero changes** to `factory-core` code |
| **P7 AI-agent role** | `factory-role-ai-agent` on top of the existing `node-agent-dev-kit` + `agent-boilerplate`, eval gate | An agent feature delivered with an eval suite meeting its thresholds; zero `factory-core` changes |

**Use P1 for real work before starting P2.** Analysis artifacts are where the factory creates the most value with the least risk — even a human implementing from a factory-produced plan benefits.

## Mapping from today's kits

| Today | Becomes |
|---|---|
| `spec-dev-kit` scripts (intake, validate, publish, changes, increments) | ideas and some code ported into `factory-core` P0–P1 (schemas, delta, increments) |
| `spec-dev-kit` agents (7) | `requirements-analyst` + skills (interrogation, enrichment) |
| `html-generator-kit` | the optional prototype stage inside `factory-role-frontend` (same stack, sandboxed) |
| `feature-dev-kit` (13 agents) | `fe-builder` + `fe-test-author` + `fe-auditor` + task-type skills; scaffold scripts move to `frontend-dev-kit` |
| `frontend-orchestrator-kit`, `app-orchestrator-kit` | the single Conductor + Scheduler |
| `frontend-dev-kit` | the frontend stack pack (rules slimmed to ≤ 40 lines, path-scoped); `docs/frontend/architecturev2` stays its reference architecture |
| `backend-dev-kit`, `agent-dev-kit` (app-dev-kit) | superseded as stack packs by `node-backend-dev-kit` and `node-agent-dev-kit` (top level, with verified boilerplates); their agents are starting material for the P6 / P7 role packs |
| `base-dev-kit` | always-on hot rules (honesty, security) in `factory-core` |

The old kits stay installable until P4 is done; they are then deprecated in the marketplace.

## First two weeks, concretely

1. Write the five core schemas and validate them against two hand-made example features (one greenfield, one change request).
2. Implement Gatekeeper and Loop Warden with fixture tests — fingerprint, progress signal, ladder, budgets.
3. Implement `/factory:next` as a thin command that only reads state, calls scripts and prints what it *would* dispatch (dry-run mode).
4. Add the three hooks that matter most: protected paths, role `owns_paths`, envelope validation.
5. Wire the first real spoke (`requirements-analyst`) and run GT-06 (vague requirement) end-to-end.
