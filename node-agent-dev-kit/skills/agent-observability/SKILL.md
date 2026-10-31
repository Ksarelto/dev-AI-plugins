---
name: agent-observability
description: Observe LLM agents in production — per-request token usage with a UsageCallbackHandler on handleLLMEnd and usage_metadata, usage returned in replies, runName, tags and metadata in the run config for traces, LangSmith tracing switched on by LANGSMITH_* environment variables, logging without prompts or document text, degraded flags, and llm and embeddings readiness checks. Use when adding token or cost tracking, per-user usage limits, tracing, or when debugging what an agent did on a turn. Not for pino setup, request ids or HTTP request logging (node-backend-dev-kit logging-observability).
---

# Agent observability

## When to use

- Tracking tokens and cost per request, user or thread
- Turning on tracing to see each node, tool call and model call of a turn
- A turn behaved oddly and you need to know which step did what
- Health and readiness should reflect model availability
- Not for logger setup, `req.log`, request ids and redaction → `node-backend-dev-kit:logging-observability`

Hard constraints: `rules/agent-observability.mdc`, `rules/prompt-security.mdc`. Copy the shapes in [examples.md](examples.md).

## Signals

| Signal | Source | Where it goes |
|---|---|---|
| Tokens per model call | `UsageCallbackHandler.handleLLMEnd` → `usage_metadata` | `llm call finished` log line (`inputTokens`, `outputTokens`) |
| Tokens per request | the same handler instance, summed | `usage` in the JSON reply (`inputTokens`, `outputTokens`, `calls`) |
| Guardrail hits | guard node | `warn` log with `reasons`, `blocked` |
| Retrieval failures | `search_knowledge` catch | `warn` log with `err`; reply `degraded: true` |
| Provider state | `llmBreaker.state()` | `/health/ready` check `llm` (non-critical → `degraded`) |
| Model / embeddings configured | container | readiness checks `llm`, `embeddings` |
| Full trace (nodes, tools, prompts, outputs) | LangChain / LangGraph callbacks | LangSmith, only when `LANGSMITH_TRACING=true` |

## Procedure

1. **Usage per request**: the container passes a factory `() => new UsageCallbackHandler(logger)` to the threads controller. Each handler call creates a fresh instance and passes it as `callbacks: [usage]` to the service, which puts it in the run config. Return `usage: usage.usage` with the reply.
2. **Streams**: the boilerplate does not attach usage to `stream`. To add it, create the handler in the stream controller, pass it as `callbacks`, and add `usage` to the `done` event (the handler has its totals by the time `done` is built).
3. **Forward config** everywhere: nodes call `model.invoke(messages, config)`; tools invoked by `ToolNode` inherit it. Without `config`, callbacks, tracing and abort stop at that call.
4. **Cost**: compute cost from `usage` and a per-model price table in config, outside the request path (a log pipeline or a periodic job). Per-user quotas read summed usage from a store you control; do not call the provider's billing API per request.
5. **Trace labels**: add `runName`, `tags` and `metadata: { thread_id }` to the run config (example 4). Never put user text, emails or tokens in labels.
6. **LangSmith**: set `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` in the environment. No code change and no tracing client in `src/`. Tracing sends prompts, retrieved text and answers to LangSmith: enable it only where the data policy allows, and prefer a separate project per environment.
7. **Logging**: object first, static message, `err` key for errors. Log ids, counts, durations, reasons. Never prompts, message content, retrieved chunks, tool arguments with user data, or keys.
8. **Readiness**: `postgres` is critical; `llm` (no model or breaker open) and `embeddings` (not configured) are optional and turn the report `degraded`. A health check never calls a model or spends tokens.
9. **Debugging a turn locally**: enable LangSmith in dev, or step through checkpoints with `getStateHistory` (`checkpointing-memory` example 6). Do not add `console.log` (ESLint `no-console`).
10. **Tests**: scripted models do not emit `handleLLMEnd`, so `usage` is zero offline. Unit-test the handler by calling `handleLLMEnd` with an `LLMResult` carrying `usage_metadata`.

## Checklist

- [ ] One `UsageCallbackHandler` per request, never shared
- [ ] Every model call forwards `config`
- [ ] Replies return `usage`; streams too if the product needs it
- [ ] Logs contain no prompt, message, document or tool-argument text
- [ ] Guardrail and retrieval warnings carry reasons and `err`, not content
- [ ] LangSmith only through env; off by default; data policy checked
- [ ] Trace labels contain ids, not user text
- [ ] Readiness: `llm` and `embeddings` non-critical, `postgres` critical, no model calls
