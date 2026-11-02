---
name: test-planning
description: Procedure for the factory test-strategist — plan which tests cover each acceptance criterion and at which level (unit, component, integration, acceptance, e2e, eval), linked to the task that makes them pass, before any code exists. Preloaded by the test-strategist (and the planner in the patch tier); not for direct use.
user-invocable: false
---

# Test planning

Runs on: test-strategist (sonnet; the planner in the patch tier) — mapping every acceptance
criterion to planned cases at the right level before any code or test exists.

Write `04-plan/test-plan.yaml` ([fa-test-plan.yaml](../../templates/fa-test-plan.yaml)). The case
catalogue per AC kind, the backend endpoint matrix, frontend state and copy cases, AI-agent cases
and evals: [fa-test-matrix.md](references/fa-test-matrix.md).

## Procedure

1. **Read the pack.** T1 lists the stack knowledge per enabled role — `frontend-dev-kit:testing`,
   `node-backend-dev-kit:api-testing`, `node-agent-dev-kit:agent-evals` — load them with the Skill
   tool as reference. T2 gives the spec, stories (Gherkin with exact values), UX notes (states),
   the API contract (responses), `tasks.yaml` and the component map.
2. **Walk the ACs.** For each spec AC: its `kind`, the task that `satisfies` it, that task's
   `type` and role.
3. **Pick the cases** from the matrix: the level that proves the AC inside the task (unit,
   component, integration), plus an `acceptance` case when the AC crosses a public surface. Error,
   edge and permission ACs get their own cases.
4. **Cover every test-first task**: each task with `tdd.mode: required` gets at least one unit,
   component or integration case naming it — a fix task without an AC gets a case naming only the
   task.
5. **Write each case**: next free `TEST-nnnn`; `ac` and/or `task`; `level`; a `title` stating the
   observable outcome with the AC's exact values; `data` when the setup is not obvious.
6. **Check the pairs**: a case's AC is one its task satisfies; acceptance, e2e and eval-run cases
   for the whole feature carry no task unless an eval task owns them.
7. Run the exit check from T0. Failures about `tasks.yaml` are the planner's: return
   `needs_scope_change` when a task cannot be tested as planned.

## Rules

| Rule | Why |
|---|---|
| every spec AC has at least one case | `untested-ac` |
| a case names an AC, a task, or both | schema |
| its AC is one its task satisfies (characterisation tasks excepted) | `case-task-mismatch` |
| every test-first task has a unit, component or integration case | `task-without-case` |
| `task` and `ac` exist | `unknown-task`, `unknown-ac` |
| titles state outcomes, not implementation | the test author writes the assertion from it |
| no case for behaviour no AC or task asks for | speculative tests become dead weight |
| unchanged guarantees are covered by the characterisation task, not by cases here | one home |

## Choosing the level

| The AC is about | Level | Task type |
|---|---|---|
| a calculation, a rule, a mapper | `unit` | entity-model, service, validation, lib work |
| what a component shows in each state, an interaction | `component` | component, feature-ui, form, page |
| an HTTP status and body for a request | `integration` | endpoint |
| a graph run with its tools, approvals, limits | `integration` / `unit` | graph, node, tool |
| a model's choice or answer quality | `eval` | eval |
| the whole flow a user sees | `acceptance` | none (verification) |
| a journey across features | `e2e` | none (verification) |

## Mini example

AC-0002 (`error`): 'Applying an expired coupon shows "This coupon has expired" and leaves the total
unchanged', satisfied by TASK-003 (`feature-ui`).

```yaml
- { id: TEST-0002, ac: AC-0002, level: component, task: TASK-003, title: 'expired coupon shows "This coupon has expired" and the total stays 100.00 EUR', data: cart of 100.00 EUR, coupon OLD5 expired }
- { id: TEST-0007, ac: AC-0002, level: acceptance, title: 'applying an expired coupon at checkout shows "This coupon has expired"' }
```

## Never

- Read source code: plan from the spec, stories, UX notes, contract and tasks only.
- Change `tasks.yaml`: a task that cannot be tested as planned is `needs_scope_change`.
- Plan a red test that needs a real database, a network or a real model — those run at verification
  or in the eval suite.
