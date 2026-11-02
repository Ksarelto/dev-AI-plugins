# AI-agent red-test catalogue

Which deterministic tests prove an AI-agent task, and how to make them fail for the right reason.
The helpers (`scriptedModel`, `callTool`, `answer`, `answerCitingFirstResult`, `failing`,
`createInMemoryThreads`, `SyntheticEmbeddings`) and their source are in `node-agent-dev-kit:agent-evals`
(`references/scripted-model.md`); the behaviour list every graph must keep is in
`rules/agent-testing.mdc`. This file adds the factory's cases and the gate's view of them.

## What a unit test can and cannot prove

| Question | Unit test (scripted model) | Eval (real model, eval-author) |
|---|---|---|
| Does the graph route a tool call to the tool and back? | yes | — |
| Does the loop stop at the cap with the fixed message? | yes | — |
| Is a write blocked until approval? | yes | — |
| Is the reply's citation list filtered to what was retrieved? | yes | — |
| Does the model *choose* the right tool, or none? | no — the script decides | yes (`expectedTools`) |
| Is the answer faithful and on topic? | no | yes (judge) |

A scripted test that "proves" model judgement only proves your script. Write the path test here and
leave the choice to the eval plan.

## Where and how

- Files: the ones T0 lists, under `tests/unit/` (the unit project's include). Graph behaviour:
  `tests/unit/agents/<name>.test.ts`; a tool: `tests/unit/agents/<name>-<tool>.test.ts`; guardrails:
  `tests/unit/guardrails/…`; ingestion: `tests/unit/rag/…`.
- Graph tests build the **real** graph (`build<Name>Graph`) with `createMemoryCheckpointer()`, a
  fake `KnowledgeRetriever`, a breaker, a small `maxIterations`, and drive it through the real service
  with `createInMemoryThreads()` — as the stack's `setup(model, retriever, maxIterations)` helper does.
- One array entry per model call in `scriptedModel([...])`; the helper throws when the graph calls the
  model more often than scripted, which catches loops.
- Never `vi.mock` a `@langchain/*` module, never stub `graph.invoke`, never construct `ChatOpenAI` or
  read `OPENROUTER_API_KEY` in a unit test.

## Cases every model-facing task needs (the builder's done criteria)

| # | Case | Script | Assert |
|---|---|---|---|
| 1 | Three representative inputs from the ACs, each its own test | per input, the turns a correct run makes | reply text, citations, `model.calls.length` |
| 2 | One input that must **not** call a tool (small talk, a question answered from the prompt) | `[answer('…')]` | one model call, no `ToolMessage` in the turn (`graph.getState(config)` messages), the tool's dependency spy not called, no citations |
| 3 | A runaway input | `maxIterations = 2`, then `Array.from({ length: 3 }, () => callTool('search_knowledge', { query: 'x' }))` | reply equals `ITERATION_LIMIT_MESSAGE`, `model.calls.length === 2`, the turn resolves (no `GraphRecursionError`, no 503) |
| 4 | A write tool blocked until approval (only when the task adds or changes one) | `[callTool('<write_tool>', args), answer('…')]` | after `send`: `pendingApprovals` has one entry, the side-effect spy has 0 calls, `getState(config).next` is `['tools']`; a new message → 409 `APPROVAL_PENDING`; resume with `new Command({ resume: { approved: true } })` through the service → effect called once, scoped to `user_id` from config; reject → never called and the model's next input contains the rejection; resume with nothing pending → 409 `NO_PENDING_APPROVAL` |
| 5 | Zod-validated output (structured-output role, tool artifact, reply DTO) | structured role: `RunnableLambda.from(() => decisions.shift())` returning the parsed object | the result passes the exported Zod schema's `safeParse`; an out-of-schema tool input yields the tool's error message, not a crash; no test parses model text with `JSON.parse` |

Plus, for the graph the task touches, the stack's behaviour list stays green: cited answer, memory
across turns of one thread, retrieval failure → `degraded: true`, guard block with zero model calls,
step limit, provider failure → 503 `LLM_UNAVAILABLE` (`failing()`), another user's thread → 404, a
stream ending in `done`. Write new tests only for the items your ACs change; never delete one.

## Per task type

| Task type | Drive | Cases besides the table above |
|---|---|---|
| `tool` | the tool factory, invoked with a tool-call object `{ id, name, args, type: 'tool_call' }` so the `ToolMessage` carries the artifact | success, empty result, dependency failure or timeout (`degraded: true` in the artifact, a short relayable message), input at each schema bound, external text wrapped in `<document>`; plus a graph test with `callTool('<name>', args)` |
| `node` | the node factory with a state object and `config`, or the graph | partial update returned (only new messages), `config` forwarded (callbacks reach nested runs), cap respected |
| `graph` | the service over the real graph | routing per conditional edge including `END`, node order, cases 1–3 |
| `state` | two turns on one `thread_id` | per-turn fields reset by the turn input; thread fields survive; reducers concat or overwrite as designed |
| `prompt` | the prompt constants and the agent node's first model call (`model.calls[0]`) | the system message is first and constant; user text only in a `HumanMessage`; retrieved text inside `<document>`; the eval case for the new rule belongs to the eval task |
| `guardrail` | `assessInput` and the guard node | one blocking case per new pattern, at least two benign look-alikes that pass, zero model calls when blocked |
| `model` | the container or `createChatModel` with a test env | missing key or slug → `undefined` and 503 `LLM_NOT_CONFIGURED`; no network |
| `memory` | `createMemoryCheckpointer()` round trip | history restored by `thread_id`, isolation between threads |
| `streaming` | the service's `stream` | events in order, a final `done` with the reply and `pendingApprovals` |
| `rag` | the ingestion pipeline and retriever with `SyntheticEmbeddings` and a fake repository | positions, batch sizes, one transaction per document, filters passed through |
| `characterisation` | the same drivers against today's code | pins tools offered, routing and replies; passes now |

## Typed stubs and the right failure

The red gate accepts a failure whose first line is an assertion (`expected … to …`, `AssertionError`,
`expect(…).resolves/rejects…`) or contains `not implemented`. It rejects load errors (`Cannot find
module`, `is not a function`, `is not exported`), environment errors and timeouts.

| Pitfall | Effect | Do instead |
|---|---|---|
| a stub tool that throws inside `tool(fn)` | `ToolNode` turns it into an error `ToolMessage`; the graph keeps going | fine for graph tests (they fail on the reply assertion); for the tool's own test assert on the `ToolMessage`/artifact |
| a stub node or service call that throws | the service maps it to a 503 and the first line is no assertion | assert with `await expect(chat.send(…)).resolves.toMatchObject(…)` (or `.rejects.toMatchObject({ code })`), and test a new node through its factory where `not implemented` surfaces directly |
| fewer scripted turns than the finished code needs | `scripted model has no more turns` → 503 | script exactly the turns a correct run makes |
| a missing method on a stubbed object | `is not a function` → wrong failure | stub every function the test calls with its final signature |
| reading env in a test | `Invalid environment` | `testEnv(overrides)` |

Run each red file alone (`npx vitest run --project unit <file>`) and read the first failure line of
every test before running the gate.
