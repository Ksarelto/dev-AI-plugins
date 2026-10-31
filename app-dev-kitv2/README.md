# app-dev-kitv2 — the AI factory

A hub-and-spoke SDLC pipeline for Claude Code, built from the design in [`Suggestions/`](../Suggestions/README.md).
A thin Conductor in the main session dispatches single-purpose agents; they talk only through
schema-checked files in `.factory/`, and **scripts, not models, decide pass/fail, retries and when to
stop.**

Status: **phase 1 of 5 (engine).** Stage, role and adapter packs arrive in phases 2–5.

## Plugins

| Layer | Plugin | Status | Ships |
|---|---|---|---|
| Engine | [`factory`](factory/) | ✅ phase 1 | `/factory:*` commands, CLI, schemas, gates, Loop Warden, Context Broker, hooks, `curator`, `diagnostician` |
| Stage | `factory-analysis` | phase 2 | intake → requirements → stories → architecture → planning |
| Role | `factory-role-frontend` | phase 3 | red/green task loop for React FSD |
| Stage | `factory-quality`, `factory-delivery` | phase 4 | review, QA, docs, PR |
| Adapter | `factory-adapter-github` | phase 4 | draft PR (dry-run by default) |
| Role | `factory-role-backend`, `factory-role-ai-agent` | phase 5 | Express and LangGraph tasks |

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
npm run check:factory    # duplication, wiring, model-policy and drift check
npm run build:factory    # regenerate the vendored deps bundle and pack hooks
npm run validate         # includes build:factory --check
npm run eval             # discoverability, includes evals/cases/factory*.json
```

The engine CLI can be driven by hand in any project:

```bash
node app-dev-kitv2/factory/scripts/factory.mjs help
```

`tests/` is not a plugin and never ships. `consistency-allowlist.yaml` records what later phases will
add and every deliberate deviation from `Suggestions/`.
