---
name: ai-red-tests
description: Procedure for the factory AI-agent test author — write failing Vitest tests for tools, nodes, graphs, guardrails and prompts with a scripted model and fake retrievers (deterministic, offline), add only the stubs they import, and pin current agent behaviour for change requests. Preloaded by ai-test-author; not for direct use.
user-invocable: false
---

# AI-agent red tests

Runs on: ai-test-author (sonnet) — one AI-agent task's red or characterisation phase: offline unit tests with a scripted model, plus the stubs they import.

A scripted model plays the LLM, so a test fails because code is missing, never because a model was
unlucky. The case table, per-type drivers and stub pitfalls are in
[ai-test-catalogue.md](references/ai-test-catalogue.md).

## 1. Read the pack

| Pack part | Take from it |
|---|---|
| T0 | phase, `red_tests`, `stubs`, "Satisfies" (AC text), "Planned test cases", files you may write, exit check |
| T1 | `node-agent-dev-kit:agent-evals` plus the task type's skills (e.g. `agent-tools` + `human-in-the-loop` for a tool), every `[READ]` rule (`rules/agent-testing.mdc` always) |
| T2 | `03-architecture/agent-design.md` (nodes, tools, state, approvals, failure behaviour), the PRD or delta-spec, `test-plan.yaml`, golden files |
| T3 | gate failures on a retry; the builder's reason after a dispute |

Then read the code you extend: `src/agents/<name>/` (graph, state, nodes, tools, prompts), the
service, `tests/helpers/scripted-model.ts`, and the existing `tests/unit/agents/<name>.test.ts`.

## 2. Choose the cases

1. Each planned case at level `unit` is one `it`, AC ID first in its name:
   `it('AC-0012 asks for approval before creating a ticket')`.
2. Planned cases at level `eval` are not yours: the eval-author writes them. Do not script a "model
   picks the right tool" test as a substitute.
3. For a model-facing task (graph, node, tool, prompt, guardrail), make sure the catalogue's done
   criteria are covered by the planned cases or by existing tests: three representative inputs, one
   that must not call a tool, a runaway input stopped by the cap, a write tool blocked until
   `interrupt()` approval (when the task has one), Zod-validated outputs. A missing one that the task
   changes → add it and record it under `deviations`.
4. A criterion with no deterministic outcome (tone, helpfulness) → leave it to the eval plan and say
   so in the summary; a criterion that contradicts `agent-design.md` → `needs_clarification`.

## 3. Write

| Task type | Test through |
|---|---|
| tool | the tool factory, invoked with a tool-call object; plus a graph test with `callTool` |
| node, graph | the real graph built with `createMemoryCheckpointer()` and driven through the real service |
| state, memory | two turns on one `thread_id`; the checkpointer round trip |
| guardrail, prompt | `assessInput` / guard node; `model.calls[0]` shows the prompt and wrapped documents |
| model | the factory with `testEnv`: missing key → `undefined` → 503 `LLM_NOT_CONFIGURED` |
| streaming | the service's `stream`, ending in `done` |
| rag | ingestion and retriever with `SyntheticEmbeddings` and a fake repository |

- Fake retrievers return fixed chunks with `chunkId`, `documentId`, `title`, `source`, `content`.
- Time, ids and limits are injected; `maxIterations` is small (2) where the cap matters.
- Assert on outcomes: reply text and citations, `degraded`, `blocked`, `pendingApprovals`, side-effect
  spies, `model.calls` (what the model saw), `getState(config).next`. Never on log lines.

Worked mini-example — AC-0012 "the assistant creates a support ticket only after the user confirms":

```ts
it('AC-0012 pauses before creating the ticket', async () => {
  const tickets = { create: vi.fn() };
  const model = scriptedModel([callTool('create_support_ticket', { subject: 'Login fails' })]);
  const { chat, threadId } = await setup(model, { tickets });
  // .resolves turns today's 503 (the stub, the unscripted extra turn) into an assertion failure
  await expect(chat.send({ userId: 'user-1', threadId, content: 'Open a ticket: login fails' }))
    .resolves.toMatchObject({ pendingApprovals: [expect.anything()] });
  expect(tickets.create).not.toHaveBeenCalled();
});
```

## 4. Stubs (phase `red`)

Only the T0 `stubs`: a new tool, node or graph factory exists with its final signature and throws
`new Error('not implemented')`; a changed factory gets the new optional dependency and keeps today's
behaviour so the existing tests stay green. Read the stub pitfalls in the catalogue: a throwing tool
becomes an error `ToolMessage`, a throwing node becomes a 503 through the service.

## 5. Failure reason, then the exit check

1. Run each file alone: `npx vitest run --project unit <file>`. The first line of every failure must
   be an assertion or `not implemented`. Fix `is not a function`, `Cannot find module`,
   `scripted model has no more turns`, `Invalid environment`.
2. Run the exit check from T0 (`gate red`): tests and stubs type-check; each red file is collected,
   loads, and every test in it fails for the right reason (none passing, skipped or `todo`); every
   other touched test still passes.

## Characterisation (phase `char`)

Pin today's behaviour before a change: the tools bound to the model, the routing, the replies and
citations for representative inputs, the cap message, the blocked message — with scripted turns that
match what the current code does. The tests pass now; you write only the test files in T0; the exit
check is `gate impl`.

## After a dispute

T3 says what the builder claims and the sources are back at your red. Fix the test if the claim is
right (once); otherwise keep it and give the reason in your summary.

## Checklist

- [ ] No real model, embedding, network or key; no `vi.mock` of `@langchain/*`
- [ ] Real graph and service; scripted turns match a correct run exactly
- [ ] Done-criteria cases present for model-facing tasks; eval-level cases left to the eval task
- [ ] Every failure is an assertion or `not implemented`, checked per file
- [ ] Only T0's files and stubs written; the exit check passed
