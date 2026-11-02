---
name: commit-grouping
description: Procedure for the factory release manager — plan one conventional commit per finished task with a Factory-Task trailer, plus one docs commit, as 08-delivery/commits.yaml for the engine to execute. Preloaded by the release-manager; not for direct use.
user-invocable: false
---

# Commit plan (S8)

Runs on: release-manager (sonnet) — one mechanical planning pass per feature at delivery, before the PR body; the engine executes the plan.

You decide which files go in which commit and what each message says. The engine creates the branch,
runs `git add` / `git commit` from your plan, commits `.factory/`, then pushes and opens the PR
through the adapter (dry-run by default). You never run a git command that changes anything.

## Procedure

1. **Read** `06-verify/change-set.yaml` (done tasks with their files and ACs, `scaffold`,
   `changed`, `outside_plan`), `04-plan/tasks.yaml` (`depends_on`, `files_expected`, `type`,
   `title`, `satisfies`, `removes`) and `08-delivery/docs-report.md` (the docs files).
2. **Check the working tree**:
   `git status --porcelain --untracked-files=all -- . ':(exclude).factory'`. Every path it shows
   must land in exactly the commit the rules below give it. A path no task, scaffold, acceptance
   test or docs file explains → stop: return `blocked` naming it (you can neither commit nor leave it).
3. **Order the commits**: scaffold (greenfield), then one per done task in dependency order, then
   the acceptance tests, then the docs.
4. **Fill each task commit** with that task's `files_expected` that exist or changed — plus deleted
   paths and both paths of a move — and nothing from another task.
5. **Write each message**: conventional subject (`type(scope): subject`, type from the task — see
   the table in [fd-commit-rules.md](references/fd-commit-rules.md#messages)), an optional one-line
   body, then the trailers `Factory-Task: TASK-nnn`, `Factory-ACs: …` (the task's `satisfies`),
   `Factory-Feature: FEAT-nnn`.
6. **Write** `08-delivery/commits.yaml`.
7. **Self-check** against the gate: every done task has a commit; every changed path from step 2 is
   in a commit; no file appears in a task commit it does not belong to; every subject matches
   `^(feat|fix|refactor|test|docs|chore|perf|style|build|ci)(\([^)]+\))?!?: .+`.
8. Continue with `pr-assembly`; the exit check (`gate ready`) covers both files.

## What gate-ready checks in the plan

Schema; a commit per done task (`task-without-commit`); every feature file committed — done tasks'
files, acceptance tests, scaffold files, moved-from paths (`uncommitted-file`); no file outside the
plan except docs, `CHANGELOG.md`, `README.md` and acceptance tests (`unplanned-file`); conventional
subjects (`not-conventional`); the `Factory-Task` trailer on task commits (`no-trailer`); task
commits hold only their task's files (`mislabelled-file`); nothing the feature changed is left out
(`uncommitted-change`). Rule-by-rule detail and special cases (renames, files shared by a fix task,
parked tasks, files outside the plan): [fd-commit-rules.md](references/fd-commit-rules.md).

## Worked example

```yaml
feature: FEAT-001
commits:
  - task: TASK-001
    message: |
      test(order): characterise the order total

      Factory-Task: TASK-001
      Factory-Feature: FEAT-001
    files: [src/entities/order/model/total.characterisation.test.ts]
  - task: TASK-002
    message: |
      feat(order): subtract the coupon discount from the total

      The total is sum(lines) - discount + shipping, with the discount clamped at zero.

      Factory-Task: TASK-002
      Factory-ACs: AC-0003
      Factory-Feature: FEAT-001
    files: [src/entities/order/model/total.ts, src/entities/order/model/total.test.ts]
  - task: TASK-003
    message: |
      feat(apply-coupon): coupon field with discount and errors

      Factory-Task: TASK-003
      Factory-ACs: AC-0001, AC-0002
      Factory-Feature: FEAT-001
    files: [src/features/apply-coupon/ui/coupon-field/coupon-field.tsx, src/features/apply-coupon/ui/coupon-field/tests/coupon-field.test.tsx]
  - task: TASK-004
    message: |
      fix(checkout): render the coupon field on the checkout page

      Factory-Task: TASK-004
      Factory-ACs: AC-0001
      Factory-Feature: FEAT-001
    files: [src/pages/checkout/ui/checkout-page.tsx, src/pages/checkout/ui/checkout-page.test.tsx]
  - message: "test(checkout): acceptance tests for coupons at checkout"
    files: [src/pages/checkout/checkout.acceptance.test.tsx]
  - message: "docs(checkout): coupons at checkout (FEAT-001)"
    files: [docs/features/FEAT-001-coupons-at-checkout.md, docs/adr/adr-001-discount-in-total.md, CHANGELOG.md]
```

TASK-004 is a fix task the planner added after verification (P1 finding RV-1): its type is `fix`.
A greenfield feature starts with `- message: "chore(scaffold): frontend starter"` listing the change
set's `scaffold` files.

## Must not

- Squash tasks together, split one task over two commits, or move a file to the commit of a task
  that did not plan it.
- List `.factory/` paths or a branch name; run `git add`, `git commit`, `git push`, `gh`.
- Leave a changed file out of the plan to make the gate pass, or add one no task planned.
