# AI decision framework

How the AI architect decides what to build for a feature on `node-agent-dev-kit` (LangGraph.js +
LangChain.js on the layered Express core). The cheapest shape that meets the acceptance criteria
wins: every model call costs money and latency and needs evals, every loop needs a cap, every tool
widens the attack surface. Record the row you picked, and the row below it you rejected, in
`agent-design.md` "Decision".

## 1. Does this need an agent at all?

Walk the table top to bottom and stop at the first row that fits.

| The feature needs… | Build | Not |
|---|---|---|
| the same steps in the same order every time (validate → compute → store → notify) | plain TypeScript in a service; no model, no graph | a graph whose nodes never branch |
| one answer extracted, classified or scored from given text (invoice fields, intent, sentiment) | one `withStructuredOutput(zodSchema, { name })` call through a model role (`node-agent-dev-kit:llm-models`), called from a service | a tool loop, `JSON.parse` of free text |
| answers grounded in a fixed document set, one search per question | RAG pipeline: a fixed sequence guard → retrieve → answer, retrieval behind `KnowledgeRetriever` (`node-agent-dev-kit:rag-pipeline`) | an agent deciding whether to search |
| answers that need several searches, reformulation, or knowledge mixed with live data | agentic RAG: the reference graph guard → agent ⇄ tools, with `search_knowledge` as one tool | a supervisor and specialists |
| the model choosing between tools per turn (look up an order, then check stock) | LangGraph agent: guard → agent ⇄ tools with an iteration cap (`node-agent-dev-kit:langgraph-agent`) | `createReactAgent`, `@openai/agents` |
| a side effect (create, update, send, pay, book) | the agent above plus an `interrupt()` approval in the write tool (`node-agent-dev-kit:human-in-the-loop`) | a write tool without approval; the model deciding authorization |
| specialists with conflicting prompts or tool sets, or N independent items in parallel | multi-agent: supervisor, handoff or `Send` fan-out (`node-agent-dev-kit:multi-agent`) | one prompt that tries to be everything |

OpenRouter already gives every model behind one client; needing several providers is never a
reason for a second runtime or SDK.

## 2. Agentic RAG or a fixed RAG pipeline

| Signal in the criteria | Fixed pipeline | Agentic RAG |
|---|---|---|
| Question type | one fact or policy answer per question | comparisons, multi-part, follow-ups that need a second search |
| Sources | one knowledge base | knowledge base plus tools (live data, calculations) |
| Latency budget (NFR) | tight (one model call after retrieval) | allows 2–4 model calls |
| "I don't know" behaviour | answer only from retrieved text | may search again before giving up |
| Eval cost | lower: one path per case | higher: tool trajectories to check |

Both keep the guard node first, wrap retrieved text with `asUntrustedDocument`, and cite through
`selectCitations` (`rules/prompt-security.mdc`).

## 3. Multi-agent only when it pays

Choose a multi-agent graph only if at least one holds, and write which one:

- two roles need system prompts that contradict each other (a strict compliance reviewer and a
  friendly drafter);
- one agent would need more than about ten tools, so tool choice degrades;
- the work is N independent items that can run in parallel (`Send` fan-out, capped);
- a hand-over between distinct domains is a product requirement (support → billing).

Costs to state in the design: more model calls per turn, a `recursionLimit` that covers supervisor
and specialist loops together, golden cases per specialist, streaming filters per user-facing node.

## 4. Questions to settle before designing

If the PRD, stories or human notes do not answer these, they are `open_questions` (envelope), not
guesses:

| Area | Questions |
|---|---|
| Knowledge | Document types and volume? How fresh must answers be? Who may see which documents (tenant, owner, type filters)? Already in this service's Postgres? |
| Decisions | Which decisions are dynamic per request, which are fixed rules? |
| Effects | Which actions change data or reach the outside? Are any irreversible? Who approves them? |
| Conversation | Multi-turn with memory per thread, or one-shot? How long do threads live? |
| Limits | Latency and cost budget per turn (NFRs)? Maximum steps a turn may take? |
| Failure | What does the user see when the model or retrieval is down (degraded answer, 503)? |

## 5. Tools: read or write

| Class | Rule | Design entry |
|---|---|---|
| read, idempotent | default; bounded Zod input, timeout, small output | name, description, schema bounds, timeout, artifact fields |
| reads external text | every item wrapped with `asUntrustedDocument` | which source, which attributes |
| needs caller identity | `user_id` from `config.configurable`, never an argument | which check the service does first |
| write / send / pay | `interrupt()` before any effect, idempotent effect keyed by the tool call id | approval payload, decision schema, resume endpoint |

## 6. Model roles

Model slugs live in env, never in the design or the code. The design names **roles**
(`node-agent-dev-kit:llm-models`): `chat` (the tool-calling agent), `chatFallback` (another
provider, same tools), `embed`; a new purpose (router, extractor, summarizer, judge) is a new
`ModelRole` with a `MODEL_<ROLE>` variable. Per node, state which role it uses and why: a router or
classifier can use a small fast model; the answer node needs the strongest tool-calling model the
budget allows; an eval judge is at least as strong as the agent.

## 7. Eval plan defaults

Unless the spec's NFRs set other numbers, the eval plan uses these thresholds (the eval-author turns
them into named constants in the suite):

| Metric | Default |
|---|---|
| Faithfulness (judged answers supported by the retrieved documents) | ≥ 0.85 |
| Context precision (retrieved chunks that come from an expected source) | ≥ 0.75 |
| Context recall (expected sources that were retrieved) | ≥ 0.80 |
| Tool-name accuracy on cases with an expected tool list | 100 % |
| Suite pass rate | ≥ the stack's `PASS_RATE_THRESHOLD` (0.8) |

The development golden set has at least 20 cases, including cases where no tool may be called.

## 8. Never in a design for this stack

`@openai/agents`, direct `openai` SDK calls, provider SDKs, LlamaIndex, `AgentExecutor`,
`createReactAgent`, an external vector database or LangChain `VectorStore`, a second LLM client, a
model slug written as permanent, a tool that writes without approval, authorization decided by the
model, or a design without an eval plan (`rules/stack.mdc`, `rules/agent-architecture.mdc`).
