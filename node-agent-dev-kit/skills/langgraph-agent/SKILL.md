---
name: langgraph-agent
description: Build or extend a LangGraph.js agent graph — StateGraph with guard, agent and tools nodes, ToolNode, conditional edges to END, a tool-calling loop with an iteration cap and recursionLimit, compile with a checkpointer, wire it in container.ts, and run it from ChatService. Use when creating an agent, adding a node or edge, changing routing or the agent loop, or connecting a graph to the service. Not for state reducers (graph-state-design), writing a tool (agent-tools), or several cooperating agents (multi-agent).
---

# LangGraph agent

## When to use

- Creating the graph of a new agent, or changing the topology of an existing one
- Adding a node (classifier, summarizer, approval) or a conditional edge
- Wiring a graph into `container.ts` and a service
- Not for: state fields and reducers → `graph-state-design`; a new tool → `agent-tools`; a supervisor or fan-out → `multi-agent`; approval pauses → `human-in-the-loop`

Hard constraints: `rules/agent-architecture.mdc`, `rules/langgraph-state.mdc`, `rules/llm-calls.mdc`. Copy the shapes in [examples.md](examples.md). Other topologies (router, retry policy, `Command` routing) are in [references/topologies.md](references/topologies.md).

## The reference graph

```
START → guard ─(blocked)→ END
          └→ agent ⇄ tools (search_knowledge, get_current_time)
               └─(no tool calls or step limit)→ END
```

## Procedure

1. **Pick the topology.**

   | Need | Shape |
   |---|---|
   | Answer with tools (default) | guard → agent ⇄ tools |
   | Classify, then one of N paths | guard → classify → conditional edge per class ([references/topologies.md](references/topologies.md)) |
   | Fixed pipeline (extract → enrich → answer) | `addSequence` or plain `addEdge` chain |
   | Approval before a side effect | `human-in-the-loop` skill |
   | Several specialist agents | `multi-agent` skill |

2. **State** in `state.ts`: `Annotation.Root({ ...MessagesAnnotation.spec, iterations, blocked })` plus your fields (`graph-state-design`).
3. **Prompts** in `prompts.ts`: `SYSTEM_PROMPT` plus every fixed user-facing reply (`BLOCKED_MESSAGE`, `ITERATION_LIMIT_MESSAGE`). Each prompt rule gets a golden case.
4. **Nodes** as factories in `nodes/`:
   - `createGuardNode({ mode, logger })` runs `assessInput` on the last message and sets `blocked`.
   - `createAgentNode({ model, breaker, maxIterations })` returns the limit message once `iterations >= maxIterations`; otherwise `breaker.execute(() => model.invoke([new SystemMessage(SYSTEM_PROMPT), ...state.messages], config))` and `iterations + 1`.
5. **Tools** registry in `tools/index.ts` (`agent-tools`). The same array goes to `new ToolNode(tools)` and to `bindTools` in the container.
6. **Graph** in `graph.ts`: `build<Name>Graph(deps: <Name>GraphDeps)` → `new StateGraph(State).addNode(...).addEdge(START, 'guard').addConditionalEdges(...)` → `.compile({ checkpointer: deps.checkpointer })`. Export `type <Name>Graph = ReturnType<typeof build<Name>Graph>`.
7. **Container**: `bindModel(env, tools)` (primary `bindTools` + optional `withFallbacks`), one `createCircuitBreaker({ name: 'llm', failureThreshold: 5, resetTimeoutMs: 30_000 })`, `createPostgresCheckpointer(database.pool)`. No model → no graph (`undefined`).
8. **Service** runs the graph:
   - input per turn: `{ messages: [new HumanMessage(content)], iterations: 0, blocked: false }`
   - config: `{ configurable: { thread_id }, recursionLimit: maxIterations * 2 + 4, signal, callbacks }`
   - read the reply only from messages added this turn (`state.messages.slice(previousCount)`)
   - map failures with `toServiceError` → 503 `LLM_UNAVAILABLE`, unless the error is an `AppError` or the request was aborted
9. **Tests**: the behaviour list in the `agent-evals` skill, then `npm run eval` if prompts or tools changed.

## Decisions

| Question | Answer |
|---|---|
| Where does the system prompt go? | Prepended in the agent node on every call; never in state |
| How is the loop bounded? | `iterations` cap with a user-facing message; `recursionLimit` only as a backstop |
| Who catches provider errors? | Nobody in the graph; the service maps them to 503 |
| Can a node read env? | No. Limits and modes arrive in `deps` from the container |
| Prebuilt `createReactAgent`? | No; the guard, cap and breaker would be lost |

## Checklist

- [ ] `agents/<name>/` has `state.ts`, `prompts.ts`, `nodes/`, `tools/index.ts`, `graph.ts` and no import of Express, services, repositories or `db`
- [ ] Guard is the first node; a blocked turn makes zero model calls
- [ ] Agent node uses the breaker, forwards `config`, and stops at `maxIterations` with a fixed message
- [ ] Every `addConditionalEdges` lists its destinations including `END`
- [ ] `compile({ checkpointer })`; runs pass `thread_id` and `recursionLimit`
- [ ] Container returns `graph: undefined` without a model, and the service answers 503 `LLM_NOT_CONFIGURED`
- [ ] Unit tests cover the loop, memory, degradation, guard, step limit and provider failure
- [ ] `npm run lint` (dependency-cruiser) passes
