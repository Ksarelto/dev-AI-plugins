---
name: migration-authoring
description: Procedure for the factory migration author — one Drizzle schema change shipped as the schema file, a forward SQL migration with its journal entry, and a rollback file; destructive statements only with a human approval note. Preloaded by migration-author; not for direct use.
user-invocable: false
---

# Author one migration

Runs on: migration-author (sonnet) — one `migration` task: a single Drizzle schema change, its generated SQL, journal and snapshot, and a hand-written rollback (six files at most).

Workflow of the stack: `node-backend-dev-kit:drizzle-database` and its migrations reference (read
both; T1 lists them). Forward → rollback pairs and a worked example:
[be-rollback-pairs.md](references/be-rollback-pairs.md).

## The files (all must be in T0's list)

| File | Written by |
|---|---|
| `src/db/schema/<table>.ts` and its export in `src/db/schema/index.ts` | you: the Drizzle table definition |
| `drizzle/<tag>.sql` (`<tag>` = `NNNN_<name>`) | `npm run db:generate -- --name <name>`; you read it and may add approval comments |
| `drizzle/meta/_journal.json`, `drizzle/meta/<NNNN>_snapshot.json` | `db:generate`; never edit by hand |
| `drizzle/rollback/<tag>.down.sql` | you: the statements that undo the forward SQL, in reverse order |

`db:generate` needs no database. Its files are written through Bash, so the write hook does not see
them: each must be in T0's files or the commit plan leaves it out. A missing one (often the snapshot,
or `schema/index.ts`) → stop with `needs_scope_change` naming it.

## Procedure

1. **Read** T0 (task, AC text, files), T1 (skills, `rules/database.mdc`, human notes), T2 (the
   component map and contract entries that need the column), and the current `src/db/schema/`.
2. **Never edit an applied migration.** A `drizzle/*.sql` whose tag is already in the journal at
   `HEAD` (`git show HEAD:drizzle/meta/_journal.json`) has run somewhere. If T0 asks you to change
   one, return `needs_scope_change`: the change is a new migration.
3. **Design the change additive first.** New table, nullable column, column with a default, new
   index, new FK with `onDelete` — these need nothing more. A change that is not additive on a
   populated table (NOT NULL without default, rename, type change, drop) follows the multi-step
   sequence of the stack's migrations reference; your task is one step of it.
4. **Edit the schema**: uuid primary key with `defaultRandom()`, `withTimezone` timestamps, `onDelete`
   on every FK, an index for every FK and keyset `(owner_id, created_at, id)`, `uniqueIndex` for
   business uniqueness, row types exported, table re-exported from `schema/index.ts`.
5. **Generate**: `npm run db:generate -- --name <snake_name>`. If drizzle-kit asks whether a column
   was renamed, the answer decides data survival — a rename keeps data, "create" drops it. Prefer
   making the change unambiguous (one change per migration) over guessing.
6. **Read the SQL** with the checks at the end of [be-rollback-pairs.md](references/be-rollback-pairs.md).
7. **Classify every statement** with the check's own list. Destructive:
   `DROP TABLE|COLUMN|TYPE|SCHEMA|VIEW|CONSTRAINT`, `TRUNCATE`, `ALTER COLUMN … TYPE` / `SET DATA TYPE`,
   `ALTER COLUMN … SET NOT NULL`, `RENAME COLUMN` / `RENAME TO`, any statement starting with
   `DELETE FROM`, and an `UPDATE … SET` with no `WHERE`. Note that an FK `onDelete` change makes
   drizzle emit `DROP CONSTRAINT` + `ADD CONSTRAINT`, which counts too.
8. **Destructive without an approval note** → do not finish the migration. Return
   `needs_clarification` (section below).
9. **Write the rollback** `drizzle/rollback/<tag>.down.sql`: the reverse of every forward statement,
   in reverse order, real SQL, `IF EXISTS` where Postgres allows it.
10. **Run the exit check** (`gate impl`): typecheck, lint, build, the tests the change touches, and the
    role's migration check.

## Asking for a destructive statement

One question per destructive statement, in `open_questions`, written so a human can decide without
opening the repo:

> Migration `0004_drop_project_legacy` (TASK-009) runs `ALTER TABLE "projects" DROP COLUMN "legacy_code"`.
> It deletes the value in every row (about N rows in production, unknown here); no code reads it
> since TASK-006. Rollback re-adds the column empty. Alternative: keep the column one more release.
> Approve the drop?

Name the migration tag in the question: a mapped (or done) note counts as this task's approval when it
is mapped to the task or its text names one of the task's migration tags. The human's answer becomes a note `HD-n`; the planner maps
it to your task, and your next dispatch shows it in T1 "Human notes" with its status.

| Note in T1 | Do |
|---|---|
| `mapped → TASK-<this>` (or `done`) and it approves | put `-- factory: approved HD-n` on the line directly above the statement, inside the generated file; then the rollback; then the exit check |
| approves something else, or `declined` | write only the additive part; record the rest in `follow_up_suggested`; the check refuses the approval line |
| still `open` | do not write the approval line — the check fails with "still open"; return `needs_clarification` again |

Never approve your own statement, never put the approval comment on an additive statement "to be
safe", and never split a destructive statement so the regex misses it.

## What the migration check fails on

`scripts/check-migrations.mjs` runs inside `gate impl` for every backend task with the task's files:

- a migration task that changes no `drizzle/<tag>.sql`;
- a listed `drizzle/<tag>.sql` that does not exist;
- no journal entry with that exact `tag` in `drizzle/meta/_journal.json`;
- a rollback missing at `drizzle/rollback/<tag>.down.sql`, or one with no real statement outside comments;
- a destructive statement without `-- factory: approved HD-<n>` directly above it, or naming a note
  that does not exist, is open, or is not an approval of this task's migration.

At verification the engine runs the same check over every migration the feature changed, planned or
not, and reports failures as P1 findings.

## Never

- Run `db:migrate`, `drizzle-kit push`, or any SQL against a database. Integration tests and the
  deploy step apply migrations.
- Edit the snapshot or the journal by hand, or rename a generated file.
- Write repositories, services or endpoints that use the new column (other task types).
