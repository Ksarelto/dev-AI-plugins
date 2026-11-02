# Long-term memory with a LangGraph store

Not implemented in `agent-boilerplate`. Checkpoints hold one thread; a store holds facts that every thread of a user can read. The APIs below were typechecked and run against `@langchain/langgraph` 1.6 (`InMemoryStore`, `BaseStore`, `getStore`, `compile({ store })`) and `@langchain/langgraph-checkpoint-postgres` 1.1 (`PostgresStore` from the `/store` subpath).

## When it is worth it

| Need | Use |
|---|---|
| Remember within one conversation | the checkpointer; nothing to add |
| User preferences, profile facts, standing instructions across conversations | a store |
| Company knowledge shared by all users | RAG (`rag-pipeline`), not a store |

## Factory

`PostgresStore` takes `connectionOptions` (a connection string or `pg.PoolConfig`) and opens its own pool; it cannot reuse the `pg.Pool` from `createDatabase`. Size `DATABASE_POOL_MAX` with that in mind and close it on shutdown.

```ts
// src/memory/store.ts
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { InMemoryStore, type BaseStore } from '@langchain/langgraph';
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store';
import type { Env } from '../config/env.js';

/** Semantic search over the `text` field uses the same embedding model and size as RAG. */
export function createPostgresStore(env: Env, embeddings: EmbeddingsInterface): PostgresStore {
  return new PostgresStore({
    connectionOptions: env.DATABASE_URL,
    index: { dims: env.EMBEDDING_DIMENSIONS, embed: embeddings, fields: ['text'] },
  });
}

/** Unit tests only. */
export function createMemoryStore(): BaseStore {
  return new InMemoryStore();
}
```

- Tables: call `await store.setup()` in `src/db/migrate.ts` next to `setupCheckpointer`, then `await store.stop()`.
- Shutdown: add `{ name: 'memory-store', close: () => store.stop() }` to the `resources` of `registerGracefulShutdown` in `src/index.ts`.
- Without embeddings, build it without `index`: `search` then filters by namespace only.

## Wiring

```ts
// graph.ts
.compile({ checkpointer: deps.checkpointer, store: deps.store })
```

A node reads the store from its config. The namespace always starts with the user id from `config.configurable` (`requireUserId`, `graph-state-design` example 3), never from model output.

```ts
import { HumanMessage } from '@langchain/core/messages';
import { Annotation, MessagesAnnotation, getStore, type LangGraphRunnableConfig } from '@langchain/langgraph';

export const MemoryState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /** Per turn: user memories recalled for this question. Reset by the service. */
  recalled: Annotation<string[]>({ reducer: (_current, update) => update, default: () => [] }),
});

const MEMORY_LIMIT = 5;

export function createRecallNode(limit = MEMORY_LIMIT) {
  return async (state: MemoryStateType, config: LangGraphRunnableConfig): Promise<MemoryStateUpdate> => {
    const store = getStore(config);
    const last = state.messages.at(-1);
    if (!store || typeof last?.content !== 'string') return { recalled: [] };
    const items = await store.search(['users', requireUserId(config), 'memories'], {
      query: last.content,
      limit,
    });
    return { recalled: items.map((item) => String(item.value.text)) };
  };
}

/** The agent node sends this right after the system prompt; memories are data, not instructions. */
export function recalledContext(state: MemoryStateType) {
  return state.recalled.length > 0
    ? [new HumanMessage(asUntrustedDocument({ kind: 'user-memories' }, state.recalled.join('\n')))]
    : [];
}
```

Graph: `START → guard → recall → agent ⇄ tools`.

## Writing memories

Writes come from an explicit user action (a settings screen, "remember that…" confirmed by the user), through a service and an endpoint, not from a model tool that writes silently:

```ts
// src/services/memory.service.ts
import { randomUUID } from 'node:crypto';
import type { BaseStore } from '@langchain/langgraph';

export function createMemoryService(store: BaseStore) {
  return {
    async remember(userId: string, text: string): Promise<string> {
      const key = randomUUID();
      await store.put(['users', userId, 'memories'], key, { text });
      return key;
    },
    async list(userId: string) {
      return store.search(['users', userId, 'memories'], { limit: 50 });
    },
    async forget(userId: string, key: string): Promise<void> {
      await store.delete(['users', userId, 'memories'], key);
    },
  };
}
```

If the model should propose memories, make it a tool that calls `interrupt()` for confirmation first (`human-in-the-loop`). Cap the text length in the request schema, and include memories in the user's data export and deletion paths.

## Testing

```ts
// InMemoryStore's index takes `embeddings`; PostgresStore's takes `embed`.
const store = new InMemoryStore({ index: { dims: 16, embeddings: new SyntheticEmbeddings({ vectorSize: 16 }) } });
const memories = createMemoryService(store);
await memories.remember('u1', 'prefers metric units');
await memories.remember('u2', 'another user');

const graph = new StateGraph(MemoryState)
  .addNode('recall', createRecallNode())
  .addEdge(START, 'recall')
  .addEdge('recall', END)
  .compile({ checkpointer: new MemorySaver(), store });

const out = await graph.invoke(
  { messages: [new HumanMessage('what units?')] },
  { configurable: { thread_id: 't', user_id: 'u1' } },
);
expect(out.recalled).toEqual(['prefers metric units']);
```
