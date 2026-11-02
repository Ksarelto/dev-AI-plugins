import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Ownership record for a conversation. The messages themselves live in the LangGraph
 * checkpointer; this table decides who may read or continue a thread.
 */
export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    title: varchar('title', { length: 200 }).notNull().default('New conversation'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('threads_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

export type ThreadRow = typeof threads.$inferSelect;
