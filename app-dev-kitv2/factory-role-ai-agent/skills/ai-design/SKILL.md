---
name: ai-design
description: Procedure for the factory AI architect — write 03-architecture/agent-design.md - graph topology, state schema, nodes, tools with input schemas and side effects, model tier per node, retrieval needs, guardrails and the eval plan, each traced to acceptance criteria. Preloaded by ai-architect; not for direct use.
user-invocable: false
---

# Agent design

Write `03-architecture/agent-design.md` with these sections, citing AC IDs:

1. **Topology** — the nodes and edges (a Mermaid `flowchart` is enough), the entry, the end, and the
   loop limit. Prefer extending the existing graph over a new one; say why when you add one.
2. **State** — the state fields with types and reducers; what is checkpointed per thread.
3. **Nodes** — one line each: input state, output state, model tier (`reasoning`/`fast`) or none.
4. **Tools** — name, description the model sees, input schema (Zod), read-only or writing. A
   writing tool needs a human confirmation step (`interrupt()`); say what is confirmed.
5. **Retrieval** — sources, chunking, filters, top-k; or "none".
6. **Guardrails** — input and output checks the criteria imply (PII, prompt injection, scope).
7. **Eval plan** — for every behavioural AC: the golden cases (question, must mention / must cite /
   expect refusal) and the pass-rate threshold. These become the eval tasks.
8. **Decisions** — the trade-offs you made (model tier, retrieval strategy, tool granularity) with
   the alternative you rejected.

Keep it to what the feature needs. Name existing files to change (`src/agents/<name>/…`) so the
planner can make tasks from them; the stack skills of `node-agent-dev-kit` hold the patterns.
