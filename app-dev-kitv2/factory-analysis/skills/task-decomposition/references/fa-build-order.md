# Build order, task sizing and plan rules

A task is a **vertical slice**: one FSD slice or component folder (or one endpoint) of one story, built
test-first end to end by one builder dispatch. The segment order below is the order of work INSIDE a
slice task, not a list of tasks; the table rows are the task types a slice task may carry.

Used by `task-decomposition` (planner, S4 and the patch tier). The plan rules mirror what T1 prints
under "Plan rules (gate-plan checks every one)" — `planRules()` in the engine's conductor — and what
`gates/plan.mjs` checks. Each role pack's builder has its own file-by-file order inside a task; this
file decides which tasks exist and in what order.

## General order

Structure before logic, inside out:

1. characterisation (change requests only) — pins today's behaviour;
2. data shape and storage — types, schema, migration;
3. logic — models, services, tools;
4. interface — UI, routes, graph wiring;
5. composition — pages, routers, containers, app wiring;
6. documentation artefacts the gates read — the backend's OpenAPI registration, evals.

`depends_on` names a task only when this task needs that task's **output** (a function it imports, a
table it queries, a file it edits after the other). Never add order for its own sake: tasks of
different roles run in parallel lanes, one task per role at a time.

The API contract was agreed at S3, so a frontend api-client task never waits for the backend
endpoint task: both build against `api-contract.yaml`.

## Frontend — Feature-Sliced Design (frontend-dev-kit)

**Layer order:** `shared` → `entities` → `features` → `widgets` / `pages` → `app`. A layer may import
only from layers below it, so a task never depends on a task of a higher layer.

**Segment order inside one slice:** `model` (types, pure rules) → `api` (fetchers, the query or
mutation hook) → `hooks` (navigation, local UI state) → `lib` (pure helpers) → `ui` → `index.ts` (the
public API, extended by the task that adds an export).

| Work | Task type | Typical files |
|---|---|---|
| types and pure rules of a business object | `entity-model` | `src/entities/<e>/model/<x>.ts` + its test |
| fetchers for a contract operation | `api-client` | `src/entities/<e>/api/…` or `src/features/<f>/api/…` + test; `contract_ops: [<operationId>]` |
| a query or mutation hook | `query-hook` | the hook in the slice's `api/` + test |
| a shared primitive or display component | `component` | `src/shared/ui/<c>/…` or `src/entities/<e>/ui/<c>/…` + test |
| one user action with its UI | `feature-ui` / `form` | `src/features/<f>/ui/<c>/…` + test |
| a routed screen | `page` | `src/pages/<p>/…` + test |
| routing, guards | `route` | `src/app/router/…` + test |
| client state | `store` | the store module + test |
| copy only | `i18n` | the slice's `locales/` files |
| design tokens | `styling-token` | theme files (test-exempt) |

