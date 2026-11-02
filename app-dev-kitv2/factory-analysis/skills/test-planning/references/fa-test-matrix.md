# Test matrix: which cases to plan per AC and task

Used by `test-planning` (test-strategist, S4; planner in the patch tier). This decides **which cases
exist**; each role's test author decides how to write them (the roles' red-test procedures expand
every row into assertions). Plan only cases an AC or a task asks for — no speculative rows.

## Levels and who runs them

| Level | Proves | Runs | Written by |
|---|---|---|---|
| `unit` | a pure function, a model rule, a service over in-memory repositories, a tool, a node | task gate, every attempt | the role's test author (red) |
| `component` | one UI component or feature slice: states and interactions | task gate | frontend test author (red) |
| `integration` | an HTTP route through router, controller and service over in-memory fakes; a graph with a scripted model and its real tools | task gate (as unit-project tests) | the role's test author (red) |
| `acceptance` | an AC end to end through the public surface, from the spec only | verification | acceptance-test author |
| `e2e` | a critical journey across features | verification | acceptance-test author |
| `eval` | a model's choices against a golden set (real model, costs money) | `gate impl` of model-facing tasks, and once in full at verification | eval author |

Tests against a real Postgres (Testcontainers) run only at verification; a red test never needs
Docker. `acceptance` and `e2e` cases carry no `task`.

## Per AC kind

| AC kind | Plan at least |
|---|---|
| `happy` | one case at the level of the task that satisfies it |
| `error` | its own case (never merged with the happy one), asserting the exact copy or problem `code` |
| `edge` | one case per boundary the AC names (0, the limit, limit + 1) |
| `permission` | one case for the allowed caller and one for the refused one, asserting what the refused caller sees |
| `nfr` | a measurable check where a test can hold it (a call count, a size, an axe rule); otherwise an `acceptance` case |

A `must` requirement's ACs also get an `acceptance` case each when they cross a public surface.

## Backend endpoint matrix

For an `endpoint` task, plan a case per row the task's ACs and the contract operation cover — the
contract's responses tell you which apply:

| Row | Plan when | Title shape |
|---|---|---|
| 201 created | a `POST` that creates | "AC-n returns 201 with the created <entity>" |
| 422 missing field | the body has required fields | "AC-n returns 422 when <field> is missing" |
| 422 unknown field | any body (strict validation) | "returns 422 for an unknown field" |
| 409 conflict | a unique value or a state clash in the contract | "AC-n returns 409 <CODE> for a duplicate <field>" |
| 200 read / update | a `GET` by id, a `PATCH` | "AC-n returns 200 with the <entity>" |
| 404 not found | any id in the path; also another owner's row | "returns 404 <CODE> for an unknown or foreign <entity>" |
| paginated list | a collection `GET` | "AC-n lists <n> items per page with a next cursor" |
| 204 deleted | a `DELETE` | "AC-n returns 204 and the <entity> is gone" |
| 401 unauthenticated | a protected operation | "returns 401 without a token" |
| 403 wrong role | a role-restricted operation | "AC-n returns 403 for a <role>" |

**Service** unit cases (the `service` task, over in-memory repositories): the happy return value,
each domain error the ACs name (not found, not owner, conflict, a business rule), the owner taken
from the principal, and the repository called with the expected arguments. Never plan a case that
mocks the database driver or query builder.

## Frontend component and feature cases

For a `component`, `feature-ui`, `form` or `page` task:

- **Four states** — one case each for `loading`, `empty`, `error` and the success state the UX notes
  list for the surface, plus one per extra state an AC adds (`expired`, `limit-reached`).
- **Copy assertions** — every quoted string of the task's ACs is asserted as the English text the
  user sees (the locale value), never as a translation key.
- **Interactions** — one case per user action an AC describes, through what the user sees (role,
  label), with the exact values.
- **Boundary mocking only** — the slice's own fetchers or the shared HTTP client, the router,
  missing browser APIs, time. Never another slice, shared UI components or i18n.
- `entity-model`, `api-client`, `query-hook` tasks: `unit` cases for each rule and each contract
  response the hook maps (success and each error status).

## AI-agent cases

For `tool`, `node`, `graph`, `prompt`, `guardrail` tasks — hermetic, with a scripted model:

| Case | Level | Plan when |
|---|---|---|
| tool call routed and answered | `integration` | the graph gains or changes a tool |
| **no tool needed** — the reply comes without a tool call | `unit` + an `eval` golden with `expectedTools: []` | always for a tool-using agent |
| **runaway loop** — the model keeps calling tools; the run stops at the iteration cap or recursion limit with the fixed message | `unit` | every graph with a loop |
| **write tool blocked without approval** — no side effect until a human approves; rejected → never runs | `integration` | a tool that creates, changes, sends or pays |
| guardrail blocks an injection; a benign look-alike passes | `unit` | a guardrail task, or a prompt rule |
| provider down → degraded reply or 503 | `integration` | the service wiring changes |
| another user's thread → 404 | `integration` | thread or memory access changes |

For the `eval` task, plan `eval` cases per behavioural AC: at least one golden per tool (the expected
tool named), one with `expectedTools: []`, one unknown-topic case, one injection case
(`expectBlocked`), and one per prompt rule the ACs state. The suite's pass-rate threshold lives in the
suite itself.

## Change requests

Characterisation tests belong to the characterisation task: list each unchanged guarantee in its
definition of done, not as cases here. A case may name the characterisation task without an AC when
you want it visible in the plan.

## Data

`data` names what a case needs when it is not obvious: "a cart of 100.00 EUR with coupon OLD5
expired yesterday", "two users with 21 orders each", "golden knowledge.json". Use the values the
Gherkin already gives.
