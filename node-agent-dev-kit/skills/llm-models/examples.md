# Model examples

Examples 1, 2, 4 and 5 are from `agent-boilerplate`. Example 3 (a role map) is an extension, typechecked against `@langchain/openai` 1.8 and `@langchain/core` 1.3.

## Example 1: `llm/models.ts`

```ts
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import type { Env } from '../config/env.js';

export type ModelRole = 'chat' | 'chatFallback';

/**
 * Every chat model goes through OpenRouter's OpenAI-compatible API, so swapping providers is
 * a model-slug change in env, not a code change. Timeouts and retries are always set.
 */
export function createChatModel(env: Env, role: ModelRole = 'chat'): BaseChatModel | undefined {
  if (!env.OPENROUTER_API_KEY) return undefined;
  const model = role === 'chat' ? env.MODEL_CHAT : env.MODEL_CHAT_FALLBACK;
  if (!model) return undefined;
  return new ChatOpenAI({
    model,
    apiKey: env.OPENROUTER_API_KEY,
    temperature: env.LLM_TEMPERATURE,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    configuration: {
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: { 'HTTP-Referer': env.APP_URL, 'X-Title': env.APP_NAME },
    },
  });
}
```

## Example 2: `llm/embeddings.ts`

```ts
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { Env } from '../config/env.js';

/** OpenRouter embeddings; `dimensions` must match the `vector(n)` column. */
export function createEmbeddings(env: Env): EmbeddingsInterface | undefined {
  if (!env.OPENROUTER_API_KEY) return undefined;
  return new OpenAIEmbeddings({
    model: env.MODEL_EMBED,
    apiKey: env.OPENROUTER_API_KEY,
    dimensions: env.EMBEDDING_DIMENSIONS,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    configuration: { baseURL: env.OPENROUTER_BASE_URL },
  });
}
```

## Example 3: adding a role (extension)

```ts
// config/env.ts
MODEL_ROUTER: optionalString,
```

```ts
// llm/models.ts
export type ModelRole = 'chat' | 'chatFallback' | 'router';

const MODEL_ENV = {
  chat: 'MODEL_CHAT',
  chatFallback: 'MODEL_CHAT_FALLBACK',
  router: 'MODEL_ROUTER',
} as const satisfies Record<ModelRole, keyof Env>;

/** Classifiers and judges must be repeatable. */
const ZERO_TEMPERATURE_ROLES: readonly ModelRole[] = ['router'];

export function createChatModel(env: Env, role: ModelRole = 'chat'): BaseChatModel | undefined {
  if (!env.OPENROUTER_API_KEY) return undefined;
  const model = env[MODEL_ENV[role]];
  if (!model) return undefined;
  return new ChatOpenAI({
    model,
    apiKey: env.OPENROUTER_API_KEY,
    temperature: ZERO_TEMPERATURE_ROLES.includes(role) ? 0 : env.LLM_TEMPERATURE,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    configuration: {
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: { 'HTTP-Referer': env.APP_URL, 'X-Title': env.APP_NAME },
    },
  });
}
```

Bad: a second factory with its own literals, no timeout, no retries.

```ts
export const routerModel = new ChatOpenAI({ model: 'openai/gpt-4o-mini', apiKey: process.env.OPENROUTER_API_KEY });
```

## Example 4: structured output (the eval judge)

```ts
const judgeSchema = z.object({
  faithful: z
    .boolean()
    .describe('Every claim in the answer is supported by the reference documents.'),
  answersQuestion: z
    .boolean()
    .describe('The answer addresses the question, or correctly says it does not know.'),
  reason: z.string(),
});

const judge = createChatModel(env, 'chat')?.withStructuredOutput(judgeSchema, { name: 'judgement' });
const verdict = await judge.invoke(`Reference documents:\n${reference}\n\nQuestion: ...\nAnswer: ...`);
if (!verdict.faithful) failures.push(`unfaithful: ${verdict.reason}`);
```

A router in a graph is the same call on its own role, injected as `Runnable<BaseMessage[], z.infer<typeof Schema>>` (see `langgraph-agent` references/topologies.md).

Bad: parsing JSON out of prose.

```ts
const text = (await model.invoke(prompt)).content as string;
const verdict = JSON.parse(text.match(/\{.*\}/s)![0]);
```

## Example 5: binding, fallback, breaker, 503

```ts
// container.ts
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

const llmBreaker = createCircuitBreaker({ name: 'llm', failureThreshold: 5, resetTimeoutMs: 30_000 });
```

```ts
// nodes/agent.ts
const response = await deps.breaker.execute(() =>
  deps.model.invoke([new SystemMessage(SYSTEM_PROMPT), ...state.messages], config),
);
```

```ts
// services/chat.service.ts
function toServiceError(error: unknown, signal: AbortSignal | undefined): unknown {
  if (error instanceof AppError || signal?.aborted) return error;
  return new ServiceUnavailableError('The assistant is temporarily unavailable.', 'LLM_UNAVAILABLE', 5, {
    cause: error,
  });
}
```

```ts
// container.ts — readiness: optional dependency, degraded when missing or tripped
{
  name: 'llm',
  critical: false,
  check: () =>
    !model
      ? Promise.reject(new Error('no model configured'))
      : llmBreaker.state() === 'open'
        ? Promise.reject(new Error('circuit open'))
        : Promise.resolve(),
},
```
