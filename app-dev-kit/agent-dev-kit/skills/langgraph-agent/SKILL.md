---
name: langgraph-agent
description: Build a production LangGraph.js agent — StateGraph, ToolNode, MemorySaver or Postgres checkpointing, interruptBefore human-in-the-loop, Plan-Execute. LLM is OpenRouter ChatOpenAI. Use when custom graph topology or durable resume is required, not for a simple @openai/agents Runner loop.
---

# LangGraph.js agent

## When to use

Custom graph topology, Postgres checkpoint/resume, or `interruptBefore` HITL.

Use `openai-agents-sdk` for OpenRouter tool loops that do not need those. Use `embed-agent` if a host HTTP app already exists, otherwise `scaffold-agent` first (`langgraph-model.ts`). Do not mix `Runner` and `StateGraph` in the same agent.

Defer libraries to `rules/stack.mdc`.

## Procedure

1. State via `Annotation.Root` (or Zod). Include `iteration`. Values JSON-serializable.
2. Tools: LangChain `tool` + the same Zod schemas as `tool-design`.
3. LLM: `createGraphModel()` from `src/llm/langgraph-model.ts` (OpenRouter `ChatOpenAI`). `temperature: 0`. `bindTools`.
4. Nodes: agent node (enforce max iteration), `ToolNode`, `shouldContinue` → tools | end.
5. Compile with a checkpointer (`MemorySaver` dev, Postgres prod).
6. HITL: `interruptBefore` on the write-tool node.
7. Invoke with `configurable.thread_id`.

## Checklist

- [ ] Typed state + iteration cap
- [ ] Same OpenRouter origin/key as `src/llm/client.ts`
- [ ] Checkpointer configured
- [ ] `interruptBefore` on irreversible tools
- [ ] Golden-path tests including a no-tool prompt and a loop prompt

## References

- [examples.md](./examples.md)
- [references/state-design.md](./references/state-design.md)
- [references/checkpointing.md](./references/checkpointing.md)
