# app-dev-kitv2 — the AI factory

A hub-and-spoke SDLC pipeline for Claude Code, built from the design in [`Suggestions/`](../Suggestions/README.md).
A thin Conductor in the main session dispatches single-purpose agents; they talk only through
schema-checked files in `.factory/`, and **scripts, not models, decide pass/fail, retries and when to
stop.**

Status: **all five phases built** — engine, analysis, three roles, quality, delivery, GitHub adapter. Where the build differs from the design: [Suggestions/17](../Suggestions/17-as-built.md).

## Plugins

| Layer | Plugin | Status | Ships |
|---|---|---|---|
| Engine | [`factory`](factory/) | ✅ phase 1 | `/factory:*` commands, CLI, schemas, gates, Loop Warden, Context Broker, hooks, `curator`, `diagnostician` |
| Stage | [`factory-analysis`](factory-analysis/) | ✅ phase 2 | intake → bootstrap/discovery → requirements → stories → architecture → planning; 8 agents, 10 skills, worked-example templates |
| Role | [`factory-role-frontend`](factory-role-frontend/) | ✅ phase 3 | test author (red), builder (green), prototyper; the task loop runs real tests, typecheck, lint, layer rules and build |
| Stage | [`factory-quality`](factory-quality/) | ✅ phase 4 | acceptance tests before the build, seven-lens review with the role auditors in parallel, exploratory QA; failures become fix tasks |
| Stage | [`factory-delivery`](factory-delivery/) | ✅ phase 4 | feature docs and ADRs, commit plan and PR body, PR-comment triage (S9); the engine commits and ships |
| Adapter | [`factory-adapter-github`](factory-adapter-github/) | ✅ phase 4 | `git push` + `gh pr create --draft`; dry-run by default (commands recorded, never run) |
| Role | [`factory-role-backend`](factory-role-backend/) | ✅ phase 5 | test author, builder and migration author for Express 5 + Zod + Drizzle; the migration check (journal, rollback, approved destructive SQL) runs in gate-impl; OpenAPI-conformance auditor |
| Role | [`factory-role-ai-agent`](factory-role-ai-agent/) | ✅ phase 5 | architect (agent-design.md at S3), test author against a scripted model, LangGraph and RAG builders, eval author; model-facing tasks pass only with an eval run |

Stack knowledge stays in the existing kits, each with a new `stack.yaml`:
`frontend-dev-kit`, `node-backend-dev-kit`, `node-agent-dev-kit`.

## How a step works

```
/factory:next
  └─ factory step     → { action: dispatch, dispatches: [{ subagent_type, model, pack, prompt }] }
       Conductor sends each dispatch as an Agent call (parallel when the stage allows)
  └─ factory record   → envelope check → gate → ID coverage → Loop Warden verdict → state + events
       advance · retry (rung 1, feedback in the pack) · retry on opus (rung 2)
       · diagnose (rung 3, diagnostician) · split (rung 4, tasks) · block (rung 5, human)
```

Every dispatch gets a **context pack** (`.factory/features/<FEAT>/packs/*.pack.md`): the mission,
the files it may write, the exit check to run, the inputs by path, and attempt feedback. Hooks
enforce the pack: writes outside the allowlist, unscoped searches, over-budget reads, package
installs and force-pushes are denied for dispatched agents; engine-owned state files are denied for
everyone.

## The fix loop and delivery

Verification, QA, a rejected GATE-C and `change` PR comments do not edit code. Their failures become
fix items; the feature goes back to `implementation`, where the planner first adds fix tasks
(`fixplan`), and those go through red → green like any task. Each backward edge has a budget in
`defaults.yaml`. After the PR gate passes, the engine — not an agent — commits the release manager's
plan on the feature branch (one commit per task, `Factory-Task:` trailer), commits the `.factory`
artifacts, and runs the adapter. Set `delivery.dry_run: false` to open a real PR; `/factory:ship`
asks first. `factory comments --file <json>` feeds review comments into S9.

## Roles and tracks

A role pack is a `role.yaml` plus agents and skills; the engine knows nothing else about it. Each task
goes to its role's test author (red) and builder (green) — or to a specialist builder for its type
(`agents.builders`) — and gate-impl adds the role's own checks (`gates.checks`). Give each role its
package folder (`roles.<role>.path: api`) and the task loop runs one task per role **in parallel**;
roles that share a folder take turns.

## Context that is never lost

- State lives in files, not in a conversation. After compaction a `SessionStart` hook re-injects
  `factory state --brief`, including open human notes.
- Human instructions are stored as `HD-*` notes (`/factory:note`, gate notes) before anything acts
  on them; the plan gate fails while a note is unmapped.
- Every stage exit checks tracked-ID coverage, and the curator's digest is rejected if it drops an
  open `REQ`, `AC`, `ADR`, `OQ` or `HD` ID.

## Models

| Tier | Agents |
|---|---|
| opus | requirements-analyst, solution-architect, planner, reviewer, ai-architect, diagnostician |
| sonnet | builders, test authors, story-writer, contract-steward, test-strategist, codebase-analyst, QA, prototyper |
| haiku | intake-normaliser, curator, tech-writer, release-manager, auditors |

A task that fails twice moves to opus (rung 2). The policy is enforced by
`scripts/check-factory-consistency.mjs`.

## Development

```bash
npm run test:factory     # Layer-1 control-plane tests (node:test, no model)
npm run test:factory:e2e # mocked end-to-end scenarios: real engine, scripted agents (tests/scenarios);
                         # GT-04 runs S0–S9 on the real stack of tests/fixtures/fsd-app; GT-12 and the
                         # role scenarios run on backend-boilerplate and agent-boilerplate copies
npm run setup:factory-fixtures   # once: install the FSD fixture and both boilerplates (Node 22)
npm run check:factory    # duplication, wiring, model-policy and drift check
node factory/scripts/factory.mjs metrics --md --project <app>   # first-pass rates, escalations, red validity
npm run build:factory    # regenerate the vendored deps bundle and pack hooks
npm run validate         # includes build:factory --check
npm run eval             # discoverability, includes evals/cases/factory*.json
```

Real-model golden tickets (cost money; the runner prints its plan and spends nothing without `--yes`):

```bash
node app-dev-kitv2/tests/golden/run-golden.mjs app-dev-kitv2/tests/golden/GT-06-vague-conflicts
```

The engine CLI can be driven by hand in any project:

```bash
node app-dev-kitv2/factory/scripts/factory.mjs help
```

`tests/` is not a plugin and never ships. `consistency-allowlist.yaml` records what later phases will
add and every deliberate deviation from `Suggestions/`.
