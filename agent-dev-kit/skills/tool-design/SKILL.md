---
name: tool-design
description: Design and implement agent tools with Zod input/output schemas, structured error fields, a read/write split, and a name registry for @openai/agents tool() or LangGraph.js structured tools. Use when adding or auditing a tool function, not when wiring Runner or StateGraph.
---

# Tool design

## When to use

Creating or auditing tools. Pair with `openai-agents-sdk` or `langgraph-agent` for the loop. Retrieval implementations live in `rag-pipeline`; this skill only wraps them as a tool.

Defer libraries to `rules/stack.mdc`.

## Procedure

1. Zod input: every field described; numeric ranges in the schema.
2. Zod output: data fields + `error: string | null`. Never a raw string.
3. Description: purpose, when to use, when **not** to use (name the sibling tool).
4. Catch expected failures into `error`. Throw only for broken process (missing env).
5. Inject host services and the authenticated actor through `RunContext` (or graph state). Do not import a global `db` from a tool. Add a **search** method on the host service — do not loop `list()` to fake search.
6. Split read vs write. Register writes for HITL (`interruptBefore` or a confirmation guardrail).
7. Register in `src/tools/registry.ts`. Agents list names, they do not import sibling agent tool files.
8. Same Zod schema for `@openai/agents` `tool()` and LangGraph `tool()` — two wrappers, one contract. Host Zod 3 + SDK Zod 4: see `embed-agent`.

Cap ~10 tools per agent.

## Checklist

- [ ] Zod in and out
- [ ] When-not-to-use in the description
- [ ] `error` field, no throw for not-found
- [ ] Read/write split + HITL on writes
- [ ] Registry entry
- [ ] Services via context, not global `db`; search method instead of `list()` loops

## References

- [examples.md](./examples.md)
