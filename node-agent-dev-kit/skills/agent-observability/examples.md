# Observability examples

Examples 1 to 3 and 5 are from `agent-boilerplate`. Examples 4 and 6 are extensions, typechecked against `@langchain/core` 1.3 and `@langchain/langgraph` 1.6.

## Example 1: `llm/usage-callback.ts`

```ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { Logger } from '../lib/logger.js';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

interface UsageMetadata {
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Counts tokens per request and logs each model call. Attach a fresh instance per request
 * through `callbacks` so usage is attributed to the right user and thread.
 */
export class UsageCallbackHandler extends BaseCallbackHandler {
  name = 'usage';
  readonly usage: TokenUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };

  constructor(private readonly logger: Logger) {
    super();
  }

  override handleLLMEnd(output: LLMResult): void {
    const generation = output.generations.at(0)?.at(0) as
      { message?: { usage_metadata?: UsageMetadata } } | undefined;
    const metadata = generation?.message?.usage_metadata;
    const inputTokens = metadata?.input_tokens ?? 0;
    const outputTokens = metadata?.output_tokens ?? 0;
    this.usage.calls += 1;
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.logger.info({ inputTokens, outputTokens }, 'llm call finished');
  }
}
```

## Example 2: one handler per request

```ts
// container.ts
controllers: {
  threads: createThreadsController(chat, () => new UsageCallbackHandler(logger)),
  // ...
},
```

```ts
// controllers/threads.controller.ts
const send: RequestHandler = async (_req, res) => {
  const { params, body } = validated(res, sendMessageRequest);
  const usage = usageHandler();
  const reply = await chat.send({
    userId: requirePrincipal(res).userId,
    threadId: params.threadId,
    content: body.content,
    signal: res.locals.signal as AbortSignal | undefined,
    callbacks: [usage],
  });
  res.json({ ...reply, usage: usage.usage });
};
```

Bad: one handler for the whole process; every reply reports everyone's tokens, and concurrent requests race.

```ts
const usage = new UsageCallbackHandler(logger);
export function createThreadsController(chat: ChatService) { /* ... callbacks: [usage] ... */ }
```

## Example 3: logging without content

Good (from the boilerplate):

```ts
options.logger.warn({ reasons: assessment.reasons, blocked: !assessment.allowed }, 'input guardrail triggered');
deps.logger.warn({ err: error }, 'knowledge search failed');
this.logger.info({ inputTokens, outputTokens }, 'llm call finished');
```

Bad: user text and retrieved documents end up in the log store, outside every access control the service enforces.

```ts
logger.info({ question: state.messages.at(-1)?.content, chunks: results }, `answering ${userId}`);
```

## Example 4: trace labels in the run config (extension)

```ts
function runConfig(options: SendOptions) {
  return {
    configurable: { thread_id: options.threadId, user_id: options.userId },
    recursionLimit: maxIterations * 2 + 4,
    signal: options.signal,
    callbacks: options.callbacks,
    runName: 'assistant-turn',
    tags: ['assistant', 'chat'],
    metadata: { thread_id: options.threadId },
  };
}
```

LangSmith groups runs by `runName` and lets you filter by `tags` and `metadata`. Keep values to ids and fixed strings.

## Example 5: environment and readiness

```bash
# .env — tracing is opt-in; nothing in src/ references LangSmith
LANGSMITH_TRACING=false
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=agent-boilerplate
```

```ts
// container.ts
const checks: HealthCheck[] = [
  { name: 'postgres', critical: true, check: database.ping },
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
  {
    name: 'embeddings',
    critical: false,
    check: () => (embeddings ? Promise.resolve() : Promise.reject(new Error('no embeddings configured'))),
  },
];
```

`GET /health/ready` → `200 { status: 'degraded', checks: [...] }` without a key or while the breaker is open; `503` only when Postgres is down.

## Example 6: testing the handler (extension)

```ts
import { AIMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';

it('sums usage across model calls', () => {
  const handler = new UsageCallbackHandler(createLogger({ level: 'silent', pretty: false }));
  const result = (input: number, output: number): LLMResult => ({
    generations: [
      [
        {
          text: '',
          message: new AIMessage({
            content: '',
            usage_metadata: { input_tokens: input, output_tokens: output, total_tokens: input + output },
          }),
        } as LLMResult['generations'][number][number],
      ],
    ],
  });
  handler.handleLLMEnd(result(100, 20));
  handler.handleLLMEnd(result(50, 10));
  expect(handler.usage).toEqual({ inputTokens: 150, outputTokens: 30, calls: 2 });
});
```
