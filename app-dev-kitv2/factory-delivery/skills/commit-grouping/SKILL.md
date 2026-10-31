---
name: commit-grouping
description: Procedure for the factory release manager — plan one conventional commit per finished task with a Factory-Task trailer, plus one docs commit, as 08-delivery/commits.yaml for the engine to execute. Preloaded by the release-manager; not for direct use.
user-invocable: false
---

# Commit plan

Write `08-delivery/commits.yaml`:

```yaml
feature: FEAT-001
commits:
  - task: TASK-002
    message: |
      feat(order): subtract the coupon discount from the total

      Factory-Task: TASK-002
      Factory-ACs: AC-0003
    files: [src/entities/order/model/total.ts, src/entities/order/model/total.test.ts]
  - message: "docs: coupons at checkout (FEAT-001)"
    files: [docs/features/FEAT-001-coupons-at-checkout.md, CHANGELOG.md]
```

Rules (the ready gate checks them):

- One commit per **done** task (the change set lists them), in dependency order, with exactly that
  task's `files_expected` (those that exist) and the trailers `Factory-Task` and `Factory-ACs`.
- Conventional subject: `feat|fix|test|refactor|docs|chore(scope): imperative summary`.
- One `test:` commit with the feature's acceptance tests (`*.acceptance.test.*` naming its ACs).
- One docs commit with the files the tech writer wrote. No file outside a task, the acceptance tests
  or the docs; every file of a done task that exists must be in a commit.
- The engine names the branch (`policy.branch_pattern`) and also commits the feature's `.factory/`
  folder; do not list either.
