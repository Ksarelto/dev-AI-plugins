---
name: ai-implement-task
description: Procedure for the factory AI-agent builder — build a node or tool with injected models and retrievers, register tools in the agent's registry, Zod-validated read-only tools, interrupt() before any write, prompts in prompts.ts, loop limits; done when red tests, eval thresholds and static checks pass. Preloaded by ai-builder; not for direct use.
user-invocable: false
---

# Implement one AI-agent task (green phase)

Runs on: ai-builder (sonnet) — the GREEN half of one task of a LangGraph.js agent (in phase `build` first write and prove the red tests with `ai-red-tests` and `gate red`) (graph, state, node, tool, prompt, model, memory, streaming, guardrail, fix, refactor) within the task's file budget.

Order, done criteria, the eval check and the must-fix list:
[ai-build-order.md](references/ai-build-order.md). The red tests are read-only.

## 1. Orient

1. T0: task, type, "Satisfies", "Definition of done", red tests, files you may write, exit check.
   T3 on a retry: rung 1 fixes only what it lists; rung 2 starts with a one-sentence root-cause
   hypothesis; rung 3 applies the diagnosis file listed in T1.
2. T1: load every stack skill with the Skill tool (first, per the pack's Skills preflight; report them as `skills_loaded` in the envelope), read every `[READ]` rule, open the golden file.
3. `03-architecture/agent-design.md`: the rows for your node, tool, state field, approval, model role
   and failure behaviour. The design is binding; a conflict with a red test is a dispute, a conflict
   with the code is a question.
4. Read the red tests; list per test the reply, citations, flags, spies and `model.calls` it expects.
5. Read the code you extend: `src/agents/<name>/`, the service, `src/container.ts`, `src/llm/`.
6. Lay the build order of your task type over T0's files. A needed file missing → `needs_scope_change`, with its path in the envelope's `scope_files`.

## 2. Build rules

| Piece | Rule | Rule file |
|---|---|---|
| tool | one file, `create<Name>Tool(deps)`, `snake_case` name, two-sentence description, bounded Zod schema, `withTimeout` on every await, failures return a short message and `degraded: true` in the artifact, external text wrapped with `asUntrustedDocument`, registered in `tools/index.ts` | `rules/tools.mdc` |
| write tool | `interrupt()` first and outside `try/catch`; effect after approval, idempotent, scoped to `user_id` from config | `rules/tools.mdc`, `node-agent-dev-kit:human-in-the-loop` |
| state | `reducer` + `default` + lifetime comment; only serializable data; per-turn fields reset in the service's turn input | `rules/langgraph-state.mdc` |
| node | factory with deps; returns a partial update with only new messages; model call is `deps.breaker.execute(() => deps.model.invoke(messages, config))`; no provider error caught | `rules/llm-calls.mdc` |
| graph | guard first; every conditional edge lists `END`; `compile({ checkpointer })` from deps; no `createReactAgent` | `rules/agent-architecture.mdc` |
| service | run config with `thread_id` from the threads table, `recursionLimit`, signal, callbacks; reply from this turn's messages; `toServiceError` → 503 | `rules/langgraph-state.mdc`, `rules/llm-calls.mdc` |
| container | the only caller of `createChatModel`, `createEmbeddings`, `createPostgresCheckpointer`, `bindTools`; graph `undefined` without a model | `rules/agent-architecture.mdc` |
| prompt | constants in `prompts.ts`; no interpolation of user, document or env text; each new rule has a golden case (eval task) | `rules/prompt-security.mdc` |

## 3. Write

1. Follow the order; `npm run typecheck` after each step.
2. Smallest change that turns the tests green. No new model role, tool or node the design does not
   list; no new package; no `@langchain/*` upgrade.
3. Keep node and tool names stable: the service filters stream chunks by node and tool messages by
   name. A rename touches both, and the eval run.
4. A tool description is a prompt: change it only when the task says so.

Worked mini-example — red test "AC-0012 pauses before creating the ticket": add
`tools/create-support-ticket.ts` whose first statement is
`const decision = interrupt<TicketDraft, ApprovalDecision>({ action: 'create_support_ticket', ...input })`;
on `decision.approved` call `deps.tickets.create(...)` with `withTimeout` and the caller from
`config.configurable.user_id`; on rejection return `The user declined to create the ticket.`;
register it in `tools/index.ts`. The service's `pendingFrom(state)` already reports pauses if the
graph has it; otherwise that is step 6 and must be in T0's files.

## 4. Verify, then the exit check

1. `npx vitest run --project unit <each red test>` until green; the rest of the unit suite stays green.
2. Walk the done criteria and the must-fix list in the reference; search only your own files.
3. Run the exit check (`gate impl`) once the tests are green. It checks: red tests unchanged since
   `gate red`; the touched tests pass (the whole suite on the role's last task) and the task's tests
   ran unskipped; typecheck, lint (ESLint + dependency-cruiser) (no production build per task: verification builds); and for model-facing task types
   the eval run — **real models, real cost** — with a passing eval test per planned AC.
4. Eval skipped for lack of `OPENROUTER_API_KEY` → the gate reports `eval-skipped` and blocks: return
   `blocked` naming the key (or `quality.allow_skipped_checks`) — a retry cannot fix it; never weaken a
   case or a threshold, never edit an eval file outside your list.

## 5. Disputes and questions

- A red test that contradicts its AC, `agent-design.md` or a stack rule (it mocks `@langchain/*`,
  expects the model to decide authorization, needs a real key) → status `done` with
  `"test_dispute": { "test": "<file>", "reason": "…" }` (name the contract line). Never edit it, and never bend production code, add a shim, adapter or test-only hook to fit a fixture.
- A failing eval case you believe is wrong → `needs_clarification` naming the case and the reason.
- A new dependency, model provider or vector store → `needs_clarification` (human-owned).

## Done when

- [ ] Red tests green unchanged; the done criteria of the reference hold for this task
- [ ] Guard first, cap and `recursionLimit` set, writes behind `interrupt()`, identity from config
- [ ] Untrusted text wrapped, prompts constant, citations through `selectCitations`
- [ ] No client built outside `src/llm/`, no env read in `agents/`, no provider error swallowed
- [ ] typecheck, lint clean; eval check passed or its skip reported; only T0's files changed
