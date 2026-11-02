# app-dev-kitv2 — the AI factory

A hub-and-spoke SDLC pipeline for Claude Code and Cursor, built from the design in [`Suggestions/`](../Suggestions/README.md).
A thin Conductor in the main session dispatches single-purpose agents; they talk only through
schema-checked files in `.factory/`, and **scripts, not models, decide pass/fail, retries and when to
stop.**

Status: **all five phases built** — engine, analysis, three roles, quality, delivery, GitHub adapter. Where the build differs from the design: [Suggestions/17](../Suggestions/17-as-built.md).

## Plugins

This family is **nine separate marketplace plugins**. Install the engine plus whichever stage, role
and adapter packs a project needs.

| Layer | Plugin | Status | Ships |
|---|---|---|---|
| Engine | [`factory`](factory/) | ✅ phase 1 | `/factory:*` commands, CLI, schemas, gates, Loop Warden, Context Broker, hooks, engine digest, `curator` (optional), `diagnostician` |
| Stage | [`factory-analysis`](factory-analysis/) | ✅ phase 2 | intake → bootstrap/discovery → requirements → stories → architecture → planning; 8 agents, 10 skills, worked-example templates |
| Role | [`factory-role-frontend`](factory-role-frontend/) | ✅ phase 3 | test author (red), builder (green), the living app prototype (prototype-designer + one prototyper per screen); the task loop runs real tests, typecheck, lint, layer rules, build and the convention and duplicate checks; bundle and axe audits at verification; shadcn and context7 MCP |
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

## Structure

```
app-dev-kitv2/
  factory/                 # engine: every project needs this one
    scripts/factory.mjs    #   CLI — init, intake, step, record, gate, status, doctor, metrics,
                            #   comments, ship, note, replay, abort, split, diagnose
    scripts/gates/         #   deterministic pass/fail checks, one per stage/task transition
    schemas/                #   JSON Schemas that state, context-pack and envelope files are checked against
    skills/                 #   one skill per /factory:* command
    hooks/                  #   guard.mjs — enforces each dispatch's context pack, Claude Code + Cursor
  factory-analysis/         # stage pack: stages/{intake,bootstrap,discovery,requirements,
                            #   requirements-lite,stories,architecture,planning,prototype}/stage.yaml
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
       advance · retry (rung 1, feedback in the pack) · retry on opus (rung 2)
       · diagnose (rung 3, diagnostician) · split (rung 4, tasks) · block (rung 5, human)
```

Every dispatch gets a **context pack** (`.factory/features/<FEAT>/packs/*.pack.md`): the mission,
the files it may write, the exit check to run, the inputs by path, and attempt feedback. Hooks
enforce the pack: writes outside the allowlist, unscoped searches, over-budget reads, package
installs and force-pushes are denied for dispatched agents; engine-owned state files are denied for
everyone.

## Doing each check once

- Task gates run typecheck, lint, the architecture check, the build, the tests and the role's checks
  side by side (`quality.gate_concurrency`, default 4). They leave out a dependency-cruiser run the
  lint script already does and a build that is only `tsc`; verification runs lint and build in full.
- A task gate runs the tests (and evals) the uncommitted changes touch — the stack's
  `test_scoped_args`, `vitest --changed` — and the role's last task runs them all; verification runs
  the whole suite and the full eval suite once (`at_verify`). `quality.task_tests: full` turns it off.
- A passing red, impl or verification check is cached against a hash of the working tree: the agent's
  own exit check is not run again at `record` unless a file changed.
- Verification runs its machine checks (`precheck: checks`) before dispatching the reviewer: failing
  code goes back to implementation without a review round. Role audits (raw colours, i18n, OpenAPI
  drift) are scripts the engine runs (`role.yaml gates.audits`), not agents.
- The engine writes the feature digest (`context.digest: engine`), and every pack inlines it with the
  human notes. `record` returns the next step (`next`), and reads the envelope the stop hook saved
  (`--saved`), so the Conductor neither calls `step` nor copies envelopes.

## The fix loop and delivery

Verification, QA, a rejected GATE-C and `change` PR comments do not edit code. Their failures become
fix items; the feature goes back to `implementation`, where the planner first adds fix tasks
(`fixplan`), and those go through red → green like any task. Each backward edge has a budget in
`defaults.yaml`. After the PR gate passes, the engine — not an agent — commits the release manager's
plan on the feature branch (one commit per task, `Factory-Task:` trailer), commits the `.factory`
artifacts, and runs the adapter. Set `delivery.dry_run: false` to open a real PR; `/factory:ship`
asks first. `factory comments --file <json>` feeds review comments into S9.

