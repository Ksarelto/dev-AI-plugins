---
name: checkpointing-memory
description: Persist agent conversations and memory with LangGraph checkpointers — PostgresSaver on the shared pg.Pool, setup() run with migrations, MemorySaver in unit tests, one thread_id per conversation guarded by an ownership table, reading history with getState and getStateHistory, deleting a thread's checkpoints, and long-term cross-thread memory with a BaseStore (InMemoryStore, PostgresStore). Use when adding conversation memory, a history or delete-conversation endpoint, debugging what a thread contains, or storing user preferences that outlive one thread.
---

# Checkpointing and memory

## When to use

- Conversations must survive restarts, or a history endpoint reads them
- Deleting a conversation (user request, retention policy, GDPR erasure)
- Debugging a thread step by step
- Remembering facts or preferences across all of a user's threads (long-term memory)
- Not for which fields live in state or how to trim history → `graph-state-design`

Hard constraints: `rules/langgraph-state.mdc`, `rules/agent-architecture.mdc`. Copy the shapes in [examples.md](examples.md). Long-term memory, which the boilerplate does not implement, is in [references/long-term-store.md](references/long-term-store.md).

## Model

| Thing | Where | Keyed by |
|---|---|---|
| Who owns a conversation | `threads` table (Drizzle) | `id` (uuid) + `user_id` |
| The conversation itself (messages, counters, pending interrupts) | checkpointer tables (`PostgresSaver`) | `thread_id` = `threads.id` |
| Facts about a user across threads | a `BaseStore` (not in the boilerplate) | namespace `['users', userId, 'memories']` |

The ownership row is checked first (`findOwned(id, userId)` → 404 for anyone else); only then does the service touch the checkpointer.

## Procedure

1. **Checkpointer factory** in `memory/checkpointer.ts`: `createPostgresCheckpointer(pool)` returns `new PostgresSaver(pool)` on the pool from `createDatabase` (one pool per process, closed on shutdown). `createMemoryCheckpointer()` returns `new MemorySaver()` for unit tests only.
2. **Tables**: `setupCheckpointer(pool)` calls `.setup()`. It runs in `src/db/migrate.ts` after the Drizzle migrations and in the integration global setup, never per request or at server start.
3. **Compile** every graph with `{ checkpointer }` from deps. Every run passes `configurable: { thread_id }` where the id is a `threads.id` the caller owns.
4. **Read history** with `graph.getState({ configurable: { thread_id } })` and map `snapshot.values.messages` to DTOs: user text from `HumanMessage`, answers from `AIMessage` with text; skip tool calls and `ToolMessage`s.
5. **Debug a thread** with `graph.getStateHistory(config, { limit })`: each snapshot has `metadata.step`, `next`, `values`, `createdAt` and `tasks` (with pending `interrupts`). Use it in a script or test, never in a public endpoint.
6. **Delete a conversation**: ownership check → `checkpointer.deleteThread(threadId)` → delete the `threads` row. Checkpoints first, so a failure leaves the row and the delete can be retried. Inject the checkpointer into the service for this.
7. **Retention**: a scheduled job lists expired `threads` rows and runs step 6 for each. Do not delete checkpoint rows with SQL.
8. **Long-term memory**: follow [references/long-term-store.md](references/long-term-store.md). Writes come from an explicit user action or an approved tool, never silently from the model.
9. **Tests**: unit tests with `MemorySaver` prove multi-turn memory on one `thread_id`; integration tests prove history survives across requests with the real `PostgresSaver` and that another user's thread is 404.

## Gotchas

| Symptom | Cause |
|---|---|
| `relation "checkpoints" does not exist` | `npm run db:migrate` not run, or the test global setup skipped `setupCheckpointer` |
| Two users see each other's history | `thread_id` taken from the request without `findOwned` |
| History empty after restart | `MemorySaver` used outside tests |
| `No checkpointer set` on `interrupt()` | graph compiled without a checkpointer |
| Too many Postgres connections | a second `pg.Pool` created for the checkpointer |

## Checklist

- [ ] One `pg.Pool` shared by Drizzle and `PostgresSaver`
- [ ] `setup()` runs with migrations and in integration global setup only
- [ ] `MemorySaver` appears only under `tests/` (and evals)
- [ ] Every run's `thread_id` is an owned `threads.id`
- [ ] History DTOs hide tool calls and tool messages
- [ ] Deleting a thread removes checkpoints, then the row
- [ ] Long-term memory namespaces start with the user id from `config.configurable`
- [ ] Tests cover memory across turns and cross-user 404
