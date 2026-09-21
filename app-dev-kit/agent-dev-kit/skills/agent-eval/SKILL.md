---
name: agent-eval
description: Set up Vitest evaluation for TypeScript agents and RAG — golden JSON datasets, Zod LLM-as-judge, trajectory tool-correctness and max-turns checks. Use before shipping or when changing prompts, tools, or chunking. Not for implementing Agent or StateGraph.
---

# Agent and RAG eval

## When to use

Before production, after prompt/tool/chunking changes, or when adding a golden case.

Use `rag-pipeline` / `openai-agents-sdk` / `langgraph-agent` to build the system under test. Do not add RAGAS, DeepEval, or LangSmith.

Defer libraries to `rules/stack.mdc`.

## Layers

| Layer | How |
|-------|-----|
| Hermetic HTTP / tools | Mocked `run` / fake services; 401 / 422 / 503 / 200. **Required in CI.** No live OpenRouter. |
| Retrieval | Golden `reference_doc_ids` vs retrieved ids |
| Generation | LLM-as-judge (`faithfulness`, relevance) via `chat.completions.parse` — optional until hermetic tests exist |
| Trajectory | Expected tool names, no unexpected writes, `turns <= maxTurns` |
| End-to-end | Golden input → structured output or judge threshold |

## Procedure

1. Hermetic first: tool unit tests against fakes; if the agent is mounted on HTTP, 401 / 422 / 503 (no key) / 200 with `run` mocked. CI must pass without `OPENROUTER_API_KEY`.
2. Golden JSON in `src/eval/golden/` (≥20 dev, ≥100 prod). Include `expected_tools: []` cases.
3. Judges in `judges.ts`: Zod schema, `models.extract`, same `openai` client. LLM-as-judge is optional until layer 1 is green.
4. `run.ts` scores and compares to thresholds.
5. `tests/eval/` wraps `run.ts` in Vitest. CI: `vitest run tests/eval` only when judges are wired; otherwise keep `npm test` hermetic.
6. Tool unit tests stay hermetic in `tests/tools/` (no network).

## Thresholds (tune per product)

- faithfulness ≥ 0.85
- context precision ≥ 0.75
- context recall ≥ 0.80
- expected tool names match 100% on the golden trajectory set

## Checklist

- [ ] Hermetic CI tests (mocked run / 503) before judges
- [ ] Golden set exists before optimization
- [ ] Judges are Zod-parsed, not free-text scores
- [ ] Loop-termination case
- [ ] CI fails on threshold miss
- [ ] No OpenAI-dashboard tracing in eval

## References

- [examples.md](./examples.md)
