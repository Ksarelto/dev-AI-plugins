---
name: ai-red-tests
description: Procedure for the factory AI-agent test author — write failing Vitest tests for tools, nodes, graphs, guardrails and prompts with a scripted model and fake retrievers (deterministic, offline), add only the stubs they import, and pin current agent behaviour for change requests. Preloaded by ai-test-author; not for direct use.
user-invocable: false
---

# AI-agent red tests

## Deterministic by construction

- The LLM is the project's scripted model helper (`tests/helpers/scripted-model.ts`): each test
  scripts the turns — a tool call with arguments, then an answer. Assert on what the graph does with
  them: which tool ran, with what input, what the final message contains, which state was saved.
- Retrieval is a fake `KnowledgeRetriever` returning fixed chunks; time and ids are injected.
- No real model, embedding or network call in `tests/unit/`. Behaviour that only a real model can
  show belongs to the eval suite (eval-author's task), not here.

| Task type | Test through |
|---|---|
| tool | the tool factory: `invoke` with valid input, invalid input (schema error message), dependency failure |
| node, graph | the compiled graph or chat service with a scripted model: routing, loop limit, final answer |
| guardrail, prompt | the guard function or prompt builder: blocked inputs, required instructions present |
| state, memory | the reducers and the checkpointer round trip |

## Red phase (`phase red`)

One test per planned case in the red-test files (new files). Stubs: a new tool or node factory
throws `new Error("not implemented")`; a changed factory gets the new optional dependency and keeps
today's behaviour. Run the exit check (`gate red`): each new test fails on an assertion or
"not implemented", the rest stays green.

## Characterisation (`phase char`)

Pin today's agent behaviour with scripted turns before a change: the tools offered, the routing and
the answers for representative inputs. These tests pass now; write only the files listed in T0.

After a dispute, T3 says what the builder claims; fix the test or keep it and say why.
