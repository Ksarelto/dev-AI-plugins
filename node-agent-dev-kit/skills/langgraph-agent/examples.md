# LangGraph agent examples

Taken from `agent-boilerplate/src`. State is in the `graph-state-design` skill, tools in `agent-tools`, models in `llm-models`.

## Example 1: `agents/assistant/graph.ts`

```ts
import { AIMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { END, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Logger } from '../../lib/logger.js';
import type { CircuitBreaker } from '../../lib/resilience.js';
import { createAgentNode, type ToolCallingModel } from './nodes/agent.js';
import { createGuardNode } from './nodes/guard.js';
import { AssistantState, type AssistantStateType } from './state.js';

export interface AssistantGraphDeps {
  model: ToolCallingModel;
  tools: StructuredToolInterface[];
  checkpointer: BaseCheckpointSaver;
  breaker: CircuitBreaker;
  maxIterations: number;
  guardrailMode: 'block' | 'log';
  logger: Logger;
}

function routeAfterAgent(state: AssistantStateType): 'tools' | typeof END {
  const last = state.messages.at(-1);
  return last instanceof AIMessage && (last.tool_calls?.length ?? 0) > 0 ? 'tools' : END;
}

export function buildAssistantGraph(deps: AssistantGraphDeps) {
  return new StateGraph(AssistantState)
    .addNode('guard', createGuardNode({ mode: deps.guardrailMode, logger: deps.logger }))
    .addNode('agent', createAgentNode(deps))
    .addNode('tools', new ToolNode(deps.tools))
    .addEdge(START, 'guard')
    .addConditionalEdges('guard', (state) => (state.blocked ? END : 'agent'), ['agent', END])
    .addConditionalEdges('agent', routeAfterAgent, ['tools', END])
    .addEdge('tools', 'agent')
    .compile({ checkpointer: deps.checkpointer });
}

export type AssistantGraph = ReturnType<typeof buildAssistantGraph>;
```

## Example 2: `nodes/agent.ts` (cap, breaker, config)

```ts
import { AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import type { CircuitBreaker } from '../../../lib/resilience.js';
import { ITERATION_LIMIT_MESSAGE, SYSTEM_PROMPT } from '../prompts.js';
import type { AssistantStateType, AssistantStateUpdate } from '../state.js';

/** A chat model with tools already bound (and fallbacks, if configured). */
export type ToolCallingModel = Runnable<BaseMessage[], BaseMessage>;

export function createAgentNode(deps: {
  model: ToolCallingModel;
  breaker: CircuitBreaker;
  maxIterations: number;
}) {
  return async (
    state: AssistantStateType,
    config: RunnableConfig,
  ): Promise<AssistantStateUpdate> => {
    if (state.iterations >= deps.maxIterations) {
      return { messages: [new AIMessage(ITERATION_LIMIT_MESSAGE)] };
    }
    const response = await deps.breaker.execute(() =>
      deps.model.invoke([new SystemMessage(SYSTEM_PROMPT), ...state.messages], config),
    );
    return { messages: [response], iterations: state.iterations + 1 };
  };
}
```

Bad: the prompt is stored in state, the model is built in the node, `config` is dropped.

```ts
return async (state: AssistantStateType) => {
  const model = new ChatOpenAI({ model: 'openai/gpt-4.1-mini' });
  const response = await model.invoke(state.messages);
  return { messages: [new SystemMessage(SYSTEM_PROMPT), response] };
};
```

## Example 3: `nodes/guard.ts`

```ts
import { assessInput } from '../../../guardrails/input.js';
import type { Logger } from '../../../lib/logger.js';
import { AIMessage } from '@langchain/core/messages';
import { BLOCKED_MESSAGE } from '../prompts.js';
import type { AssistantStateType, AssistantStateUpdate } from '../state.js';

export function createGuardNode(options: { mode: 'block' | 'log'; logger: Logger }) {
  return (state: AssistantStateType): AssistantStateUpdate => {
    const last = state.messages.at(-1);
    const text = typeof last?.content === 'string' ? last.content : '';
    const assessment = assessInput(text, { mode: options.mode });
    if (assessment.reasons.length > 0) {
      options.logger.warn(
        { reasons: assessment.reasons, blocked: !assessment.allowed },
        'input guardrail triggered',
      );
    }
    if (!assessment.allowed) return { blocked: true, messages: [new AIMessage(BLOCKED_MESSAGE)] };
    return { blocked: false };
  };
}
```

## Example 4: `container.ts` excerpt

```ts
/** Binds tools to the primary model and, when configured, to a fallback model on another provider. */
function bindModel(
  env: Env,
  tools: Parameters<NonNullable<BaseChatModel['bindTools']>>[0],
): ToolCallingModel | undefined {
  const primary = createChatModel(env, 'chat');
  if (!primary?.bindTools) return undefined;
  const bound = primary.bindTools(tools);
  const fallback = createChatModel(env, 'chatFallback');
  return fallback?.bindTools ? bound.withFallbacks([fallback.bindTools(tools)]) : bound;
}

// inside createContainer(env, logger, database, options)
const tools = createAssistantTools({ retriever, topK: env.RETRIEVAL_TOP_K, logger });
const model =
  options.chatModel === null ? undefined : (options.chatModel ?? bindModel(env, tools));
const llmBreaker = createCircuitBreaker({ name: 'llm', failureThreshold: 5, resetTimeoutMs: 30_000 });
const graph = model
  ? buildAssistantGraph({
      model,
      tools,
      checkpointer: options.checkpointer ?? createPostgresCheckpointer(database.pool),
      breaker: llmBreaker,
      maxIterations: env.AGENT_MAX_ITERATIONS,
      guardrailMode: env.GUARDRAIL_MODE,
      logger,
    })
  : undefined;
const chat = createChatService({ graph, threads, maxIterations: env.AGENT_MAX_ITERATIONS });
```

## Example 5: running the graph from `services/chat.service.ts`

```ts
function toServiceError(error: unknown, signal: AbortSignal | undefined): unknown {
  if (error instanceof AppError || signal?.aborted) return error;
  return new ServiceUnavailableError('The assistant is temporarily unavailable.', 'LLM_UNAVAILABLE', 5, {
    cause: error,
  });
}

function runConfig(options: SendOptions) {
  return {
    configurable: { thread_id: options.threadId },
    // Each agent step is two graph steps (agent + tools); leave room for guard and the final answer.
    recursionLimit: maxIterations * 2 + 4,
    signal: options.signal,
    callbacks: options.callbacks,
  };
}

const turnInput = (content: string) => ({
  messages: [new HumanMessage(content)],
  iterations: 0,
  blocked: false,
});

async function send(options: SendOptions): Promise<ChatReply> {
  await requireThread(options.userId, options.threadId); // findOwned → 404 THREAD_NOT_FOUND
  const graph = requireGraph(); // 503 LLM_NOT_CONFIGURED
  const before = await previousMessageCount(graph, options.threadId);
  try {
    const state = await graph.invoke(turnInput(options.content), runConfig(options));
    await threads.touch(options.threadId);
    return toReply(state, before); // answer, selectCitations, degraded, blocked
  } catch (error) {
    throw toServiceError(error, options.signal);
  }
}
```

`toReply` reads only `state.messages.slice(before)`: the last `AIMessage` is the answer, `ToolMessage` artifacts named `search_knowledge` give citations and the `degraded` flag.
