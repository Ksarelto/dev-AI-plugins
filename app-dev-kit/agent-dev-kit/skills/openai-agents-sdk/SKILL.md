---
name: openai-agents-sdk
description: Build a production agent with @openai/agents in TypeScript — Agent, Runner.run, tool(), handoffs, guardrails, sessions, and structured outputType. Wire the OpenAI SDK to OpenRouter Chat Completions. Use for tool-calling loops that do not need LangGraph.js checkpointing.
---

# OpenAI Agents SDK (TypeScript)

## When to use

Tool-calling loops, handoffs, guardrails, or sessions on Node, with OpenRouter as the gateway.

Use `langgraph-agent` instead for `StateGraph`, Postgres checkpoint, or `interruptBefore`. Use `embed-agent` if `compose.ts` or an HTTP composition root already exists. Use `scaffold-agent` first if this is a new agent process and `src/llm/client.ts` does not exist. Use raw `chat.completions.parse` (not this skill) for a single extraction with no loop.

Defer libraries to `rules/stack.mdc`.

## Procedure

1. Ensure `scaffold-agent` or `embed-agent` files exist. At process start: `setDefaultOpenAIClient(openai)`, `setOpenAIAPI("chat_completions")`, `setTracingDisabled(true)` (or a non-OpenAI processor).
2. Define tools with `tool()` + Zod — load `tool-design`.
3. `new Agent({ name, instructions, model: models.reason, tools, outputType? })`.
4. `await run(agent, input, { maxTurns: 15, ... })` — always set `maxTurns`. Do not call `Runner.run` as a static method (JS SDK 0.18: instance method or the `run()` helper).
5. Multi-agent: `handoffs` / `handoff()`, not one agent with every tool.
6. Guardrails for off-topic input and irreversible tools (this SDK has no `interruptBefore`).
7. Durable `Session` in production; in-memory/SQLite is local-only.

## Checklist

- [ ] OpenRouter client + Chat Completions API, not Responses default
- [ ] `maxTurns` set
- [ ] `outputType` Zod when downstream needs a shape
- [ ] Handoffs for specialists
- [ ] Guardrail or confirmation context on write tools
- [ ] OpenAI-dashboard tracing off

## References

- [examples.md](./examples.md)
- [references/tools-and-handoffs.md](./references/tools-and-handoffs.md)
- [references/guardrails-and-tracing.md](./references/guardrails-and-tracing.md)
