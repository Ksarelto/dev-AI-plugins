# Lens group: AI agent (node-agent-dev-kit, LangGraph.js services)

Applies to change-set files under the ai-agent role's path: `agents/<name>/` (state, graph, nodes,
tools, prompts), `guardrails/`, `rag/`, `llm/`, the eval suite and the services that run graphs.
The Express layers around them are judged with [fq-lens-backend.md](fq-lens-backend.md).

T1 names the stack knowledge to load (`node-agent-dev-kit:guardrails-safety`,
`node-agent-dev-kit:agent-evals`) and lists the rules (`rules/prompt-security.mdc`,
`rules/tools.mdc`, `rules/langgraph-state.mdc`, `rules/llm-calls.mdc`, `rules/rag.mdc`,
`rules/agent-testing.mdc`). The threat → defence map is in
`node-agent-dev-kit/skills/guardrails-safety/references/threat-model.md`; the eval harness and the
golden-set format are in `node-agent-dev-kit/skills/agent-evals/references/golden-evals.md`. Cite the
rule in `evidence`; do not restate it. The agent-design document (`03-architecture/agent-design.md`,
when the feature has one) is the ADR-level decision for the graph: judge drift against it.

## Already covered — do not file again

| Covered by | What it catches |
|---|---|
| gate-checks (before you) | typecheck, lint, build, unit and integration tests, and the **whole eval suite** (`eval` check `at_verify`) with its pass-rate thresholds |
| task gates | the eval run for every model-facing task type (graph, node, tool, prompt, model, rag, guardrail, eval) |

So a failing eval is never your finding. Whether the eval suite **proves the ACs** is.

## Prompt injection and untrusted text (`security`, P0 unless noted)

- The first node of a user-facing graph is the deterministic input guard; a blocked turn never
  reaches the model. A new user-facing graph or entry without it → P0.
- Retrieved, uploaded, fetched or tool-returned outside text is wrapped as an untrusted document
  before the model sees it; the system prompt says such text is data. Unwrapped text → P0.
- System prompts are constants in `prompts.ts`. One built from user input, retrieved text or env
  values → P0. User text only in a human message.
- Model output used as code, SQL, a shell argument, a URL to fetch, or unescaped HTML → P0.
- Authorization decided by the model, or `user_id` / `thread_id` taken from model arguments or from
  state a tool can overwrite, instead of `config.configurable` set by the service → P0.
- Secrets, connection strings or another user's data in prompts, tool output, logs or the checkpoint
  → P0.
- Citations not filtered against what the retriever returned this turn → P1.
- A new guardrail pattern without benign look-alikes that must pass, or a new prompt rule without a
  golden case → P2.

## Tool bounds (`security` / `assumptions`)

- Every tool schema field is bounded (`min`, `max`, enums); `z.any()` or an unbounded string → P1.
- A tool that writes, sends, pays or deletes calls `interrupt()` for human approval **before** the
  side effect, and not inside a `try/catch` that swallows the interrupt → P0 when missing.
- Tools are read-only and idempotent by default; a write tool retried automatically → P1.
- Every awaited dependency in a tool has a timeout; an outage returns a short relayable message and
  marks the result degraded instead of throwing → P1.
- Result counts capped and long text trimmed (tool output is re-sent on every later model call) → P2.
- A tool importing repositories, `db`, services or `Env` instead of receiving dependencies → P2.

## Loops, limits and cost (`assumptions` / `edge-cases`)

- Every loop has a cap in state (iterations vs the configured maximum) that ends with a user-facing
  message, **and** the run config sets `recursionLimit` as a backstop. Relying on `recursionLimit`
  alone, or no cap at all → P1.
- Per-turn fields reset in the turn input; state holds serialisable data only (no model, client or
  closure) → P1.
- Token usage: a prompt, tool description or retrieved context that grows without a bound (whole
  documents, full history every call, no top-k), a second model call per turn no AC needs, or a
  bigger model than `agent-design.md` chose → P2; P1 when a performance or cost NFR names a limit.
- Model clients only from the factory in `src/llm/` with timeout and retries from `Env`; a literal
  model slug, key or temperature → P1.
- Provider errors mapped by the service to a 503 problem; a fabricated answer on failure → P0.

## Evals present and meaningful (`tests`)

- Every AC about agent behaviour (answers, refusals, citations, tool choice) has a golden case or an
  eval assertion, named with its AC ID; deterministic behaviour (routing, guards, tool logic) has a
  unit test with a scripted model. An AC with neither → P1.
- The suite has an explicit pass-rate threshold and skips cleanly without the model key; a
  threshold lowered in this change without an `HD-n` note → P1.
- Golden cases include unhappy paths: a refusal, an injection attempt that must be blocked, an
  empty retrieval, a loop that must stop → P2 when missing.
- A unit test that scripts the model to return exactly the expected answer and asserts only that
  answer proves nothing about the graph; it must assert what the graph did (tool called, guard
  blocked, message shape) → P2.

## Lens hints for agent code

| Lens | Agent questions |
|---|---|
| `behaviour` | Node and tool names are contracts (stream filtering, tool messages); a rename changes clients. A prompt change alters answers to old questions — is there an eval for them? |
| `spec-adr-drift` | Graph shape, tools, memory and model choice as `agent-design.md` says; human-in-the-loop where it says |
| `edge-cases` | Empty retrieval, the model returning no tool call, a tool timeout, the iteration cap reached, a very long user message at the cap |
| `over-engineering` | A multi-agent graph for one tool, a custom memory layer next to the checkpointer, a framework the stack does not use |
