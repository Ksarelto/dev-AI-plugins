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
