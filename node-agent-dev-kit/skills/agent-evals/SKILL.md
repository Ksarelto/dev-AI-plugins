---
name: agent-evals
description: Test and evaluate LangGraph agents — deterministic unit tests with a scripted model (RunnableLambda), SyntheticEmbeddings and MemorySaver, integration tests with the real PostgresSaver and pgvector via Testcontainers, and golden-set evals against real OpenRouter models with required citations and phrases, an LLM-as-judge using withStructuredOutput, a pass-rate threshold, and a CI job that skips without OPENROUTER_API_KEY. Use when writing agent or tool tests, adding golden cases, or checking a prompt, tool, chunking or model change for regressions. Not for plain HTTP route tests (node-backend-dev-kit api-testing).
---

# Agent tests and evals

## When to use

- A graph, node, tool, guardrail or retrieval change needs tests
- Adding golden questions for a new knowledge source, tool or prompt rule
- Deciding whether a prompt, tool description, chunking, retrieval or model change is a regression
- Not for HTTP-only behaviour (validation, auth, problem+json) → `node-backend-dev-kit:api-testing`

Hard constraints: `rules/agent-testing.mdc`. Copy the shapes in [examples.md](examples.md). Helper source: [references/scripted-model.md](references/scripted-model.md). Eval harness and golden-set format: [references/golden-evals.md](references/golden-evals.md).

## Three levels

| Level | Command | Model | Embeddings | Checkpointer / DB | Proves |
|---|---|---|---|---|---|
| Unit | `npm run test:unit` | `scriptedModel` | `SyntheticEmbeddings` or a fake `KnowledgeRetriever` | `MemorySaver`, in-memory threads | graph logic, tools, guardrails, service mapping |
| Integration | `npm run test:integration` | `scriptedModel` via `createTestApp({ chatModel })` | `SyntheticEmbeddings` | real `PostgresSaver` + pgvector (Testcontainers) | SQL, persistence, HTTP, SSE, ownership |
| Eval | `npm run eval` | real (OpenRouter) | real | `MemorySaver` + in-memory golden retriever | answer quality, citations, refusals, prompt rules |

`npm test` runs unit + integration only, offline and without a key.

## Procedure

1. **Unit tests for a graph** (`tests/unit/agents/<name>.test.ts`): a `setup(model, retriever, maxIterations)` that builds the real graph with `createMemoryCheckpointer()` and the real service with `createInMemoryThreads()`. Cover the behaviour list in `rules/agent-testing.mdc`. Assert on the reply and on `model.calls` (what the model saw).
2. **Script turns** with `callTool`, `answer`, `answerCitingFirstResult`, `failing`. One array entry per model call; the helper throws when the graph calls the model more often than scripted, which catches loops.
3. **Tool tests**: invoke the tool with a tool call object to get the `ToolMessage` and `artifact`; cover success, empty and failure or timeout (`agent-tools` example 5).
4. **Guardrail tests**: one blocking case per pattern and benign look-alikes that pass (`guardrails-safety`).
5. **Integration tests**: `createTestApp({ chatModel: scriptedModel(turns) })` with a shared `turns` array reset in `beforeEach`, `testApp.reset()` truncating tables. Cover ingest → ask → cited answer → history → 404 for other users, SSE, admin-only ingest, input caps, and `createTestApp({ chatModel: null, embeddings: null })` for degraded readiness and 503s.
6. **Golden cases** in `evals/golden/<agent>.json`: `{ id, question, mustCite, mustMention, expectUnknown?, expectBlocked? }`. Each system-prompt rule, each knowledge source and each tool gets at least one case; include an unknown-topic case and an injection case.
7. **Eval file** `evals/<agent>.eval.ts`: `describe.skipIf(!hasKey)`, real models from the `llm/` factories, the real graph and service, an in-memory retriever over `evals/golden/knowledge.json`, deterministic checks first, then the judge (`withStructuredOutput(judgeSchema, { name: 'judgement' })`) for faithfulness and relevance. `console.table` the results; `expect(passRate).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD)`.
8. **Run evals** before and after any change to prompts, tool descriptions, chunking, retrieval or models; report both pass rates and the failing ids.
9. **CI**: the `verify` job runs typecheck, lint, format, `test:coverage`, build and docker build without secrets; the `evals` job runs `npm run eval` on push only, with `OPENROUTER_API_KEY` from secrets.

## Checklist

- [ ] No real model, network or API key in `npm test`
- [ ] Real graph and service in unit tests; no `vi.mock` of `@langchain/*`
- [ ] Behaviour list covered: tool loop + citation, memory, degraded, blocked, step limit, 503, 404, stream `done`
- [ ] Assertions on `model.calls` where the model's input matters
- [ ] Integration tests use the real `PostgresSaver` and hybrid SQL
- [ ] Golden cases for every prompt rule, source and tool, plus unknown and injection cases
- [ ] Eval file skips without a key and enforces `PASS_RATE_THRESHOLD`
- [ ] Pass rates before and after reported with the change
