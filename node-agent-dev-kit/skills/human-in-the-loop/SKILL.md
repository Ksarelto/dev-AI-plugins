---
name: human-in-the-loop
description: "Pause a LangGraph.js agent for human approval with interrupt() and resume it with new Command({ resume }) — approval before write or side-effect tools, pending approvals from isInterrupted and getState tasks, a resume endpoint in the service, rejecting new messages while an approval is pending, idempotent re-execution, and approval events in the SSE stream. Use when a tool sends email, creates tickets, writes data, pays, or otherwise needs a person to confirm, edit or reject an action before it runs."
---

# Human in the loop

## When to use

- A tool has a side effect: create, update, delete, send, pay, book
- A person must review or edit what the agent is about to do
- Not for read-only tools → `agent-tools`; for debugging pauses use `interruptBefore` (`langgraph-agent` references)

Hard constraints: `rules/tools.mdc`, `rules/langgraph-state.mdc`, `rules/prompt-security.mdc`. Copy the shapes in [examples.md](examples.md).

**Not implemented in `agent-boilerplate`** (all its tools are read-only). The flow below was typechecked and run against `@langchain/langgraph` 1.6 with the boilerplate's `buildAssistantGraph`, `MemorySaver` and `scriptedModel`: `interrupt`, `Command`, `isInterrupted`, `INTERRUPT`, `getState().tasks[].interrupts` and `getState().next` behave as described.

## How it works

1. The model calls a write tool. Inside the tool, `interrupt(payload)` throws a special signal; LangGraph saves the checkpoint and `graph.invoke` returns the state with `__interrupt__: [{ id, value: payload }]`.
2. The thread now has `next: ['tools']` and one task with `interrupts`. Nothing has been written.
3. The client shows the payload and sends a decision. The service calls `graph.invoke(new Command({ resume: decision }), config)` on the same `thread_id`.
4. The tools node **runs again from the start**: `interrupt()` now returns the decision instead of pausing, and the tool acts (or reports the rejection). The loop continues to the model.

## Procedure

1. **Payload and decision types** next to the tool: `interface TicketDraft { action: 'create_support_ticket'; ... }` (what the person sees) and `interface ApprovalDecision { approved: boolean; reason?: string }`.
2. **Tool**: call `interrupt<Payload, Decision>(payload)` first, before any side effect, and outside any `try/catch`. On rejection return a short message (`The user declined ...`). On approval act with a timeout, using `user_id` from `config.configurable` for authorization.
3. **Idempotency**: everything before `interrupt()` re-runs on resume, and sibling tool calls in the same `ToolNode` step run again. Keep write tools free of work before the interrupt; make the side effect idempotent (an idempotency key derived from the tool call id) when the target supports it.
4. **Service, send and stream**: after `graph.invoke`, `pendingFrom(state)` (via `isInterrupted(state)` and `state[INTERRUPT]`) returns pending approvals; add them to the reply as `pendingApprovals`. In `stream`, a `values` payload with `__interrupt__` is the pause: record it, do not treat it as the final state.
5. **Service, guard**: before starting a new turn, check `getState(...).tasks` for interrupts and throw 409 `APPROVAL_PENDING`. A new `HumanMessage` on a paused thread silently drops the pending action and leaves an AI tool call without a tool result, which providers reject on the next call.
6. **Service, resume**: ownership check → 409 `NO_PENDING_APPROVAL` when nothing waits → `graph.invoke(new Command({ resume: decision }), runConfig)` → same reply mapping. The resume value is validated by a Zod request schema before it reaches the graph; never pass the raw body.
7. **HTTP**: `POST /api/v1/threads/:threadId/approvals` with `{ approved, reason? }`, plus a stream variant if the UI streams. Add `pendingApprovals` to the reply DTO and the OpenAPI spec (`node-backend-dev-kit:openapi-docs`).
8. **System prompt**: tell the model the tool asks the user for confirmation, so it does not ask twice in text.
9. **Tests** with `scriptedModel([callTool('create_support_ticket', args), answer('...')])` and `MemorySaver`: pause (no side effect yet, `next` is `['tools']`), approve (side effect once), reject (no side effect, model sees the rejection), 409 on a new message while paused, 409 on resume with nothing pending, and an eval case that the model calls the tool only when asked.

## Checklist

- [ ] `interrupt()` is the first statement with an effect in the tool, outside any `try/catch`
- [ ] Payload shows exactly what will happen; decision type validated by Zod at the edge
- [ ] Side effect runs only after approval, with a timeout, scoped to `config.configurable.user_id`
- [ ] Re-execution is safe (no work before `interrupt()`, idempotent write)
- [ ] Replies and `done` events carry `pendingApprovals`
- [ ] New messages on a paused thread → 409 `APPROVAL_PENDING`
- [ ] Resume endpoint checks ownership and pending state, then `new Command({ resume })`
- [ ] Graph compiled with a checkpointer (interrupts need one)
- [ ] Tests for pause, approve, reject and both 409s
