# Rollback pairs for Drizzle migrations

`drizzle-kit` writes only the forward SQL. The factory's migration check
(`factory-role-backend/scripts/check-migrations.mjs`) also wants `drizzle/rollback/<tag>.down.sql`
with at least one real statement (`CREATE`, `DROP`, `ALTER`, `INSERT`, `UPDATE`, `DELETE`, `RENAME`
or `TRUNCATE` outside comments). Drizzle's migrator never runs it; an operator or a rollback drill
does. So it must be correct SQL that undoes this one migration on a database where it was applied.

Write the rollback statements in **reverse order** of the forward file, one per forward statement,
separated by `--> statement-breakpoint` like the generated file. Quote identifiers exactly as the
forward SQL does. Use `IF EXISTS` so a half-applied migration can still be rolled back.

## Pairs

| Forward (generated) | Rollback |
|---|---|
| `CREATE TABLE "projects" (…)` | `DROP TABLE IF EXISTS "projects";` |
| `ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;` | `ALTER TABLE "projects" DROP COLUMN IF EXISTS "archived_at";` |
| `CREATE INDEX "projects_owner_created_idx" ON …` | `DROP INDEX IF EXISTS "projects_owner_created_idx";` |
| `CREATE UNIQUE INDEX "projects_owner_name_uq" ON …` | `DROP INDEX IF EXISTS "projects_owner_name_uq";` |
| `ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY …` | `ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_owner_id_users_id_fk";` |
| `CREATE TYPE "public"."status" AS ENUM('draft', 'live');` | `DROP TYPE IF EXISTS "public"."status";` (after the columns that use it are dropped) |
| `ALTER TABLE … ALTER COLUMN "x" SET DEFAULT 'a';` | `ALTER TABLE … ALTER COLUMN "x" DROP DEFAULT;` (or the previous default) |
| `CREATE EXTENSION IF NOT EXISTS pg_trgm;` | `DROP EXTENSION IF EXISTS pg_trgm;` — only when nothing else uses the extension; if something does, ask (`needs_clarification`) instead of writing a filler statement to satisfy the check |
| custom backfill `UPDATE "projects" SET "slug" = … WHERE "slug" IS NULL;` | `UPDATE "projects" SET "slug" = NULL WHERE …;` when the column is new in the same feature; when old values are overwritten, the data cannot come back — say so in the approval question |
| `ALTER TYPE "public"."role" ADD VALUE 'auditor';` | Postgres cannot drop an enum value: rename the type, create it without the value, `ALTER TABLE … ALTER COLUMN … TYPE … USING …::text::…`, drop the old type. That rollback is itself destructive; describe it in the question |

Destructive forward statements (each needs an approval line, see the skill):

| Forward | Rollback | Data |
|---|---|---|
| `ALTER TABLE … DROP COLUMN "legacy";` | `ALTER TABLE … ADD COLUMN "legacy" <type>;` | the column comes back empty |
| `DROP TABLE "old";` | the `CREATE TABLE` from the snapshot that created it | rows are gone |
| `ALTER TABLE … RENAME COLUMN "a" TO "b";` | `ALTER TABLE … RENAME COLUMN "b" TO "a";` | kept, but running code that reads `a` breaks during a rolling deploy |
| `ALTER TABLE … ALTER COLUMN "x" SET NOT NULL;` | `ALTER TABLE … ALTER COLUMN "x" DROP NOT NULL;` | kept; fails on apply if any row is null |
| `ALTER TABLE … ALTER COLUMN "x" SET DATA TYPE integer USING …;` | the reverse type change with a `USING` cast | values that do not cast back are lost |
| `ALTER TABLE … DROP CONSTRAINT "fk";` (drizzle emits it when an FK's `onDelete` changes) | `ADD CONSTRAINT` with the old definition | none, but the check still treats it as destructive |

## Worked example

Forward `drizzle/0003_project_archive.sql` (generated, then reviewed):

```sql
ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "projects_owner_archived_idx" ON "projects" USING btree ("owner_id","archived_at");
```

Rollback `drizzle/rollback/0003_project_archive.down.sql` (hand-written):

```sql
-- Undoes 0003_project_archive (TASK-007).
DROP INDEX IF EXISTS "projects_owner_archived_idx";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "archived_at";
```

## Reading the generated SQL

Before writing the rollback, read the forward file and check:

- `NOT NULL` on a column added to an existing table without a default — fails on a populated table;
  use the multi-step sequence of `node-backend-dev-kit:drizzle-database` (references/migrations.md).
- every FK has the `ON DELETE` the schema declares, and every FK and keyset column has an index;
- nothing was dropped that you did not mean to drop (drizzle-kit may treat a rename as drop + add);
- the tag in the file name is the tag in `drizzle/meta/_journal.json` (the check compares them).