## Unattended runs (autopilot)

Set `automation.autopilot: true` in `factory.config.yaml` and the engine approves every stage's
`human_gate` (GATE-D, GATE-A, GATE-P, GATE-B, GATE-C) itself, the moment it is reached — the same
code path as a human `factory approve` (HD notes, `splitBacklog`, a breaking delta still all run),
recorded with `by: "autopilot"` so events and `factory metrics` show it. Turning it on also resolves
a gate a feature is already waiting at. Combined with `delivery.dry_run: false`, `/factory:run` then
goes from intake straight through implementation, quality and delivery to a real pull request with no
stop in between — delivery still only pushes a branch and opens the PR (see
[factory-adapter-github](factory-adapter-github/README.md)); nothing merges it.

A CLARIFY stop — an agent that cannot proceed without an answer only a human has — is never
auto-approved; there is no safe default to invent. A halted or blocked feature still halts. Leave
`autopilot: false` (the default) for a human to review and approve each gate as usual.

## Roles and tracks

A role pack is a `role.yaml` plus agents and skills; the engine knows nothing else about it. Each task
goes to its role's test author (red) and builder (green) — or to a specialist builder for its type
(`agents.builders`) — and gate-impl adds the role's own checks (`gates.checks`). Give each role its
package folder (`roles.<role>.path: api`) and the task loop runs one task per role **in parallel**;
roles that share a folder take turns. An existing app that does not follow its stack kit's conventions
yet can turn a role check or audit off by name (`roles.frontend.checks_off: [conventions]`).

## The living app prototype

`.factory/prototype/` is one clickable, static HTML prototype of the whole app (Alpine.js from a CDN,
no build). Every feature whose stories add, change or remove a user-facing surface updates it in place:

1. The engine snapshots the folder (`02b-prototype/before/`).
2. The **prototype-designer** applies binding brand inputs (or a neutral light theme), updates the
   design brief, shared CSS/JS, the navigation shell and `screens.yaml`, marking each screen added,
   changed, unchanged, removed or placeholder.
3. One **prototyper** per added or changed screen writes `pages/<id>.html` and a note with the spec
   gaps it found — in parallel.
4. gate-proto checks the increment (real page changes vs `screens.yaml`, every story's surface and
   states, links, binding tokens, the state blocks and dev panel, landmarks); GATE-P shows it.
   Approving with breaking spec deltas sends the feature back to requirements.

`/factory:proto --revert` restores the snapshot and runs the stage again; aborting the feature restores
it too (unless a later feature prototyped on top). The folder is committed with the feature.

## Spec completeness

In the requirements stage the analyst credits ten weighted categories (error states, permissions, edge
cases, non-functional, backward compatibility, undo, notifications, data lifecycle, observability,
localisation and accessibility) in `completeness.yaml`. gate-spec scores it; below
`quality.completeness_min` (85) the engine asks one batch of the analyst's gap questions, each with a
recommended answer, then shows what is still missing at GATE-A. A PRD needs measurable performance,
accessibility and security NFRs; a story for a must requirement needs an error, edge or permission AC.

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
| sonnet | builders, test authors, prototype-designer, prototyper, story-writer, contract-steward, test-strategist, codebase-analyst, acceptance-test-author, QA, release-manager | execution against a precise contract: one task of ≤ 3 files / ≤ 200 LOC, a story set, a page — the planner sizes tasks so sonnet can do any of them |
| haiku | intake-normaliser, curator (when enabled), tech-writer | mechanical transformation with a checking gate behind it |

A task or stage that fails twice moves to opus (Loop Warden rung 2); rung 3 is the opus diagnostician.
The patch tier plans on sonnet (`stage.models`), and a fix plan for a known failure list runs on
sonnet. `scripts/check-factory-consistency.mjs` enforces the tiers, the `## Model` sections and the
`Runs on:` lines.

## Cursor

Every plugin also ships for Cursor (`.cursor-plugin/plugin.json`). In the IDE, install with
`npm run install:cursor-local`; the `cursor-agent` CLI loads local plugins only through `--plugin-dir`
(one per plugin: `factory`, the stage and role packs, and their stack kits). Checked live with
cursor-agent 2026.10.22: `/factory:doctor`, `/factory:intake` and one `/factory:next` ran end to end.

- Agents come from `cursor-agents/` (generated, Cursor model ids). The Conductor dispatches with
  `Task` by the step's plain `agent` name and leaves out `model`; the rung-2 move to opus does not apply.
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
