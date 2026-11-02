# Migrations with drizzle-kit

## Workflow

1. Edit `src/db/schema/<table>.ts` (export new tables from `schema/index.ts`).
2. `npm run db:generate -- --name <what-changed>` → `drizzle/NNNN_<what-changed>.sql` plus `drizzle/meta/NNNN_snapshot.json` and an updated `_journal.json`.
3. Read the SQL. Check: column types, `NOT NULL` on existing tables, FK `ON DELETE`, index names, no unexpected `DROP`.
4. `npm run db:migrate` locally; `npm run test:integration` (global setup applies every migration to a fresh container).
5. Commit schema, SQL and `meta/` together.

drizzle-kit may ask interactively whether a column was renamed or dropped-and-added. Answer
"rename" for a rename; "create" silently drops the old column's data.

## Custom SQL

`npm run db:generate -- --custom --name backfill_project_slugs` creates an empty, journaled migration
for data backfills, extensions (`create extension if not exists pg_trgm;`) or anything the schema DSL
cannot express. Keep statements separated by `--> statement-breakpoint`.

## Changes that need more than one migration

| Change on a populated table | Safe sequence |
|---|---|
| Add a `NOT NULL` column | 1) add nullable (or with a `default`) → 2) backfill (custom migration) → 3) set `notNull()` |
| Rename a column used by a running version | 1) add new column, write both → 2) backfill → 3) switch reads → 4) drop old |
| Drop a column | 1) stop reading/writing it and deploy → 2) drop it in the next release |
| Add a value to a pg enum (`ROLES`) | Ship `ALTER TYPE … ADD VALUE` on its own; do not use the new value in a migration applied in the same run — `migrate()` applies all pending files in one transaction |
| Large index on a hot table | `create index concurrently` cannot run inside the migrator's transaction: run it as an operational step first, then generate the migration and change that new, not-yet-applied file to `create index if not exists` |

## Rules of thumb

- Never edit or delete a migration that has run anywhere other than your machine. Add a new one.
- Never `drizzle-kit push` against a shared database; `push` has no history and can drop data.
- Production applies migrations as a separate step before the new API version starts (compose `migrate` service, a Kubernetes Job, a CI deploy step). The API never migrates on boot.
- Migrations must be backward compatible with the version still running during a rolling deploy.
- `drizzle-kit check` validates the journal and snapshots after a merge conflict in `drizzle/meta/`. Resolve conflicts by regenerating on top of the target branch, not by hand-merging JSON.
