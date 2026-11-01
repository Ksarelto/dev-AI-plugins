# 17 — As built (app-dev-kitv2)

This design is implemented as the plugin family in [`app-dev-kitv2/`](../app-dev-kitv2/README.md).
The other chapters still describe the intent; this page lists where the build differs, and what is not
built yet. `app-dev-kitv2/consistency-allowlist.yaml` keeps the same list in machine-readable form, and
`npm run check:factory` fails when code and that list disagree.

## Plugins

| Layer | Plugin | Notes |
|---|---|---|
| Engine | `factory` | Named `factory` (commands `/factory:*`), not `factory-core`. Also ships `diagnostician` (rung 3 is loop control) and the `implementation` stage, because the task loop is engine mechanics routed by `role.yaml` |
| Stage | `factory-analysis` | S0–S4, A0 Discovery, the prototype stage (dispatches `role:prototyper`) |
| Stage | `factory-quality` | adds an **acceptance** stage between planning and implementation |
| Stage | `factory-delivery` | docs, delivery, feedback (S9) |
| Role | `factory-role-frontend`, `factory-role-backend`, `factory-role-ai-agent` | |
| Adapter | `factory-adapter-github` | `adapter.yaml` only, dry-run by default |

## Deviations

**Pipeline**
- Acceptance tests are a stage of their own (`acceptance`) between planning and implementation,
  written from the spec while `src/` is unreadable; task gates ignore `*.acceptance.test.*` until
  verification.
- Verification, QA and a rejected GATE-C share one fix loop (`on_fail` / `on_reject: fix:implementation`):
  failures become fix items and the planner turns them into tasks. QA and the reviewer never create tasks.
- The engine, not an agent, runs git and the adapter (`after_pass: ship`); the release manager only
  writes the commit plan and the PR body.
- S9 is a `feedback` stage that runs when PR comments were fetched (`factory comments --file`), using
  the release manager's triage skill rather than a separate feedback-triager agent.
- The prototype trigger is one deterministic rule (new user-facing surfaces ≥
  `prototype.min_new_surfaces`). The prototype is plain HTML in the feature's sandbox.

- Greenfield A0 Bootstrap has an engine half, `factory scaffold` (the Conductor runs it when `step`
  says `scaffold`): it copies each role's boilerplate into its folder without overwriting anything,
  installs from the lockfile outside the state lock, and resumes after an interruption.
- Human notes are never left behind: notes open when the build runs, or given with `/factory:note`
  after it, go to the planner as fix items; an answer to a task's question is mapped to that task.
- The Bash guard is best effort (a shell is a full language): it blocks factory control commands and
  obvious writes and reads around the pack's rules; the gates keep the hard guarantees.

- Acceptance tests are a locked holdout: builders and test authors cannot read them, and they are
  hashed when gate-acceptance passes. Verification runs each stack's integration tests
  (`quality.integration_tests`), and AI tasks need a passing eval test per AC they claim.
- `release-manager` runs on sonnet, not haiku: it writes the PR trace and triages review comments,
  which the gates now check closely.

**Roles**
- `ai-test-author` exists: the role contract requires a test author per role.
- A role routes specialist builders by task type (`role.yaml agents.builders`: migration →
  migration-author, rag → rag-builder, eval → eval-author). The red phase always belongs to the test author.
- Role gate scripts are `role.yaml gates.checks`, run inside gate-impl (the AI role's eval run, the
  backend's migration check), not separate gate-impl / gate-verify scripts per role.
- `ai-architect` joins the architecture stage through a `role:architect` slot and writes
  `03-architecture/agent-design.md`; gate-arch requires it when such a role is enabled.
- `migration` and `eval` tasks are TDD-exempt: a migration is proven by its rollback check and the
  integration suite, an eval task is itself the test. A role may widen the file limit per task type
  (`budgets.task_limits`).
- Red tests must be new files: extending an existing test file cannot produce a provable red. A
  builder disputes a red test with a top-level envelope field `test_dispute`.

**Parallelism**
- Role tracks run in parallel in the main checkout — one task per role — when roles have separate,
  non-nested package folders (`roles.<role>.path`; backend defaults to `apps/api`, ai-agent to
  `apps/agents`, frontend to the root). Roles whose folders overlap take turns. Only one dispatch per
  agent type is live at a time, and a second human question waits until the first is answered. No git
  worktrees ([08](08-parallelism-and-flow.md#how-the-tracks-stay-independent)).
- Nested orchestrators are possible on the platform (subagents can spawn subagents); the single
  Conductor is a design choice ([02](02-architecture.md#why-the-hub-lives-in-the-main-session)).

**Files and formats**
- The delta-spec is `delta-spec.yaml`; acceptance criteria carry their text (`{id, text}`).
- The diagnosis file is `diagnosis/<stage-or-task>.md`.
- `context: fork` is used only on `/factory:doctor`.

## Not built yet

- `flow.policy: iterations` (batched gates at iteration planning and review): only Kanban is built.
- Worktrees per role track, pipelined red phases (`quality.tdd.pipeline_red`) and multi-feature WIP
  limits (`flow.kanban.wip`).
- A headless runner that gives each step a fresh context (`/factory:run` loops in the session).
- Coverage-of-changed-lines and axe gates (`quality.coverage_changed_lines_min`,
  `quality.axe_critical_max`) — they need stack commands that do not exist yet.
- Per-domain capability slices (Cartographer v2).
- Real-model golden runs: the harness (`tests/golden/run-golden.mjs`) exists; scorecards come when a run
  is approved.

## How it is verified

| Layer | Command | What it proves |
|---|---|---|
| Control plane | `npm run test:factory` | every gate rule, warden rung, fix loop, ship and role contract path, on Node 20 and 22 |
| Mocked end to end | `npm run test:factory:e2e` | GT-04 (S0–S9, real FSD stack), GT-11 (greenfield interview), GT-12 (late constraint, backend + frontend tracks in parallel, real stacks), backend and AI role scenarios on the boilerplates |
| Metrics | `factory metrics --md` | the [12](12-observability-and-evals.md#metrics-that-drive-iteration) metrics that the event log can answer |
| Consistency | `npm run check:factory` | duplication, wiring, model policy, line limits, drift from this design |
