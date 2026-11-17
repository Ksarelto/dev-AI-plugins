import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** One row per deployment: which version went live, and when. */
export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull(),
  deployedAt: timestamp('deployed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DeploymentRow = typeof deployments.$inferSelect;
export type NewDeploymentRow = typeof deployments.$inferInsert;
