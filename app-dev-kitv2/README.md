# app-dev-kitv2 — the AI factory

A hub-and-spoke SDLC pipeline for Claude Code and Cursor, built from the design in [`Suggestions/`](../Suggestions/README.md).
A thin Conductor in the main session dispatches single-purpose agents; they talk only through
schema-checked files in `.factory/`, and **scripts, not models, decide pass/fail, retries and when to
stop.**

Status: **all five phases built** — engine, analysis, three roles, quality, delivery, GitHub adapter. Where the build differs from the design: [Suggestions/17](../Suggestions/17-as-built.md).

## Plugins

This family is **eight factory plugins**. Install the engine plus whichever stage, role and adapter
packs a project needs. [`prototype-kit`](../prototype-kit/README.md) (at `./prototype-kit` in the same marketplace) is a separate
install when a clickable reference is wanted. It is not a factory stage.

| Layer | Plugin | Status | Ships |
|---|---|---|---|
| Engine | [`factory`](factory/) | ✅ phase 1 | `/factory:*` commands, CLI, schemas, gates, Loop Warden, Context Broker, hooks, engine digest, `curator` (optional), `diagnostician` |
| Stage | [`factory-analysis`](factory-analysis/) | ✅ phase 2 | intake → bootstrap/discovery → requirements → stories → architecture → planning; 8 agents, 10 skills, worked-example templates |
| Role | [`factory-role-frontend`](factory-role-frontend/) | ✅ phase 3 | builder (red tests, proof with `gate red`, then green in one dispatch; a test author writes red first only with `quality.tdd.author: separate`); the task loop runs real tests, typecheck, lint, layer rules and the convention and duplicate checks (the build at verification); bundle and axe audits at verification; shadcn and context7 MCP |
| Stage | [`factory-quality`](factory-quality/) | ✅ phase 4 | acceptance tests before the build, machine checks then the seven-lens review plus the roles' scripted audits, exploratory QA; failures become fix tasks |
| Stage | [`factory-delivery`](factory-delivery/) | ✅ phase 4 | feature docs and ADRs, commit plan and PR body, PR-comment triage (S9); the engine commits and ships |
| Adapter | [`factory-adapter-github`](factory-adapter-github/) | ✅ phase 4 | `git push` + `gh pr create --draft`; dry-run by default (commands recorded, never run) |
| Role | [`factory-role-backend`](factory-role-backend/) | ✅ phase 5 | test author, builder and migration author for Express 5 + Zod + Drizzle; the migration check (journal, rollback, approved destructive SQL) runs in gate-impl; OpenAPI-conformance audit at verification |
| Role | [`factory-role-ai-agent`](factory-role-ai-agent/) | ✅ phase 5 | architect (agent-design.md at S3), test author against a scripted model, LangGraph and RAG builders, eval author; model-facing tasks pass only with an eval run |

