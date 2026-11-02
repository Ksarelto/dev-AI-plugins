# Commit plan rules — what gate-ready checks, and how to satisfy it

The engine executes `08-delivery/commits.yaml` in order on the feature branch: for each entry it
stages exactly `files` (`git add --all -- <files>`, so a deleted path is staged as a deletion) and
commits them with `message`; an entry whose files are already committed is skipped. Then it commits
the feature's `.factory/` record itself (`chore(factory): FEAT-nnn artifacts`). You never run git
to change anything; read-only git (`git status`, `git diff --stat`) is fine.

## Rule by rule (factory/scripts/gates/ready.mjs)

| Rule | Fails when | How to avoid it |
|---|---|---|
| `schema` | the file does not match `commit-plan.schema.json` | top level `feature`, `commits` (≥1); each commit only `task?`, `message`, `files` (≥1) |
| `task-without-commit` | a task whose state is `done` has no commit with `task: <id>` | one commit per done task; the change set lists them |
| `uncommitted-file` | a feature file is in no commit: a done task's `files_expected` that exists or changed, an acceptance test file, a scaffold file, the old path of a planned file that was moved | list every one of them |
| `unplanned-file` | a committed file is in no task's `files_expected` and no scaffold list, and is not `docs/**`, `CHANGELOG.md`, `README.md` or `*.acceptance.test.*` | never add files no task planned; if the working tree has one, see "Files outside the plan" |
| `not-conventional` | a subject line does not match `type(scope)!?: subject` with type in `feat fix refactor test docs chore perf style build ci` | see "Messages" |
| `no-trailer` | a commit with `task: TASK-nnn` lacks the line `Factory-Task: TASK-nnn` in its message | add the trailer block |
| `mislabelled-file` | a file in the commit for TASK-x is not in TASK-x's `files_expected` (nor the new path of one it planned) | each task commit holds only its own files |
| `uncommitted-change` | a file the feature changed since its baseline (git, `.factory/` excluded) is in no commit | the plan must cover the whole working-tree change |

## Inputs and where each fact comes from

| Need | Source |
|---|---|
| done tasks, their files, order | `06-verify/change-set.yaml` (`tasks[].id/files/satisfies`, `scaffold`, `outside_plan`, `changed`) and `04-plan/tasks.yaml` (`depends_on`, `files_expected`, `type`, `title`, `satisfies`, `removes`) |
| acceptance test files | the change set's `changed` entries matching `*.acceptance.test.*` |
| docs files | `08-delivery/docs-report.md` (the tech writer lists every file it wrote) |
| what really changed | `git status --porcelain --untracked-files=all -- . ':(exclude).factory'` |

## Order

1. `chore(scaffold): <role> starter` — greenfield only, when the change set lists `scaffold` files
   (one commit per role, or one for all; no `task`).
2. One commit per done task in dependency order (`depends_on` first; ties by task ID).
3. `test(<scope>): acceptance tests for <feature>` with every `*.acceptance.test.*` file.
4. `docs(<scope>): <feature title> (FEAT-nnn)` with every file of the docs report.

## Messages

```
<type>(<scope>): <imperative subject, lower case, no period, ≤ 72 chars>

<optional body: one or two sentences — why, from the task's title and definition_of_done>

Factory-Task: TASK-003
Factory-ACs: AC-0001, AC-0002
Factory-Feature: FEAT-001
```

- **Type** from the task:

  | Task | Type |
  |---|---|
  | new user-visible behaviour (feature-ui, page, endpoint, tool, rag, …) | `feat` |
  | a fix task (from review, QA, a GATE-C rejection or a PR comment) | `fix` |
  | characterisation, eval, red-test-only work | `test` |
  | refactor (no behaviour change) | `refactor` |
  | config, dependency bump, tooling | `chore` (or `build`/`ci` for build or CI files) |
  | styling-token without visible change | `style`; with visible change `feat` |
  | migration | `feat(db)` (or `fix(db)` in a fix task) |
  | performance work for an NFR | `perf` |

- **Scope**: the slice, resource or agent the task's files live in — FSD slice (`apply-coupon`,
  `order`, `checkout`), backend resource (`projects`), agent name (`support-agent`), `db` for
  migrations. Lower-case kebab.
- **Breaking**: a task that removes or changes a public API (it `removes` a REQ whose surface others
  use, or a human note approved `public_api_removal`) gets `!` after the scope and a
  `BREAKING CHANGE: <what callers must change>` line before the trailers.
- **Trailers**: a blank line, then `Factory-Task` (required for a task commit), `Factory-ACs` (the
  task's `satisfies`, comma-separated; omit when empty), `Factory-Feature`. No other trailers; no
  co-author lines.

## Special cases

- **Moved or renamed files**: list the new path and the old path in the same task commit (git
  records the move from both). The gate adds the old path of a planned file automatically.
- **Deleted files**: a task that deletes a planned file lists that path; `git add --all` stages the
  deletion.
- **A file planned by several done tasks** (a fix task changing an earlier task's file): list it in
  each of those task commits. The engine commits the file's final content with the first commit that
  lists it and skips a later commit whose files are all committed already — note that in the summary
  so the reviewer knows the fix is folded into the earlier commit.
- **A done task whose files did not change** (an idempotent skip): still give it its commit with its
  existing `files_expected`; the engine skips it when there is nothing to commit.
- **Tasks not done** (parked for a disabled role, or cancelled): no commit. If their files changed in
  the working tree, that is an `uncommitted-change` — report it in `deviations` instead of hiding the
  files in another commit.
- **Files outside the plan** (`outside_plan` in the change set, or a `??` in git status that no task
  planned and that is not docs or an acceptance test): you cannot commit them (`unplanned-file`) and
  cannot leave them (`uncommitted-change`). Return `blocked` with `error.type: "validation"` naming
  the files; the human decides (revert them, or replan).
- **Branch and `.factory/`**: the engine names the branch from `policy.branch_pattern` and commits
  `.factory/` itself; never list either.
