import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { ROLES } from '../../lib/jwt.js';

export const roleEnum = pgEnum('role', ROLES);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased by the service, so the unique constraint is case-insensitive in practice. */
    email: varchar('email', { length: 320 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    role: roleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  /** Supports keyset pagination (newest first). */
  (table) => [index('users_created_at_id_idx').on(table.createdAt, table.id)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
