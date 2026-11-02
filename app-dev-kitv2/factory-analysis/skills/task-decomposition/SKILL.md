---
name: task-decomposition
description: Procedure for the factory planner — decompose a feature into small tasks (at most three files each) as a test-first DAG routed by role, with red tests and stubs declared, reuse recorded and every acceptance criterion satisfied. Preloaded by the planner; not for direct use.
user-invocable: false
---

# Task decomposition

Runs on: planner (opus; sonnet in the patch tier) — cutting a designed feature into small, ordered,
test-first tasks that a sonnet builder can finish in one pack.

Write `04-plan/tasks.yaml` ([fa-tasks.yaml](../../templates/fa-tasks.yaml)). Build orders per stack
(FSD, layered Express, LangGraph), change-request rules, every plan rule with its failure name, and
how to size a task: [fa-build-order.md](references/fa-build-order.md).

## Three jobs

| T0 mission | Job |
|---|---|
| planning stage, or `requirements-lite` (patch) | the whole plan below; in the patch tier also `test-plan.yaml` (`test-planning`) |
| "Replace TASK-… with 2–3 smaller tasks" (escalation rung 4) | split that task only: new IDs, same role, together the same `satisfies`; repoint dependants and move its test-plan cases; read `diagnosis/<task>.md` first when it exists; change nothing else |
| "… failed. Add fix tasks …" (verification or QA findings) | add one task per item, new IDs; keep done tasks as they are; a behaviour fix is test-first with a red test reproducing it and a test-plan case naming only the task; map the notes behind the items |

## Procedure (full plan)

1. **Read the pack.** T0: outputs, write paths, exit check (`gate plan`), next free TASK / TEST IDs.
   T1: "Plan rules (gate-plan checks every one)" — each enabled role's folder, `owns_paths`, task
   types and wider file limits — plus the stack skills to load as reference
   (`frontend-dev-kit:architecture-audit`, `node-backend-dev-kit:architecture-audit`,
   `node-agent-dev-kit:langgraph-agent`). T2: spec, stories, component map, API contract,
   agent design, capability map, prototype report.
2. **List the work** per component of the component map: what each `new` or `extend` component
   needs, which ACs it serves, which contract operation it builds or consumes.
3. **Order it** by the stack's build order (fa-build-order.md): FSD layers and segments; backend
   migration → service (with its repository) → validation → endpoint → OpenAPI; agent tools →
   state → nodes → graph → service → eval.
4. **Cut tasks**: one role, one type, at most the role's file limit, an honest `size.est_loc`
   below the limit, one to three ACs of one behaviour. Use the sizing table to split.
5. **Fill each task**:
   - `files_expected` — every file it creates or changes, inside the role's `owns_paths` (role
     folder prefix included), tests and generated files counted;
   - `tdd` — `mode: required` with `red_tests` (new test files, also in `files_expected`) and
     `stubs` (the signatures the tests import); or `mode: exempt` with a reason, only for a
     whitelisted type;
   - `satisfies` — the ACs it makes pass; `contract_ops` — the operations it builds or calls;
   - `reuse` — `considered` from the component map; `reuse_rejected: null` when it reuses, the
     reason when it creates something new;
   - `definition_of_done` — at most three checkable outcomes in the task's own terms;
   - `depends_on` — only tasks whose output it needs.
6. **Change request?** Characterisation task first, every task touching an `affected` file depends
   on it, a `removes:` task per removed REQ (fa-build-order.md § Change requests).
7. **Cross-check**: every spec AC in some `satisfies`; every new contract operation of an enabled
   role in `contract_ops` of a task of that role; no cycle.
8. **Map human notes** in `notes_mapped` (to REQ, AC or TASK IDs).
9. Run the exit check. Failures about `test-plan.yaml` are the test-strategist's (except in the
   patch tier); fix the rest.

## Test-first, in one table

| Task | `tdd` |
|---|---|
| any behaviour-bearing type | `required`; `red_tests` ⊆ `files_expected`; new files only; `stubs` listed |
| characterisation | `exempt`, reason "pins today's behaviour"; `characterisation: true`; no `satisfies` |
| migration, eval | `exempt` with a reason; may satisfy an AC |
| refactor, config, docs, styling-token, dependency-bump, rename | `exempt` with a reason; never satisfies an AC |
| fix for a review finding | `required`: a red test that reproduces the defect |

## Mini example (frontend + backend)

```yaml
- id: TASK-004
  role: backend
  type: endpoint
  title: POST /api/v1/orders/{orderId}/reorder
  depends_on: [TASK-003]
  satisfies: [AC-0001, AC-0002]
  contract_ops: [reorderOrder]
  files_expected: [apps/api/src/controllers/orders.controller.ts, apps/api/src/routes/orders.routes.ts, apps/api/src/container.ts, apps/api/tests/unit/routes/orders-reorder.routes.test.ts]
  tdd: { mode: required, red_tests: [apps/api/tests/unit/routes/orders-reorder.routes.test.ts], stubs: ["OrdersController.reorder(req, res): Promise<void>"] }
  reuse: { considered: [orders.routes], reuse_rejected: null }
  definition_of_done: ["201 with added and skipped lines; 404 ORDER_NOT_FOUND for another customer's order"]
  size: { files: 4, est_loc: 140 }
```

TASK-003 is the `service` task (repository method, its in-memory fake, the service and its test);
the frontend's `api-client` task for `reorderOrder` depends on neither — it builds against the
contract.

## Never

- Implement anything, or write a task whose files lie outside its role's `owns_paths`.
- Put an existing file in `red_tests` (passing tests are never a valid red).
- Mark a behaviour-bearing task exempt to save a step.
- Satisfy an AC with a refactor, config or docs task.
- Change the component map's decisions: return `needs_scope_change` when the plan cannot follow them.
