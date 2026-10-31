---
name: multi-agent
description: Coordinate several LangGraph.js agents in one graph — a supervisor that routes with Command goto and addNode ends, compiled subgraphs as nodes, handoff tools that jump to a sibling agent with Command.PARENT, and parallel fan-out with Send plus a concat reducer to merge results. Use when one agent is not enough, for router, planner-worker, map-reduce, specialist-team or agent-handoff designs. Not for a single tool-calling loop (langgraph-agent) or a second independent agent with its own endpoints (scaffold-agent-service).
---

# Multi-agent graphs

## When to use

- Specialists with different prompts and tool sets (research vs. writing, support vs. billing)
- A planner that splits work into N independent items processed in parallel
- One agent hands the conversation over to another
- Not for: one model with several tools → `langgraph-agent`; a separate agent behind its own routes → `scaffold-agent-service`

Hard constraints: `rules/agent-architecture.mdc`, `rules/langgraph-state.mdc`, `rules/llm-calls.mdc`. Copy the shapes in [examples.md](examples.md).

**Not implemented in `agent-boilerplate`.** The examples were typechecked and run against `@langchain/langgraph` 1.6: `Command({ goto, update, graph: Command.PARENT })`, `addNode(name, fn, { ends })`, compiled graphs as nodes, `Send`, `getCurrentTaskInput`. `@langchain/langgraph-supervisor` (`createSupervisor`) is **not** installed and not used; supervisors are hand-built so the guard, step cap and breaker stay explicit.

## Pick a pattern

| Pattern | Use when | Core API |
|---|---|---|
| Supervisor | a coordinator decides which specialist acts next, possibly several times | supervisor node returns `new Command({ goto })`, declared with `{ ends: [...] }`; specialists edge back to it |
| Handoff | the active agent decides to pass the conversation on | a `transfer_to_<agent>` tool returning `new Command({ goto, graph: Command.PARENT, update })` |
| Fan-out (map-reduce) | the same work on N items in parallel | conditional edge returning `Send('worker', item)[]`; a concat reducer collects results |
| Subgraph | a specialist is itself a graph (agent ⇄ tools) | `addNode('researcher', compiledSubgraph)` sharing the `messages` key |

## Procedure

1. **One folder per graph**: `src/agents/<team>/` holds the parent state, supervisor, prompts and `graph.ts`; each specialist is a subfolder (`<team>/researcher/`) with its own `graph.ts` and tools. Specialists never import each other.
2. **Parent state**: `...MessagesAnnotation.spec` plus a `steps` counter (overwrite reducer) for the supervisor cap; add concat reducers only for fields written by parallel branches.
3. **Supervisor**: a structured-output router role (`withStructuredOutput(Route, { name: 'route' })`, `llm-models`) with `next: z.enum([...specialists, 'FINISH'])`. The node returns `new Command({ goto, update: { steps: steps + 1 } })`; at `maxSteps` it goes to `END` with a fixed message. Declare `{ ends: [...specialists, END] }`.
4. **Specialists**: compile a subgraph **without** its own checkpointer (it inherits the parent's) and add it with `addNode`. It shares `messages` with the parent; other parent fields are invisible to it unless declared in its state.
5. **Handoffs**: the tool reads the subgraph's messages with `getCurrentTaskInput()` and returns `update: { messages: [...state.messages, toolMessage] }`, so the parent receives both the AI tool call and its tool result. The parent declares the subgraph node with `{ ends: [targets] }`.
6. **Fan-out**: `addConditionalEdges(source, (state) => items.map((item) => new Send('worker', { item })), ['worker'])`. The worker takes its own input type and returns `{ results: [one] }`; a concat reducer merges them; an edge from the worker to a combine node runs once after all branches. Cap the number of `Send`s.
7. **Bounds**: supervisor `maxSteps`, each specialist's own `iterations` cap, and a `recursionLimit` in the run config that covers both (count every node a full run can visit).
8. **Guard once**: the input guard runs as the parent's first node; specialists do not repeat it.
9. **Streaming**: tokens now come from several nodes. Filter `messages` chunks by the specialist node names that produce user-facing text (`streaming-api`), not just `agent`.
10. **Tests**: script each role with `RunnableLambda` / `scriptedModel` and assert the visiting order, the cap, and merged fan-out results. Add golden cases that exercise each specialist.

## Checklist

- [ ] Each specialist has its own folder, prompt and tools; no cross-imports
- [ ] Supervisor uses structured output, declares `ends`, and stops at `maxSteps`
- [ ] Subgraphs compile without a checkpointer; the parent compiles with one
- [ ] Handoff updates include the AI tool-call message and the `ToolMessage`
- [ ] Parallel branches write only fields with a concat reducer; fan-out is capped
- [ ] `recursionLimit` covers supervisor and specialist loops together
- [ ] Guard is the parent's first node
- [ ] Stream filtering knows every user-facing node
- [ ] Tests assert routing order, caps and merged results
