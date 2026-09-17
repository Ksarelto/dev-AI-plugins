# Checkpointing (LangGraph.js)

## Dev: MemorySaver

```ts
import { MemorySaver } from "@langchain/langgraph";

const app = graph.compile({ checkpointer: new MemorySaver() });
```

Lost on process restart. Local and unit tests only.

## Prod: Postgres

Use `@langchain/langgraph-checkpoint-postgres`. Create the saver from the app’s existing Postgres URL (same cluster is fine; dedicated schema preferred). Open the saver for the process lifetime (HTTP server listen), not per request.

```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
await checkpointer.setup();
const app = graph.compile({ checkpointer });
```

Confirm the class name (`PostgresSaver` vs `AsyncPostgresSaver`) against current package docs via Context7 — Python used `AsyncPostgresSaver`; JS naming differs.

## Thread IDs

```ts
const config = { configurable: { thread_id: `user-${userId}-session-${sessionId}` } };
await app.invoke(input, config);
```

Same `thread_id` resumes state. New id = new conversation.

## Snapshots and replay

`getState(config)` for current values and `next`. `getStateHistory(config)` to pick a past checkpoint and `invoke(null, pastConfig)` to continue from there. Use this for HITL review (`interruptBefore`) and for repairing a bad tool result, not as a product undo UI unless designed.