Count every file the stack's layout needs: the component, its `styles.ts`, its folder `index.ts`, the
slice `index.ts` when it gains an export, and the test under `<component>/tests/` (the stack's
`frontend-dev-kit:testing` skill gives the test locations) — about four files per component. The engine
adds the convention files you forget (plan lint, from the role's `component_files`). One component with its
sub-components is ONE task (`slice: overview-header`, `write_scope: [src/features/x/ui/overview-header/**]`,
about 12 files at most); a component that does not fit is two tasks only when its parts are separate
behaviours, never because it has several files.

Typical slice tasks for a new side panel: the entity model and its fetchers (`entity-model` /
`api-client` with the query hook), one task per panel section component folder, the page wiring with the
locale files. That is about 5–8 tasks for a small feature.

Typical chain for a new feature: `entity-model` → `api-client` (with its `query-hook` when it is the same
slice) → `feature-ui` per section → `page` (or extend an existing page) → `route` when the screen is new.

## Backend — layered Express (node-backend-dev-kit)

For the stack's layering routes → controllers → services → repositories → db, composed in
`src/container.ts`:

**Order:** schema / migration → repository → service → validation → controller → route →
composition → OpenAPI registration.

The role's budgets (T1 plan rules) set the file cap per type: `migration` up to 6 files, `endpoint` up to
12, `service` and `repository` up to 8. An endpoint task may carry its validation schema, its service and
repository method, and the route (one story, one endpoint, one task). Map the order onto tasks like this (paths inside the role folder, e.g.
`apps/api/`):

| Step | Task type | Files |
|---|---|---|
| table and migration | `migration` | `src/db/schema/<table>.ts`, `src/db/schema/index.ts`, `drizzle/<NNNN>_<name>.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/<NNNN>_snapshot.json`, `drizzle/rollback/<NNNN>_<name>.down.sql` (test-exempt; may satisfy an AC) |
| repository + service | `service` | `src/repositories/<r>.repository.ts`, its method in `tests/helpers/in-memory-repositories.ts`, `src/services/<r>.service.ts`, `tests/unit/services/<r>.service.test.ts` |
| request validation | `validation` | `src/schemas/<e>.schema.ts`, `tests/unit/schemas/<e>.schema.test.ts` |
| controller + route + composition | `endpoint` | `src/controllers/<r>.controller.ts`, `src/routes/<r>.routes.ts`, `src/routes/index.ts`, `src/container.ts`, `tests/unit/routes/<r>.routes.test.ts`; `contract_ops: [<operationId>]` |
| OpenAPI registration | `openapi` | `src/openapi/document.ts`, `tests/unit/openapi/document.test.ts` |

A repository has no unit-level red test of its own (real SQL is proven at verification; unit tests
use the in-memory fake), so plan its method inside the `service` task that proves it through the fake.
A schema change always gets its own `migration` task first, and a destructive statement needs a human
note (`policy.human_owned: destructive_migration`).

## AI agent — LangGraph (node-agent-dev-kit)

**Order:** tools → state → nodes → graph → service → eval.

| Step | Task type | Files (under `src/agents/<name>/` unless noted) |
|---|---|---|
| a capability the model can call | `tool` (up to 8 files) | `tools/<tool>.ts`, `tools/index.ts`, its dependency interface, `tests/unit/agents/<name>-<tool>.test.ts` |
| run data | `state` / `memory` | `state.ts` + the graph test that proves the field |
| fixed prompts and replies | `prompt` | `prompts.ts` + test |
| one reasoning step or guard | `node` / `guardrail` | `nodes/<node>.ts` (and `src/guardrails/…`) + test |
| the flow | `graph` (up to 10 files) | `graph.ts`, the state or node it needs, `tests/unit/agents/<name>.test.ts` |
| service wiring | `graph` (or `model` / `memory` when only those change) | `src/services/<name>.service.ts`, `src/container.ts` |
| streaming and run observability | `streaming` | the SSE route and callbacks; HTTP routes and schemas follow the backend layering |
| retrieval | `rag` (up to 8 files) | `src/rag/…` + test |
| golden set | `eval` | `evals/golden/<agent>.json`, `evals/<agent>.eval.ts` (test-exempt; may satisfy an AC) |

When `03-architecture/agent-design.md` exists, its topology, state and tool list are binding: one
task per tool, then state, then nodes, then the graph.

## Change requests

- The **first** task writes characterisation tests for every file the delta-spec `modified`
  entries list in `affected`: `type: characterisation`, `characterisation: true`,
  `tdd: { mode: exempt, reason: … }`, `satisfies: []`. Its definition of done names every
  `unchanged_guarantees` entry. These tests pass before the change by design.
- Every task that edits an `affected` file depends on it, directly or through another task
  (`change-before-characterisation` otherwise).
- Each `removed` requirement gets a task with `removes: [REQ-…]`, usually with a test proving the
  behaviour is gone (`removal-without-task`).
- Existing tests that pin the old behaviour are in some task's `files_expected`.

## Plan rules (what T1 prints and the gate checks)

| Rule | Failure |
|---|---|
| a task's files sit only in its role's `owns_paths`; its `type` is one of the role's task types | `outside-owns-paths`, `unknown-task-type`, `unknown-role` |
| at most `files_max` `files_expected` (default 12) and `loc_max` estimated LOC (default 600), or the role's cap for that type; a `write_scope` glob counts as the files listed, not as one; `size.est_loc` always set | `too-many-files`, `too-large`, `no-estimate` |
| at most `tasks_max` tasks in the plan (default 10) | `too-many-tasks` |
| `write_scope` entries are folder globs inside the role's `owns_paths` | `write-scope-not-a-glob`, `outside-owns-paths` |
| plan lint: the role's `component_files` convention (frontend: `styles.ts`, `index.ts`, `tests/<name>.test.tsx` next to a new `<name>.tsx`) is added to `files_expected` by the engine, with a warning | `convention-files-added` (warning) |
| a fix round adds no task to a slice an existing task owns (`slice`): amend that task | `new-task-in-owned-slice` |
| test-first for every type except `quality.tdd.exempt_types`; an exempt task needs a whitelisted type and a reason | `missing`, `bad-exemption` |
| an exempt task satisfies no AC unless it is a `migration` or `eval` | `exempt-satisfies` |
| a test-first task lists `red_tests`, each in `files_expected`, each a test file, each a new file — or an existing test file of the task's own `write_scope` / `slice`, which it extends | `no-red-tests`, `red-test-not-expected`, `red-test-not-a-test`, `red-test-exists` |
| every spec AC satisfied by a task and tested by a planned case | `unsatisfied-ac`, `untested-ac` |
| every test-first task has a unit, component or integration case naming it | `task-without-case` |
| a case's AC is one its task satisfies | `case-task-mismatch` |
| dependencies exist; no cycle | `unknown-dependency`, `cycle` |
| a new contract operation (enabled `owner_role`, not `status: existing`) is in `contract_ops` of a task of that role | `contract-op-without-task` |
| change requests: characterisation first; a removed REQ has a task | see above |
| every human note made so far is mapped (or declined) | `unmapped`, `dangling` |

Exempt types by default: characterisation, refactor, config, docs, styling-token, dependency-bump,
rename, migration, eval.

## Sizing a task for the builder

Builders run on sonnet with a pack of about 60k tokens, 20 extra reads and three attempts, and each one
dispatch writes the red tests and the code. A task fits when a builder can hold the whole slice at once and
prove it with its own red tests. Split it when:

| Sign | Why it is too big | Split into |
|---|---|---|
| more than 8 ACs, or ACs of two unrelated behaviours | the red tests cover several behaviours; one failing blocks all | one task per behaviour |
| it spans two layers that two stories own (an entity and an unrelated feature UI) | two procedures and two golden files in one pack | one task per slice |
| it creates a shared abstraction and its first consumer in two slices | the abstraction's shape is decided under pressure | the abstraction, then the consumer |
| the builder would need a design decision the component map or an ADR does not record | it guesses, and review rejects it | send it back: `needs_scope_change` to the architect |
| it needs more than the role's file cap | the read allowance runs out | split by slice, never by segment |
| it changes a contract operation and its UI | two roles' concerns | one task per role |
| a state machine with many transitions, or concurrency rules | many paths, one task | one task per transition group |
| the estimate is near the LOC limit | estimates run low | split before the gate does |

Do **not** split because a slice has several files, segments or components: one task per slice is the unit
(44 tasks for one side panel came from 3-file caps, one test per task and a task per fix item). A good
task has a small cluster of public signatures in `stubs`, three to eight ACs of one slice, a definition of
done a test can check, and a golden file of the same type. When a task keeps failing, the engine's rung 4
asks you to AMEND it from the diagnosis (scope, definition of done), never to split it: rung 4 amends,
and a split happens only through a human `/factory:split` for two unrelated behaviours.
