# Scripted model and test helpers

`tests/helpers/scripted-model.ts` from `agent-boilerplate`. It is a `RunnableLambda` with the same `Runnable<BaseMessage[], BaseMessage>` shape as `model.bindTools(tools)`, so it drops into `buildAssistantGraph` and `createContainer({ chatModel })` unchanged.

```ts
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ToolCallingModel } from '../../src/agents/assistant/nodes/agent.js';

export type Turn = (messages: BaseMessage[]) => AIMessage | Promise<AIMessage>;

/**
 * A deterministic stand-in for a tool-calling chat model: each call runs the next scripted
 * turn. No network, no API key, same Runnable interface as `model.bindTools(tools)`.
 */
export function scriptedModel(turns: Turn[]): ToolCallingModel & { calls: BaseMessage[][] } {
  const calls: BaseMessage[][] = [];
  const runnable = RunnableLambda.from(async (messages: BaseMessage[]) => {
    calls.push(messages);
    const turn = turns.shift();
    if (!turn) throw new Error('scripted model has no more turns');
    return turn(messages);
  });
  return Object.assign(runnable, { calls });
}

export const callTool =
  (name: string, args: Record<string, unknown>, id = `call_${name}`): Turn =>
  () =>
    new AIMessage({ content: '', tool_calls: [{ id, name, args, type: 'tool_call' }] });

export const answer =
  (text: string): Turn =>
  () =>
    new AIMessage(text);

/** Answers by citing the first document the search tool returned, like a well-behaved model. */
export const answerCitingFirstResult =
  (text: string): Turn =>
  (messages) => {
    const toolOutput = [...messages].reverse().find((m) => m instanceof ToolMessage);
    const content =
      typeof toolOutput?.content === 'string' ? toolOutput.content : JSON.stringify(toolOutput?.content);
    const ref = /ref="([0-9a-f]{8})"/.exec(content)?.[1];
    return new AIMessage(ref ? `${text} [ref:${ref}]` : text);
  };

export const failing =
  (message = 'provider down'): Turn =>
  () => {
    throw new Error(message);
  };
```

## Other helpers

| Helper | File | Purpose |
|---|---|---|
| `createInMemoryThreads()` | `tests/helpers/in-memory-threads.ts` | `ThreadsRepository` honouring `findOwned(id, userId)` |
| `testEnv(overrides)` | `tests/helpers/env.ts` | parsed `Env` with a test JWT secret and silent logs |
| `createTestApp(options)` | `tests/helpers/test-app.ts` | real container + app on the Testcontainers DB, `SyntheticEmbeddings({ vectorSize: EMBEDDING_DIMENSIONS })`, `chatModel: null` unless given; `token(userId, role)`, `reset()`, `close()` |
| global setup | `tests/setup/global-setup.ts` | starts `pgvector/pgvector:pg17` (or uses `TEST_DATABASE_URL`), runs Drizzle migrations and `setupCheckpointer`, provides `databaseUrl` |

## Writing new turns

- A structured-output role (router, judge) is not a `ToolCallingModel`; script it as `RunnableLambda.from((_messages: BaseMessage[]) => decisions.shift())` returning the parsed object.
- A turn that depends on what the model saw takes `messages` (like `answerCitingFirstResult`). Keep the logic trivial; the point is determinism.
- Parallel tool calls: one `AIMessage` with several `tool_calls` entries, each with a unique `id`.
- To prove the model is **not** called (guard, approval pending), script `[]` and assert `model.calls` is empty.
- Scripted turns return whole messages, so `streamMode: 'messages'` produces no token chunks in tests; only the final `done` event is observable offline.
