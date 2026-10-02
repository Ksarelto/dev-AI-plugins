# agent-dev-kit rules

## Stack

- **Runtime:** Node.js 22+, TypeScript strict, ESM. Vitest for tests. No Python.
- **LLM client:** official `openai` package. `baseURL` `https://openrouter.ai/api/v1`. Key `OPENROUTER_API_KEY`. One singleton in `src/llm/client.ts`.
- **Not in stack:** `@openrouter/sdk`, `api.openai.com` + `OPENAI_API_KEY`, Pydantic, RAGAS, DeepEval, Python `openai-agents`.
- **Structured output:** `chat.completions.parse` + `zodResponseFormat`. No `JSON.parse` on model text.
- **Model IDs:** OpenRouter slugs in `src/llm/models.ts` (role → slug). No literals at call sites.
- **Default agent runtime:** `@openai/agents` with `setDefaultOpenAIClient` and `setOpenAIAPI("chat_completions")`.
- **Graph runtime:** LangGraph.js only for custom topology, Postgres checkpoint, or `interruptBefore`.
- **One runtime per agent.** Do not mix `@openai/agents` and LangGraph.js in the same agent.
- **Schemas:** Zod. **RAG:** OpenRouter embeddings + Qdrant JS or pgvector; in-process BM25; rerank. **Eval:** Vitest + golden JSON + LLM-as-judge. **Traces:** OpenTelemetry; disable OpenAI-dashboard tracing with an OpenRouter key.

---

## Agent design

- Use an agent only when the step sequence cannot be determined up front. Static sequences are TypeScript or a RAG chain, not a loop.
- Default runtime is `@openai/agents`. Use LangGraph.js only for custom graphs, durable checkpoint/resume, or `interruptBefore`.
- State and tool I/O are Zod (or LangGraph `Annotation` backed by typed fields). No raw `Record<string, unknown>` as agent state.
- Every loop has an explicit `maxTurns` / `iteration` cap (typically 10–15) plus a wall-clock timeout.
- Tools are narrow, one concern, structured return with `error`. Cap about 10 tools per agent.
- Separate read tools from write tools. Irreversible writes require HITL before the tool runs.
- Final answers are structured output, not free-text parsing.

---

## LLM best practices

- Never parse model text with `JSON.parse`. Use `chat.completions.parse` + Zod (`zodResponseFormat`).
- `temperature: 0` for classification, routing, extraction, code, agent loops. Higher temperature only for explicitly creative nodes.
- Pick a **role** (`reason` / `generate` / `extract` / `embed`) and resolve the OpenRouter slug from `src/llm/models.ts`.
- Prompts are versioned files (`instructions.ts`), not string literals scattered in handlers.
- Log model, tokens, latency, session id on every call (OpenTelemetry).
- Retry transient 429/5xx via the SDK client; on persistent failure degrade or return a structured error — never dump the upstream error to the end user.

---

## Multi-agent

- Split agents only when specialists need their own instructions and tool allowlists, or subtasks are independent.
- Default composition is `@openai/agents` `handoff()`. LangGraph.js supervisor is for custom graphs, checkpoint, or `interruptBefore`.
- A triage/supervisor routes and synthesizes. It does not own specialist tools.
- Pass artifacts (ids, ticket body), not the full transcript, into the next agent.
- HITL on irreversible tools is `interruptBefore` (graph) or a confirmation guardrail (Agents SDK).
- Cap the full run (turns, wall clock, tokens). No A→B→A cycles without that cap.

---

## OpenAI SDK + OpenRouter

- Construct `OpenAI` with `baseURL: "https://openrouter.ai/api/v1"` and `apiKey: process.env.OPENROUTER_API_KEY`.
- Do not use `@openrouter/sdk`. Do not send traffic to `api.openai.com`.
- Default API is Chat Completions. `@openai/agents` must `setOpenAIAPI("chat_completions")` after `setDefaultOpenAIClient`.
- Structured output uses `zodResponseFormat` + `.parse`. Treat `parsed === null` / refusals as their own path.
- Model IDs are OpenRouter slugs (`provider/model`). Bare OpenAI ids (`gpt-4.1`) are wrong on this gateway.
- Disable OpenAI-dashboard tracing; an OpenRouter token is not an OpenAI platform key.

---

## RAG architecture

- Production retrieval is hybrid (dense + sparse/BM25 + RRF) plus rerank (top-20 → top-5) plus metadata filters. Dense-only is a bug.
- Ingest and query are separate modules. Do not embed or upsert on the request path.
- Parent-child chunking: index children (128–256 tokens), return parent text (512–1024).
- Dense embeddings: `openai.embeddings.create` on the OpenRouter client, model from `models.embed`. Same model for queries and documents.
- Store: pgvector if already on Postgres and corpus is small; Qdrant JS for dedicated/hybrid.
- Generator sees at most 5 chunks, most relevant first and last, numbered citations.
- Do not ship on feel. Golden set + Vitest + LLM-as-judge (faithfulness / precision / recall).
