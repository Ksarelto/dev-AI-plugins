# Graph state examples

Example 1 is `agent-boilerplate/src/agents/assistant/state.ts`. Examples 2 to 5 are extensions that are not in the boilerplate; they were typechecked and run against `@langchain/langgraph` 1.6 and `@langchain/core` 1.3.

## Example 1: the reference state

```ts
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

/**
 * Graph state. `messages` uses LangGraph's append/merge reducer; the counters are
 * overwritten and reset by the caller at the start of every turn.
 */
export const AssistantState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /** Model calls in the current turn. The agent node stops at the configured cap. */
  iterations: Annotation<number>({ reducer: (_current, update) => update, default: () => 0 }),
  /** Set by the input guard; a blocked turn never reaches the model. */
  blocked: Annotation<boolean>({ reducer: (_current, update) => update, default: () => false }),
});

export type AssistantStateType = typeof AssistantState.State;
export type AssistantStateUpdate = typeof AssistantState.Update;
```

The service resets the per-turn fields:

```ts
const turnInput = (content: string) => ({
  messages: [new HumanMessage(content)],
  iterations: 0,
  blocked: false,
});
```

## Example 2: a thread-long field and an accumulating field

```ts
export const AssistantState = Annotation.Root({
  ...MessagesAnnotation.spec,
  iterations: Annotation<number>({ reducer: (_current, update) => update, default: () => 0 }),
  blocked: Annotation<boolean>({ reducer: (_current, update) => update, default: () => false }),
  /** Survives turns: a rolling summary of the messages removed from history. */
  summary: Annotation<string>({ reducer: (_current, update) => update, default: () => '' }),
  /** Accumulates within a turn: chunk ids the tools returned. Reset by the service. */
  retrievedChunkIds: Annotation<string[]>({
    reducer: (current, update) => [...new Set([...current, ...update])],
    default: () => [],
  }),
});
```

Turn input gains `retrievedChunkIds: []`; `summary` is deliberately absent so it carries over.

Bad: no reducer (concurrent writes from parallel branches fail), no default, and a per-turn field that is never reset.

```ts
attempts: Annotation<number>(),
```

## Example 3: identity from `config.configurable`

```ts
// src/agents/run-config.ts — shared by every agent's nodes and tools
import type { RunnableConfig } from '@langchain/core/runnables';

export function requireUserId(config: RunnableConfig): string {
  const value: unknown = config.configurable?.user_id;
  if (typeof value !== 'string') throw new Error('user_id missing from run config');
  return value;
}
```

```ts
// services/chat.service.ts — runConfig
configurable: { thread_id: options.threadId, user_id: options.userId },
```

Bad: identity in state (the model output or a tool update could overwrite it) or in tool arguments (the model chooses them).

```ts
userId: Annotation<string>({ reducer: (_current, update) => update, default: () => '' }),
schema: z.object({ userId: z.string(), orderId: z.string() }),
```

## Example 4: trim what the model sees, keep the checkpoint intact

```ts
import { SystemMessage, trimMessages, type BaseMessage } from '@langchain/core/messages';

const textOf = (message: BaseMessage): string =>
  typeof message.content === 'string' ? message.content : '';

/** ~4 characters per token: good enough for a budget, no tokenizer dependency. */
export const approximateTokens = (messages: BaseMessage[]): number =>
  messages.reduce((sum, message) => sum + Math.ceil(textOf(message).length / 4), 0);

export async function historyForModel(messages: BaseMessage[], maxTokens: number): Promise<BaseMessage[]> {
  return trimMessages(messages, {
    maxTokens,
    strategy: 'last',
    tokenCounter: approximateTokens,
    startOn: 'human',
    includeSystem: false,
  });
}

// in createAgentNode, deps.maxHistoryTokens comes from the container (an env value)
const history = await historyForModel(state.messages, deps.maxHistoryTokens);
const response = await deps.breaker.execute(() =>
  deps.model.invoke([new SystemMessage(SYSTEM_PROMPT), ...history], config),
);
```

## Example 5: rolling summary with `RemoveMessage`

Runs between `guard` and `agent`. It deletes everything before the first `HumanMessage` of the last `KEEP_LAST_MESSAGES`, so an AI tool call is never separated from its tool result. The messages reducer gives every message an `id`, which `RemoveMessage` needs.

```ts
import { HumanMessage, RemoveMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import type { CircuitBreaker } from '../../../lib/resilience.js';
import { SUMMARY_PROMPT } from '../prompts.js';
import type { AssistantStateType, AssistantStateUpdate } from '../state.js';

const KEEP_LAST_MESSAGES = 12;

export function createSummarizeNode(deps: {
  summarizer: Runnable<BaseMessage[], BaseMessage>;
  breaker: CircuitBreaker;
}) {
  return async (state: AssistantStateType, config: RunnableConfig): Promise<AssistantStateUpdate> => {
    const firstKept = state.messages.findIndex(
      (message, index) =>
        index >= state.messages.length - KEEP_LAST_MESSAGES && message instanceof HumanMessage,
    );
    if (firstKept <= 0) return {};
    const older = state.messages.slice(0, firstKept);
    const response = await deps.breaker.execute(() =>
      deps.summarizer.invoke(
        [new SystemMessage(SUMMARY_PROMPT), new HumanMessage(`Summary so far:\n${state.summary}`), ...older],
        config,
      ),
    );
    return {
      summary: typeof response.content === 'string' ? response.content : '',
      messages: older.flatMap((message) => (message.id ? [new RemoveMessage({ id: message.id })] : [])),
    };
  };
}
```

When `state.summary` is not empty, the agent node sends it right after the system prompt as `new HumanMessage(asUntrustedDocument({ kind: 'conversation-summary' }, state.summary))`. Never splice it into `SYSTEM_PROMPT`: it is derived from user text (`rules/prompt-security.mdc`). Because this node removes messages, `toReply` can no longer slice by the count taken before the turn; slice from the index of this turn's `HumanMessage` instead.

A full reset ("clear conversation") is `{ messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES })] }` with `REMOVE_ALL_MESSAGES` from `@langchain/langgraph`.
