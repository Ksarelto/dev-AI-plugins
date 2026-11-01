---
name: migration-authoring
description: Procedure for the factory migration author — one Drizzle schema change shipped as the schema file, a forward SQL migration with its journal entry, and a rollback file; destructive statements only with a human approval note. Preloaded by migration-author; not for direct use.
user-invocable: false
---

# Author one migration

## Files (all in T0's list)

Follow the stack's workflow (`node-backend-dev-kit:drizzle-database`, migrations reference): edit the
schema, then generate — `npm run db:generate -- --name <name>` needs no database. Then add the rollback
by hand.

| File | Written by |
|---|---|
| `src/db/schema/<table>.ts` (+ the schema `index.ts` export) | you: the Drizzle table definition |
| `drizzle/<NNNN>_<name>.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/<NNNN>_snapshot.json` | `db:generate` — read the SQL; never edit the snapshot |
| `drizzle/rollback/<NNNN>_<name>.down.sql` | you: the statements that undo the forward SQL, in reverse order |

Generated files are written through Bash, so the hooks do not see them: every one of them must be
in T0's files, or the commit plan leaves it out. If the plan lacks one (often the snapshot), return
`needs_scope_change` naming it instead of continuing.

## Safe by default

- Additive changes (new table, nullable column, column with a default, new index) need nothing more.
- **Destructive** statements — `DROP TABLE` / `COLUMN` / `TYPE` / `CONSTRAINT`, `TRUNCATE`, any
  `DELETE`, an `UPDATE` without `WHERE`, a column type change, `SET NOT NULL` on an existing column,
  a rename — lose data or break running code. Do not write them on your own: return
  `needs_clarification` asking the human to approve, with the data at risk. The human's answer becomes
  a note mapped to your task (`HD-…` in T2); put `-- factory: approved HD-<n>` on the line above the
  statement. The check refuses a note that is open, declined, or about something else.
- Never run the migration; integration tests and deployment do that.

## Exit

Run the exit check (`gate impl`). Besides typecheck, lint and build it runs the role's migration
check, which fails on: a migration without a journal entry, a rollback with no real statement, or a
destructive statement without a valid approval line.
