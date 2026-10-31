---
name: llm-models
description: Configure LLM chat models and embeddings through OpenRouter with @langchain/openai — the createChatModel and createEmbeddings factories, model roles and MODEL_* env slugs, timeout and maxRetries, bindTools with withFallbacks to a second provider, the llm circuit breaker, withStructuredOutput with Zod schemas, and the 503 LLM_UNAVAILABLE mapping. Use when switching or adding a model, a fallback, a classifier or judge, getting structured JSON from a model, or fixing provider timeouts, 429s and outages.
---

# LLM models

## When to use

- Switching the chat or embedding model, or adding a fallback provider
- Adding a model for a new purpose (router, classifier, summarizer, eval judge)
- Getting typed, structured output from a model
- Provider timeouts, rate limits or outages reach users badly
- Not for prompts and prompt injection → `guardrails-safety`; token accounting → `agent-observability`

Hard constraints: `rules/llm-calls.mdc`, `rules/stack.mdc`. Copy the shapes in [examples.md](examples.md).

## Environment

| Variable | Default | Used by |
|---|---|---|
| `OPENROUTER_API_KEY` | empty → no models, service `degraded` | both factories |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | `configuration.baseURL` |
| `APP_URL`, `APP_NAME` | `http://localhost:3100`, service name | OpenRouter attribution headers |
| `MODEL_CHAT` | `openai/gpt-4.1-mini` | role `chat` |
| `MODEL_CHAT_FALLBACK` | empty | role `chatFallback`, used through `withFallbacks` |
| `MODEL_EMBED`, `EMBEDDING_DIMENSIONS` | `openai/text-embedding-3-small`, `1536` | `createEmbeddings`; must match the `vector(n)` column |
| `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`, `LLM_TEMPERATURE` | `30000`, `2`, `0.2` | every client |

## Failure ladder

A model call fails over in this order; do not add layers of your own.

1. `maxRetries` inside the client (transient network, 429, 5xx), each attempt bounded by `timeout`
2. `withFallbacks([fallback])`: the same bound tools on a model from another provider
3. `createCircuitBreaker({ name: 'llm', failureThreshold: 5, resetTimeoutMs: 30_000 })` around `model.invoke` in the agent node: fail fast while the provider is down; readiness shows `llm` down → `degraded`
4. The service's `toServiceError`: provider errors become 503 `LLM_UNAVAILABLE` with `Retry-After: 5`; the open breaker's `CircuitOpenError` is already an `AppError` and passes through as 503 `DEPENDENCY_UNAVAILABLE` with the remaining reset time

## Procedure

1. **Switch a model**: change the slug in `.env` / compose / deployment config. No code change. Run `npm run eval` before and after and compare the pass rate.
2. **Add a fallback**: set `MODEL_CHAT_FALLBACK` to a model from a different provider that supports tool calling. `bindModel` in the container binds the same tools to both.
3. **Add a model role** (router, summarizer, judge):
   - add `MODEL_<ROLE>: optionalString` to `config/env.ts` and `.env.example`
   - extend `ModelRole` and the role → env-key map in `llm/models.ts` (example 3)
   - build it in the container; inject it into the node as a `Runnable`, never the factory
   - give it its own breaker only if it can fail independently (different provider)
4. **Structured output**: `createChatModel(env, role)?.withStructuredOutput(zodSchema, { name })`. The result is typed from the schema. Bound every field (`z.enum`, `max`) and `.describe()` fields the model must fill well.
5. **Change embeddings**: new `MODEL_EMBED` or `EMBEDDING_DIMENSIONS` means a migration for `vector(n)` and a full re-ingest (`rag-pipeline`).
6. **Tests**: never construct a real model in `npm test`. Inject `scriptedModel` (chat) or `SyntheticEmbeddings` through `ContainerOptions`; a structured-output role is a `RunnableLambda` returning the parsed object.

## Checklist

- [ ] No `new ChatOpenAI` / `new OpenAIEmbeddings` outside `src/llm/`
- [ ] Every client has `timeout`, `maxRetries`, `configuration.baseURL` from env
- [ ] Factory returns `undefined` without a key or slug; the container and service handle it
- [ ] Tools bound once in the container; fallback bound to the same tools
- [ ] Model calls in nodes go through the breaker and forward `config`
- [ ] Structured output uses `withStructuredOutput` with a bounded Zod schema
- [ ] Provider errors become 503 `LLM_UNAVAILABLE`, never a fake answer
- [ ] Embedding dimensions match the column; a change ships with a migration and re-ingest
- [ ] Eval pass rate compared before and after a model switch
