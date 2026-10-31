# 16 — Runbook: how to start and drive a run

The concrete steps for each situation. Commands are the `/factory:*` commands from [03](03-sdlc-pipeline.md#commands-l5). Everything the factory knows lives in `.factory/`, so you can stop after any step and continue later, in the same chat or a new one.

## Before the first run (once per repository)

1. Install the plugins ([10](10-configuration-and-extensibility.md#packaging)): the engine `factory`; the stage packs `factory-analysis`, `factory-quality`, `factory-delivery`; the role packs you need (`factory-role-frontend` today); the stack packs (`frontend-dev-kit`, and `node-backend-dev-kit` / `node-agent-dev-kit` when those roles are enabled); and `factory-adapter-github`.
2. Create `.factory/factory.config.yaml`: enabled roles, their stacks and `owns_paths`, flow policy, thresholds ([10](10-configuration-and-extensibility.md#factoryconfigyaml)).
3. Run `factory doctor`: it confirms that every stage, role and stack in the config is installed and compatible.
4. Make sure `gh auth status` works (delivery opens a draft PR) and the repo's CI runs the same gates ([09](09-quality-gates-and-loop-control.md#hooks-enforcement-summary)).

## A. Modify an existing app with new requirements (most common)

| Step | You do | The factory does | Stops for you? |
|---|---|---|---|
| 1 | Put the new material in `.factory/inbox/`: brief, emails, tickets, screenshots, a Figma export. With little written down, run `/factory:intake --interview`. For a one-liner, use `/factory:intake --text "…"` | — | — |
| 2 | `/factory:intake` | normalises inputs (source IDs), checks coverage, detects the mode: **brownfield-extend** for new capabilities, **change-request** when the request names existing features or screens ([04](04-entry-modes-greenfield-brownfield.md)) | only if coverage has blocker gaps (interview questions) |
| 3 | First run on this app only: confirm the baseline | A0 Discovery: capability index, component inventory, baseline feature ledger, architecture conformance against the stack pack | **yes**, once per app |
| 4 | `/factory:run --until gate` | S1 writes a **delta-spec** (ADDED / MODIFIED / REMOVED) against the ledger, with open questions and defaults | **GATE-A**: read the delta-spec, answer questions, `/factory:gate approve` (or `reject "…"`) |
| 5 | `/factory:run --until gate` | stories → optional prototype → architecture/contract → task plan with roles, red tests per task, reuse decisions | GATE-P if a prototype was triggered; **GATE-B**: approve the plan |
| 6 | `/factory:run --until gate` (or the headless runner overnight) | S5 builds test-first (characterisation tests first for change requests), S6 reviews, S7 QA, S8a docs, S8 opens a draft PR | **GATE-C**: review the PR in GitHub |
| 7 | Comment on the PR | S9 turns comments into fix tasks and pushes to the same branch | GATE-C again |
| 8 | Merge (always a human) | ledger entry appended, index rebuilt at the merge SHA | — |

What keeps the factory from rewriting existing code:

- the delta-spec must list `removed`, even when it is empty;
- every net-new component needs a `reuse_rejected` reason;
- characterisation tests run before modifications;
- the behaviour-preservation review lens is mandatory in this mode.

## B. New app from scratch

1. Set the boilerplate per role in config (`backend-boilerplate`, `agent-boilerplate`, the React starter).
2. `/factory:intake` (or `--interview`) → mode **greenfield** → A0 Bootstrap clones the boilerplates, writes `app-profile.yaml`, indexes the empty app.
3. GATE-A approves the **full PRD**. The PRD is split into a feature backlog with dependencies.
4. Each feature then runs steps 5–8 of flow A. With `flow.policy: iterations`, GATE-A/B are batched at iteration planning and PRs are reviewed at the iteration review ([08](08-parallelism-and-flow.md#which-one-to-choose)).

## C. Small fix (patch tier)

`/factory:intake --text "Rename the checkout button"`, then `/factory:run --until gate`. The pipeline is S1-lite → S5 → S6-lite → S8, with one human gate: the PR. About 15 minutes ([15](15-walkthrough-and-estimates.md#scenario-b--patch-rename-the-checkout-button-and-use-the-brand-colour-token)).

## Stop, resume, inspect

| Need | Command |
|---|---|
| See where everything stands | `/factory:status`: stages, pending gate, WIP lanes, budgets, blocked tasks |
| Continue after a break, crash or new chat | `/factory:next` or `/factory:run --until gate`; finished tasks are skipped by the idempotency check |
| Answer a pending gate | `/factory:gate approve ["<notes>"]` / `reject "<reason>"`; notes become `HD-*` entries that later gates check |
| Add an instruction between gates | `/factory:note "<text>"`; don't rely on chat alone, it may be compacted ([07](07-context-engineering.md#human-instructions-are-artifacts)) |
| Re-run a stage with feedback | `/factory:replay <stage> --with "<feedback>"` |
| A task is stuck | `/factory:diagnose <task>` or `/factory:split <task>`; after the ladder it is `blocked` with `blockers.md` |
| Stop a feature for good | `/factory:abort <feature>` (writes a post-mortem) |

## Where the results are

| What | Where |
|---|---|
| Spec, stories, plan, review, QA report, provenance | `.factory/features/<FEAT>/` (committed with the PR) |
| App documentation | `docs/features/<FEAT>.md`, `docs/adr/`, `CHANGELOG.md`, OpenAPI ([03](03-sdlc-pipeline.md#code-review-and-documentation-after-implementation)) |
| Code, tests | the feature branch `factory/<FEAT>-<slug>`, one commit per task |
| Cost and time | `events.jsonl`, `/factory:status`, the PR's provenance block ([11](11-delivery-and-feedback.md#pr-assembly-s8)) |
