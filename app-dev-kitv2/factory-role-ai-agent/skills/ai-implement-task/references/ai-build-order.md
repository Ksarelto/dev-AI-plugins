# AI-agent build order, done criteria and must-fix list

For `node-agent-dev-kit` services (LangGraph.js + LangChain.js on the layered Express core). The
shapes to copy are in the task type's golden `examples.md` and in `node-agent-dev-kit:langgraph-agent`;
this file fixes the order, the definition of done and the defects that always cost a retry.

## Order

Build inside out: what the model can call, then what the graph remembers, then how it moves, then
how the service runs it, then what is logged. Each step compiles before the next
(`npm run typecheck`). Touch only the steps your task type owns and only the files T0 lists.

| # | Step | Files | Owned by task type |
|---|---|---|---|
| 1 | Tools | the dependency interface next to its owner (`rag/retriever.ts`, a client in `lib/`); `agents/<name>/tools/<kebab-name>.ts` (`create<Name>Tool(deps)` → `tool(fn, { name, description, schema, responseFormat })`); the registry `tools/index.ts` | `tool` |
| 2 | State | `agents/<name>/state.ts`: new fields with `reducer`, `default` and a lifetime comment; `<Name>StateType` / `<Name>StateUpdate` exports | `state`, `memory` |
| 3 | Prompts | `agents/<name>/prompts.ts`: `SYSTEM_PROMPT` and every fixed reply (`BLOCKED_MESSAGE`, `ITERATION_LIMIT_MESSAGE`, new ones) | `prompt` |
| 4 | Nodes | `agents/<name>/nodes/<node>.ts`: `create<Node>Node(deps)` returning `(state, config) => partial update`; the guard; the agent node with breaker, cap and `config` forwarded | `node`, `guardrail` (guard + `src/guardrails/`) |
| 5 | Graph | `agents/<name>/graph.ts`: `build<Name>Graph(deps)`, `addNode`, `addEdge(START, 'guard')`, `addConditionalEdges` listing every destination including `END`, `.compile({ checkpointer: deps.checkpointer })` | `graph` |
| 6 | Service wiring | `services/<name>.service.ts`: turn input resetting per-turn fields, run config (`thread_id`, `user_id` when needed, `recursionLimit`, `signal`, `callbacks`), `toReply` (this turn's messages, `selectCitations`, `degraded`, `pendingApprovals`), `toServiceError`; `src/container.ts`: model via `createChatModel`, `bindTools` once (+ `withFallbacks`), breaker, checkpointer, tools array, graph `undefined` without a model | `graph`, `model`, `memory` |
| 7 | Observability | a new `UsageCallbackHandler` per request passed as `callbacks`, `config` forwarded to every nested `invoke`, logs with counts and ids only, `runName`/`tags`/`metadata` without user text | `streaming` (+ `node-agent-dev-kit:agent-observability`) |

`rag` tasks belong to ai-rag-builder and `eval` tasks to eval-author. HTTP routes, controllers and
schemas follow the backend stack (`node-backend-dev-kit:express-resource`).

## Done criteria

A model-facing task (graph, node, tool, prompt, model, guardrail) is done only when all of these
hold, proven by the red tests or by existing tests that still pass:

1. **Three representative inputs** from the ACs give the expected replies and citations.
2. **One input that must not call a tool** answers in one model call with no tool message (the unit
   test proves the path; an eval case with `expectedTools: []` proves the model's choice).
3. **A runaway input stops**: the `iterations` cap returns the fixed limit message; the run config's
   `recursionLimit` (`maxIterations * 2 + 4` for the reference graph) is only the backstop.
4. **Write tools are blocked until approval**: `interrupt()` before any effect, the effect runs once
   after `Command({ resume })`, never on rejection, scoped to `config.configurable.user_id`.
5. **Outputs are Zod-validated**: structured output through `withStructuredOutput(schema, { name })`,
   tool inputs bounded by their schema, reply DTOs by their response schema; no `JSON.parse` or regex
   on model text.
6. **The eval run passes** for model-facing task types (the role's `eval` check, below).
7. **Static checks are clean**: typecheck, lint (ESLint + dependency-cruiser), build.

## The eval check in `gate impl`

For task types `graph`, `node`, `tool`, `prompt`, `model`, `rag`, `guardrail` and `eval` the gate runs
the stack's `eval` command (`npm run eval`: the `eval` Vitest project, `evals/**/*.eval.ts`).

- It calls **real models through OpenRouter and costs money**; it needs `OPENROUTER_API_KEY`.
- It first runs only the evals the change touches; if none ran, or an AC this task must prove has no
  test, it runs the whole suite.
- Every AC of this task's planned `eval` cases needs a **passing** eval test whose name contains that
  AC ID; a suite-wide pass rate does not cover a failing case.
- If every eval is skipped (no key) the check fails as `eval-skipped`, unless the project sets
  `quality.allow_skipped_checks`. Report it; never work around it.
- A failing eval case is a finding about the agent: fix the prompt, the tool description or the
  graph within your files. You may not edit eval files or thresholds; if you believe a case is wrong,
  return `needs_clarification` naming the case.

Run the exit check once when the unit tests are green, not in a loop: each run spends model calls.

## Prompt security (what the builder must keep)

The rules are `rules/prompt-security.mdc`; in build terms:

- The input guard node stays first on every user-facing graph; a new graph gets it too.
- Every retrieved, uploaded or fetched text reaches the model only inside `asUntrustedDocument(...)`
  (`<document>` wrapping); the system prompt keeps its rule that `<document>` content is data.
- Prompts are constants in `prompts.ts`; nothing user-, document- or env-derived is interpolated
  into a system prompt; user text goes only in a `HumanMessage`.
- Citations leave only through `selectCitations`; tool output carries only fields the caller may see.

## Must-fix list

| Defect | Fix |
|---|---|
| `new ChatOpenAI` / `new OpenAIEmbeddings` / `fetch` to a model API outside `src/llm/` | inject the model built by the container |
| `process.env` or `Env` read in `agents/`, a tool or a node | pass the value through the factory's deps |
| `createReactAgent`, `AgentExecutor`, `@openai/agents`, a provider SDK | the hand-built `StateGraph` |
| A loop without the `iterations` cap, or a run config without `recursionLimit` | cap in the agent node, `recursionLimit` in the service |
| `interrupt()` inside a `try/catch`, or work with effects before it | `interrupt()` first, outside any `try` |
| Caller identity, owner or role taken from tool arguments or state the model can write | `config.configurable.user_id`, checked by the service first |
| A provider error caught in a node, or a fabricated answer on failure | let it reach the service's `toServiceError` (503) |
| A tool without timeout, without bounds on its schema, or returning unbounded text | `withTimeout`, `.min/.max`, cap results and trim fields |
| Prompts, message content, retrieved text or tool arguments in logs | counts, ids, durations and reasons only |
| A system prompt stored in state or the checkpoint | prepend it per call in the agent node |
| A tool name, node name or description changed without the service filter and an eval run | rename together; the description is a prompt |
| A model slug, temperature or dimension as a literal | env via `createChatModel(env, role)` |
| `vi.mock` of `@langchain/*` to make a test pass | not allowed; red tests are read-only anyway |
| A new package or `@langchain/*` upgrade | human-owned (`policy.human_owned: new_dependency`): ask |
