---
name: ai-design
description: Procedure for the factory AI architect — write 03-architecture/agent-design.md - graph topology, state schema, nodes, tools with input schemas and side effects, model tier per node, retrieval needs, guardrails and the eval plan, each traced to acceptance criteria. Preloaded by ai-architect; not for direct use.
user-invocable: false
---

# Agent design

Runs on: ai-architect (opus) — the S3 design of one feature's AI part: whether an agent is needed, its graph, state, tools, approvals, model roles, retrieval and eval plan.

You decide the shape; builders implement it task by task and the planner cuts tasks from it. How to
choose: [ai-decision-framework.md](references/ai-decision-framework.md). The document skeleton:
[ai-agent-design-template.md](references/ai-agent-design-template.md).

## 1. Read

| Source | For |
|---|---|
| T0 | the file you may write (`03-architecture/agent-design.md`) and the exit check (`gate arch`) |
| T1 "Stack knowledge for ai-agent" | `node-agent-dev-kit:langgraph-agent`, `graph-state-design`, `agent-tools`, `rag-pipeline`, `llm-models`, `human-in-the-loop`, `multi-agent`, plus the stack's rule files — load the skills as reference, keep this procedure |
| T2 | PRD or delta-spec (ACs with `kind`, NFRs for latency, cost, security), `stories.yaml`, the component map and ADRs the solution-architect wrote, `api-contract.yaml`, the capability index |
| the codebase | `src/agents/`, `src/llm/models.ts`, `src/rag/`, `src/container.ts`, `evals/golden/` — what exists to extend |

Prefer extending the existing agent and graph. A new agent folder needs a reason in "Decision".

## 2. Decide

1. List the behavioural ACs (what the agent must answer, refuse, call or ask) and the NFRs it must
   meet. ACs about HTTP only (auth, validation) belong to the backend role, not to this design.
2. Walk section 1 of the decision framework and stop at the first row that fits. If the answer is
   "no agent" (plain TypeScript or one structured-output call), still write the document: the Decision,
   Models, Failure behaviour, Eval plan and Folder tree sections, and "none" elsewhere.
3. For RAG, choose fixed pipeline vs agentic RAG with section 2; for several agents, write which
   condition of section 3 holds.
4. Anything the inputs do not settle (section 4 questions) → `open_questions`; do not invent a
   requirement. A missing approval owner for a write tool is always a question.

## 3. Write `agent-design.md`

Fill every section of the template, in its order:

| Section | Must contain | Traced to |
|---|---|---|
| Decision | chosen row, rejected cheaper row, agent folder and service | ACs, ADRs |
| Graph | Mermaid `flowchart` with `START`/`END`, every node name, every conditional edge including `END`; the iteration cap and `recursionLimit` | ACs |
| State | every field with type, reducer, default, lifetime; what goes in `config.configurable` | rules/langgraph-state.mdc |
| Nodes | factory, reads, returns, model role or none | — |
| Tools | `snake_case` name, the description the model sees, bounded Zod input, read/write class, timeout, artifact fields | ACs |
| Human in the loop | per write tool: payload, decision schema, resume endpoint, the two 409s; or "none" | ACs, NFRs |
| Models | role per node, env var, why that size, fallback provider (link `node-agent-dev-kit:llm-models`) | NFRs |
| Retrieval | sources, ingestion entry, chunking, top-k, filters, citation fields; or "none" | ACs |
| Guardrails | guard patterns, wrapped sources, output checks, data each tool may return | security NFRs |
| Failure behaviour | what the user gets for no key, provider down, breaker open, retrieval down, step cap | ACs (`error`, `edge`) |
| Eval plan | thresholds; per behavioural AC ≥ 2 golden cases with expectations and `expectedTools`; ≥ 20 dev cases in total | every behavioural AC |
| Folder tree | each file new or changed | — |
| Build order | task types in order: tool → state → node/prompt/guardrail → graph → rag → eval | ACs |
| Decisions and trade-offs | choice, alternative rejected, why, ADR | ADRs |

Rules that shape the content:

- The guard node is first on every user-facing graph; a blocked turn makes no model call.
- Every loop has an `iterations` cap with a user-facing message; `recursionLimit` is only a backstop.
- Every write tool calls `interrupt()` before its effect; read tools are the default.
- Caller identity and `thread_id` live in `config.configurable`; the model never decides authorization.
- Model slugs are env values; the design names roles.
- Each prompt rule you introduce gets a golden case in the eval plan.

## 4. Check, then the exit check

Self-check before running the gate:

- [ ] Every behavioural AC appears in at least one node, tool or guardrail row and in the eval plan
- [ ] Every node in the diagram is in the Nodes table and vice versa; every edge set lists `END`
- [ ] Every write tool has an approval entry; every tool has bounds and a timeout
- [ ] Eval plan has thresholds, ≥ 20 cases, cases with `expectedTools: []`, an injection case and an
      unknown-topic case
- [ ] Folder tree and build order name real paths under `src/agents/<name>/`, `src/services/`,
      `evals/`, `tests/unit/`
- [ ] No library outside `rules/stack.mdc`; no model slug as a constant

Run the exit check (`gate arch`). For this file it checks only that `agent-design.md` exists when a
role with an architect is enabled; the rest of the gate checks the component map, ADRs and the API
contract, which other agents own. A failure about their files is not yours to fix: report it. The
design's quality is judged at GATE-A by a human and later by the planner and reviewer, so the
self-check above is the real bar.
