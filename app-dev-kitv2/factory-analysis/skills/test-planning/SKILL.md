---
name: test-planning
description: Procedure for the factory test-strategist — plan which tests cover each acceptance criterion and at which level (unit, component, integration, acceptance, e2e, eval), linked to the task that makes them pass, before any code exists. Preloaded by the test-strategist; not for direct use.
user-invocable: false
---

# Test planning

Write `04-plan/test-plan.yaml` ([fa-test-plan.yaml](../../templates/fa-test-plan.yaml)).

## Levels

| Level | Use for | Written by |
|---|---|---|
| `unit` | a pure function or model rule (totals, validation) | role test author, red phase |
| `component` | one UI component's states and interactions | role test author, red phase |
| `integration` | an endpoint with its database, a graph with its tools | role test author, red phase |
| `acceptance` | an AC end to end through the public surface | acceptance-test author, from the spec only |
| `e2e` | a critical journey across features | acceptance-test author |
| `eval` | an AI behaviour scored against a golden set | eval author |

## Rules

- Every AC in the spec has at least one case; unhappy-path ACs get their own case.
- `task` names the task whose red tests contain the case (from `tasks.yaml`); leave it out for
  acceptance and e2e cases, which run at verification.
- `title` says the observable outcome with the AC's exact values, not the implementation.
- `data` names the fixture or seed the case needs when it is not obvious.
- Unchanged guarantees from a delta-spec are covered by the characterisation task, not by cases here
  (every case needs an AC).

Run the exit check from T0 before you return.
