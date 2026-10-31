# Checkpointing examples

Examples 1 to 4 are from `agent-boilerplate`. Examples 5 and 6 are extensions, typechecked against `@langchain/langgraph` 1.6 and `@langchain/langgraph-checkpoint` 1.2.

## Example 1: `memory/checkpointer.ts`

```ts
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type pg from 'pg';

/**
 * Durable conversation state: every graph step is checkpointed per `thread_id`, so a
 * conversation survives restarts and can be inspected or resumed (human-in-the-loop).
 */
export function createPostgresCheckpointer(pool: pg.Pool): PostgresSaver {
  return new PostgresSaver(pool);
}

/** Creates the checkpointer's own tables. Idempotent; run with the migrations, not per request. */
export async function setupCheckpointer(pool: pg.Pool): Promise<void> {
  await createPostgresCheckpointer(pool).setup();
}

/** In-process checkpoints for unit tests only. */
export function createMemoryCheckpointer(): BaseCheckpointSaver {
  return new MemorySaver();
}
```

## Example 2: one pool, migrations, then checkpointer tables

```ts
// db/client.ts
/**
 * One node-postgres pool per process, shared by Drizzle (threads, knowledge) and the
 * LangGraph PostgresSaver (checkpoints), so shutdown closes a single resource.
 */
export function createDatabase(options: DatabaseOptions) {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.maxConnections ?? 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle({ client: pool, schema });
  return { db, pool, ping: async () => { await pool.query('select 1'); }, close: async () => { await pool.end(); } };
}
```

```ts
// db/migrate.ts
try {
  await migrate(database.db, { migrationsFolder: 'drizzle' });
  await setupCheckpointer(database.pool);
  logger.info('migrations applied');
} catch (error) {
  logger.error({ err: error }, 'migration failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
```

## Example 3: ownership before state

```ts
// repositories/threads.repository.ts
/** Ownership is part of the lookup: another user's thread is indistinguishable from a missing one. */
async findOwned(id: string, userId: string, executor: DbExecutor = db): Promise<ThreadRow | undefined> {
  const [row] = await executor
    .select()
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, userId)))
    .limit(1);
  return row;
},
```

```ts
// services/chat.service.ts
async function requireThread(userId: string, threadId: string): Promise<ThreadRow> {
  const thread = await threads.findOwned(threadId, userId);
  if (!thread) throw new NotFoundError('Conversation not found.', 'THREAD_NOT_FOUND');
  return thread;
}
```

## Example 4: history from the checkpointer

```ts
async getMessages(userId: string, threadId: string): Promise<ChatMessage[]> {
  await requireThread(userId, threadId);
  if (!deps.graph) return [];
  const snapshot = await deps.graph.getState({ configurable: { thread_id: threadId } });
  const messages = (snapshot.values as Partial<AssistantStateType>).messages ?? [];
  return messages.flatMap((message): ChatMessage[] => {
    if (message instanceof HumanMessage) return [{ role: 'user', content: textOf(message) }];
    if (message instanceof AIMessage && textOf(message))
      return [{ role: 'assistant', content: textOf(message) }];
    return [];
  });
},
```

## Example 5: deleting a conversation (extension)

```ts
// ChatServiceDeps gains `checkpointer: BaseCheckpointSaver`; ThreadsRepository gains `delete(id)`.
async deleteThread(userId: string, threadId: string): Promise<void> {
  await requireThread(userId, threadId);
  await deps.checkpointer.deleteThread(threadId);
  await threads.delete(threadId);
},
```

The controller answers 204; the route is `DELETE /api/v1/threads/:threadId` (`node-backend-dev-kit:express-resource`). Pass the same checkpointer instance the graph was compiled with (`options.checkpointer ?? createPostgresCheckpointer(database.pool)`, created once in the container).

## Example 6: stepping through a thread (debugging)

```ts
export async function inspectThread(graph: AssistantGraph, threadId: string) {
  const steps: { step: unknown; next: string[]; messages: number; createdAt: string | undefined }[] = [];
  for await (const snapshot of graph.getStateHistory({ configurable: { thread_id: threadId } }, { limit: 20 })) {
    steps.push({
      step: snapshot.metadata?.step,
      next: snapshot.next,
      messages: (snapshot.values as Partial<AssistantStateType>).messages?.length ?? 0,
      createdAt: snapshot.createdAt,
    });
  }
  return steps;
}
```

Snapshots come newest first. `next: ['tools']` with a non-empty `tasks[].interrupts` means the thread is waiting for approval (`human-in-the-loop`).