Stack knowledge stays in the existing kits, each with a `stack.yaml`:
`frontend-dev-kit`, `node-backend-dev-kit`, `node-agent-dev-kit`. A role pack is useless without its
stack kit installed alongside it. `stack.yaml` maps each task type to the kit's **skills** (loaded with
the Skill tool), **rules** (`*` plus the type's rules, read before writing code) and **golden files**;
`stage_skills` gives stage agents (architect, planner, reviewer, QA, test strategist) the kit skills
they use as reference. The engine puts exactly those into each context pack.

## Install

### Claude Code

```bash
# once per machine
/plugin marketplace add Ksarelto/dev-AI-plugins

# engine is required by every other pack
/plugin install factory@dev-AI-plugins

# add stages, roles and the adapter for what this project needs, e.g. a full-stack web app:
/plugin install factory-analysis@dev-AI-plugins
/plugin install factory-role-frontend@dev-AI-plugins
/plugin install factory-role-backend@dev-AI-plugins
/plugin install factory-quality@dev-AI-plugins
/plugin install factory-delivery@dev-AI-plugins
/plugin install factory-adapter-github@dev-AI-plugins

# each role pack needs its stack kit
/plugin install frontend-dev-kit@dev-AI-plugins
/plugin install node-backend-dev-kit@dev-AI-plugins
```

Swap in `factory-role-ai-agent@dev-AI-plugins` + `node-agent-dev-kit@dev-AI-plugins` for an AI-agent
track (`node-agent-dev-kit` also needs `node-backend-dev-kit`). Reload installed packs inside a
session with `/reload-plugins`.

While developing this repo, load packs locally instead of through the marketplace:

```bash
claude --plugin-dir ./app-dev-kitv2/factory \
       --plugin-dir ./app-dev-kitv2/factory-analysis \
       --plugin-dir ./app-dev-kitv2/factory-role-frontend \
       --plugin-dir ./app-dev-kitv2/factory-quality \
       --plugin-dir ./app-dev-kitv2/factory-delivery \
       --plugin-dir ./app-dev-kitv2/factory-adapter-github \
       --plugin-dir ./frontend-dev-kit
```

### Cursor

```bash
npm run install:cursor-local   # symlinks every pack + stack kit into ~/.cursor/plugins/local
```

Enable third-party Plugins/Skills in Cursor Settings if prompted, then **Developer: Reload Window**.
`npm run uninstall:cursor-local` removes the links. See [Cursor](#cursor) below for how the engine
runs there and what still differs from Claude Code.

### First run in a project

```
/factory:init     # creates .factory/ (config, state, inbox) and registers the packs it finds installed
/factory:doctor   # confirms config and installed packs are consistent; fix anything it reports
```

`/factory:init` prints the roles it enabled and their package paths for confirmation — edit
`.factory/factory.config.yaml` for anything else (`roles.<role>.enabled`, `roles.<role>.path`,
`project.default_branch`, `flow.policy`). Then:

```
# drop requirements (any format) into .factory/inbox/, or skip the file for a one-line change
/factory:intake                       # or: /factory:intake --text "add password reset"
/factory:next                         # repeat — drives one step at a time, analysis through delivery
/factory:status                       # where the feature is right now
```

`/factory:ship` commits and opens the PR once the delivery gate passes (dry-run until
`delivery.dry_run: false` in the config — see [factory-adapter-github](factory-adapter-github/README.md)).
`/factory:note "…"` records a human instruction (`HD-*`) the plan must account for before it can pass.
`/factory:resume` clears a halt (a plugin installed, a budget raised) and runs the same phase again at the same rung,
without wiping tasks; `/factory:diagnose`, `/factory:scope`, `/factory:split` and `/factory:replay` change the plan instead.

A mockup the brief points at (a folder with an HTML entry or an `.html` file outside the project, or a URL) is only
*proposed* at intake: the first step asks once whether it is binding. `factory reference add <path|url> [--feature FEAT-NNN]`
confirms one at once; confirmed references are read-only for dispatched agents and scoped to their feature. Other human
commands: `factory acceptance waive … [--by …]`,
`factory replay acceptance --relock …`, `factory scope add`, `factory note [--kind process] | remap OLD=NEW`.

## Structure

```
app-dev-kitv2/
  factory/                 # engine: every project needs this one
    scripts/factory.mjs    #   CLI — init, intake, step, record, gate, status, doctor, metrics,
                            #   comments, ship, note, replay, abort, split, diagnose, resume, scope, reference, acceptance
    scripts/gates/         #   deterministic pass/fail checks, one per stage/task transition
    schemas/                #   JSON Schemas that state, context-pack and envelope files are checked against
    skills/                 #   one skill per /factory:* command
    hooks/                  #   guard.mjs — enforces each dispatch's context pack, Claude Code + Cursor
  factory-analysis/         # stage pack: stages/{intake,bootstrap,discovery,requirements,
                            #   requirements-lite,stories,architecture,planning}/stage.yaml
  factory-quality/          # stage pack: stages/{acceptance,verification,verification-lite,qa}/stage.yaml
  factory-delivery/         # stage pack: stages/{docs,delivery,feedback}/stage.yaml
  factory-role-frontend/    # role pack: a single role.yaml + agents/ + skills/ + audit scripts
  factory-role-backend/     # role pack, same shape
  factory-role-ai-agent/    # role pack, same shape
  factory-adapter-github/   # adapter pack: a single adapter.yaml, no agents or skills
  tests/                    # unit + e2e harness + golden tickets — not a plugin, never ships
  consistency-allowlist.yaml
```

The engine has no hardcoded list of packs: at `/factory:init` it scans installed plugins for a
`stage.yaml`, a `role.yaml` or an `adapter.yaml` and registers whatever it finds. A **stage pack**
owns one or more pipeline stages; a **role pack** supplies a test author, a builder and the gate
checks for one tech stack; an **adapter pack** only knows how to push and open a PR.

In a project where the factory has been initialized, `/factory:init` creates:

```
.factory/
  factory.config.yaml   # roles enabled, their paths, flow policy — the file humans usually edit
  state.json             # current stage/step per feature
  events.jsonl           # append-only audit log
  inbox/                 # drop raw requirements here before /factory:intake
  context/               # requirements, stories, architecture, API contract
  features/<FEAT>/       # per-feature tasks, context packs (packs/*.pack.md) and artifacts
  .registry/              # which installed packs the engine found at init
  .active/                # in-flight dispatch markers (Cursor's subagent tracker uses this too)
  logs/                   # hook-debug output, when enabled
```

## How a step works

```
/factory:next
  └─ factory step     → { action: dispatch, dispatches: [{ subagent_type, model, pack, prompt }] }
       Conductor sends each dispatch as an Agent call (parallel when the stage allows)
  └─ factory record   → envelope check → gate → ID coverage → Loop Warden verdict → state + events
       advance · retry (rung 1, feedback in the pack) · retry on the reasoning tier (rung 2: opus on Claude, grok-4.7-xhigh on Cursor)
       · diagnose (rung 3, diagnostician) · amend (rung 4, tasks: the planner corrects the same task, once per task; a second exhaustion goes to rung 5) · block (rung 5, human)
```

Every dispatch gets a **context pack** (`.factory/features/<FEAT>/packs/*.pack.md`): the stable rules
and input paths first, then the mission, the files it may write, the exit check to run and attempt
feedback. A task pack carries its own slice of the plan (its ACs, stories, test cases, component and
contract entries) and the notes that concern it; the whole artifacts are optional reads. Hooks
enforce the pack: writes outside the allowlist, unscoped searches, over-budget reads, package
installs and force-pushes are denied for dispatched agents; engine-owned state files are denied for
everyone.

## Doing each check once

- Task gates run typecheck, lint, the architecture check, the tests and the role's checks
  side by side (`quality.gate_concurrency`, default 4); the production build is left to verification
  (`quality.impl_build: true` adds it to every task). They leave out a dependency-cruiser run the
  lint script already does; verification runs lint and build in full.
- A task gate runs the tests (and evals) its own change touches — the stack's `test_scoped_args`,
  `vitest related <the files it changed since its base ref>` (the stack's `test_related`; without one, `--changed`) — and lints only the files it changed (the stack's `lint_files`); the
  role's last task runs and lints everything; verification runs the whole suite, the full lint, the
  build and the full eval suite once (`at_verify`). `quality.task_tests: full` / `quality.task_lint: full` turn it off.
  The base ref is a commit object the engine writes when the task's first dispatch starts (a throw-away
  copy of the index, `write-tree`, `commit-tree`: no branch, index or worktree file changes; git prunes it
  after two weeks), kept in `state.json` as `tasks.<id>.base_ref`. Outside git the gates run unscoped.
- A task gate does not build (`quality.impl_build: false`; `true` keeps it) and typechecks plain `tsc`
  incrementally (build info in `.factory/cache`, `quality.tsc_incremental: false` turns it off).
- A failed gate is cached like a pass: an identical failure on an unchanged tree is not re-run at
  `record` (`quality.cache_failures: false` turns it off; crashes, timeouts and missing reports are never reused).
- A passing red, impl or verification check is cached against a hash of the working tree: the agent's
  own exit check is not run again at `record` unless a file changed.
- Verification runs its machine checks (`precheck: checks`) before dispatching the reviewer: failing
  code goes back to implementation without a review round. Role audits (raw colours, i18n, OpenAPI
  drift) are scripts the engine runs (`role.yaml gates.audits`), not agents.
- The engine writes the feature digest (`context.digest: engine`); a stage pack inlines it while it is
  fresh, a task pack gets none, and every pack inlines the human notes of its scope. `record` returns the next step (`next`), and reads the envelope the stop hook saved
  (`--saved`), so the Conductor neither calls `step` nor copies envelopes.

## The fix loop and delivery

Verification, QA, a rejected GATE-C and `change` PR comments do not edit code. Their failures become
fix items; the feature goes back to `implementation`, where the planner first adds fix tasks
(`fixplan`): it amends the tasks that own the affected slices (a finished task whose entry changed is reopened) and adds a task only when no slice owns the work; each task then goes through red → green like any task. Each backward edge has a budget in
`defaults.yaml`. After the PR gate passes, the engine — not an agent — commits the release manager's
plan on the feature branch (one commit per task, `Factory-Task:` trailer), commits the `.factory`
artifacts, and runs the adapter. Docs run only with `delivery.docs: true`. A pull request is prepared only with `delivery.pr: true`; set `delivery.dry_run: false` as well to open a real PR. Otherwise the pipeline commits and stops. `/factory:ship`
asks first. `factory comments --file <json>` feeds review comments into S9.

## Sizing, gates and early quality

- **Tiers.** Intake sizes the feature (`patch` / `small` / `standard`; `--tier` overrides): `small` has no
  separate acceptance stage, no QA or docs stage, and does not ask GATE-B. Requirements re-checks small vs
  standard from the REQ/AC counts.
- **Gates.** GATE-A is asked at requirements (read `01-requirements/spec.md`), before stories. The pipeline
  also stops at GATE-C (the built feature, before the commit). Discovery and the plan still run; GATE-D and
  GATE-B are approved by the profile (`pipeline.skip_gates`). GATE-C always asks.
- **Source conflicts.** The requirements analyst diffs all sources and lists every contradiction in
  `completeness.yaml` `conflicts`; the engine asks the human exactly one CLARIFY, with the user's own brief as the
  proposed winner, before the requirements reach their gate.
- **Acceptance tests.** Written with the API contract, the inbox API sections and the entity types. A wrong one is
  settled by a human: `factory acceptance waive <test> --reason …` or `factory replay acceptance --relock <test>`.
- **Early quality.** The raw-colour and i18n audits run in `gate impl` on each task's files; the reviewer runs once
  after the first finished slice (non-blocking; findings amend the owning slices) and again at verification.
- **Budgets** follow the plan (`4 × tasks + 20` dispatches); `factory doctor` also warns about `eslint .`
  linting `.factory/`.

## Unattended runs (autopilot)

Set `automation.autopilot: true` in `factory.config.yaml` and the engine approves every stage's
`human_gate` (GATE-D, GATE-A, GATE-B, GATE-C) itself, the moment it is reached — the same
code path as a human `factory approve` (HD notes and `splitBacklog` still run),
recorded with `by: "autopilot"` so events and `factory metrics` show it. Turning it on also resolves
a gate a feature is already waiting at. Combined with `delivery.pr: true` and `delivery.dry_run: false`, `/factory:run` then
goes from intake straight through implementation, quality and delivery to a real pull request with no
stop in between — delivery still only pushes a branch and opens the PR (see
[factory-adapter-github](factory-adapter-github/README.md)); nothing merges it.

A CLARIFY stop — an agent that cannot proceed without an answer only a human has — is never
auto-approved; there is no safe default to invent. Nor is a gate a human rejected: when the revision
comes back it waits for the human who asked for it. A halted or blocked feature still halts. Leave
`autopilot: false` (the default) for a human to review and approve each gate as usual.

## Roles and tracks

A role pack is a `role.yaml` plus agents and skills; the engine knows nothing else about it. Each task
goes to its role's builder — or to a specialist builder for its type (`agents.builders`) — which, in the
default `quality.tdd.author: builder_two_phase`, writes the failing tests, proves them with `gate red`, then
implements in ONE dispatch (the engine checks the gate log: red passed before impl). With
`quality.tdd.author: separate` the role's test author writes the red tests first (two dispatches). Test authors
also write characterisation tests and revise tests after a dispute. gate-impl adds the role's own checks
(`gates.checks`). A task is a vertical slice (`slice`, `write_scope`; up to 12 files); a builder that needs a
file of its slice the plan left out returns `needs_scope_change` and a human runs `/factory:scope` (no planner run). Give each role its
package folder (`roles.<role>.path: api`) and the task loop runs one task per role **in parallel**;
roles that share a folder take turns. An existing app that does not follow its stack kit's conventions
yet can turn a role check or audit off by name (`roles.frontend.checks_off: [conventions]`).

## Spec completeness

In the requirements stage the analyst credits ten weighted categories (error states, permissions, edge
cases, non-functional, backward compatibility, undo, notifications, data lifecycle, observability,
localisation and accessibility) in `completeness.yaml`. gate-spec scores it. A score under
`quality.completeness_min` (85) is shown on `spec.md` at GATE-A and does not insert a question round.
A contradiction between sources does insert one CLARIFY, with the brief as the proposed winner. A PRD
needs measurable performance, accessibility and security NFRs; a story for a must requirement needs an
error, edge or permission AC.

## No unexpected changes

The factory works in one checkout and commits at delivery. After every record it stores the state of
the files outside `.factory/`; when something else changed them before the next dispatch, the step
halts with the list. `F accept-changes` keeps them (`policy.unexpected_changes: off` turns it off).

## Context that is never lost

- State lives in files, not in a conversation. After compaction a `SessionStart` hook re-injects
  `factory state --brief`, including open human notes.
- Human instructions are stored as `HD-*` notes (`/factory:note`, gate notes) before anything acts
  on them; the plan gate fails while a note is unmapped.
- Every stage exit checks tracked-ID coverage, and the digest (written by the engine; by the curator
  when `context.digest: curator`) is rejected if it drops an
  open `REQ`, `AC`, `ADR`, `OQ` or `HD` ID.

## Models

Each agent has one fixed model, stated in its frontmatter and explained in its `## Model` section
(why the tier, which task priority and complexity it is sized for, escalation, Cursor id); each
procedure skill names the agent and model that run it (`Runs on:`).

| Tier | Agents | Why |
|---|---|---|
| opus | requirements-analyst, solution-architect, planner, reviewer, ai-architect, diagnostician | ambiguity, trade-offs and decomposition: errors here are the expensive ones, and each runs a few times per feature |
| sonnet | builders, test authors, story-writer, contract-steward, test-strategist, codebase-analyst, acceptance-test-author, QA, release-manager | execution against a precise contract: one vertical-slice task of ≤ 12 files / ≤ 600 LOC (its red tests and its code), a story set, a page — the planner sizes tasks so sonnet can do any of them |
| haiku | intake-normaliser, curator (when enabled), tech-writer | mechanical transformation with a checking gate behind it |

A task or stage that fails twice moves to the reasoning tier (Loop Warden rung 2). Claude passes the engine `model` (`opus`). Cursor omits `model` on rung 0 and 1, and on rung 2 and above passes `grok-4.7-xhigh`; if that call fails, omit `model` and record the failure. Do not pass `opus` on Cursor. Rung 3 is the opus diagnostician on Claude.

The patch tier plans on sonnet (`stage.models`), and a fix plan for a known failure list runs on
sonnet. `scripts/check-factory-consistency.mjs` enforces the tiers, the `## Model` sections and the
`Runs on:` lines.

## Cursor

Every plugin also ships for Cursor (`.cursor-plugin/plugin.json`). In the IDE, install with
`npm run install:cursor-local`; the `cursor-agent` CLI loads local plugins only through `--plugin-dir`
(one per plugin: `factory`, the stage and role packs, and their stack kits). Checked live with
cursor-agent 2026.10.22: `/factory:doctor`, `/factory:intake` and one `/factory:next` ran end to end.

- Agents come from `cursor-agents/` in the local plugin mirror (generated from `agents/`, Cursor model ids). The Conductor dispatches with
  `Task` by the step's plain `agent` name. Omit `model` on rung 0 and 1 so the agent file applies. On rung 2 and above pass `model` = `grok-4.7-xhigh`. If that call fails, omit `model` and record the failure. Agent files still document Claude tier names (`opus`, `sonnet`); `scripts/model-tiers.json` maps those at install time.
- Skills find the engine through their own folder when `${CLAUDE_SKILL_DIR}` is not filled in.
- Hooks run from `hooks/cursor-hooks.json` through `guard.mjs --cursor`, located from the hook's working
  directory (the plugin folder): Cursor can set `CURSOR_PLUGIN_ROOT` to another plugin.
- A subagent runs in its own conversation. The CLI fires no `subagentStart`/`subagentStop`, so the
  guard tracks subagents from the `Task` call (pre: type and parent chat; post: the `agentId`) and
  binds the subagent's conversation on its first tool call. The Conductor's chat and any chat that
  fired `sessionStart` are never restricted.
- No stop hook means no saved envelope: `record --saved` reports it and the Conductor passes the
  envelope on stdin. Touch `.factory/hook-debug` to log every hook payload and guard decision.

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
