# Human-in-the-loop examples

Not in `agent-boilerplate`. Typechecked against `@langchain/langgraph` 1.6 / `@langchain/core` 1.3 with the boilerplate's types, and run with `buildAssistantGraph` + `MemorySaver` + `scriptedModel`.

## Example 1: a write tool that asks first

```ts
// src/agents/assistant/tools/create-support-ticket.ts
import { tool } from '@langchain/core/tools';
import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';
import { withTimeout } from '../../../lib/resilience.js';
import { requireUserId } from '../../run-config.js';

export interface TicketGateway {
  create(input: { subject: string; body: string; requestedBy: string }): Promise<{ id: string }>;
}

/** What the person approving sees. */
export interface TicketDraft {
  action: 'create_support_ticket';
  subject: string;
  body: string;
}

/** What the client sends back through the approvals endpoint. */
export interface ApprovalDecision {
  approved: boolean;
  reason?: string | undefined;
}

export function createSupportTicketTool(deps: { tickets: TicketGateway; timeoutMs?: number }) {
  return tool(
    async ({ subject, body }, config) => {
      // Re-runs from here on resume: nothing above this line may have an effect.
      const decision = interrupt<TicketDraft, ApprovalDecision>({
        action: 'create_support_ticket',
        subject,
        body,
      });
      if (!decision.approved) {
        return `The user declined to create the ticket.${decision.reason ? ` Reason: ${decision.reason}` : ''}`;
      }
      const ticket = await withTimeout(
        deps.tickets.create({ subject, body, requestedBy: requireUserId(config) }),
        deps.timeoutMs ?? 5_000,
        'create ticket',
      );
      return `Created support ticket ${ticket.id}.`;
    },
    {
      name: 'create_support_ticket',
      description:
        'Create a support ticket for the user. The user is asked to confirm before it is created.',
      schema: z.object({
        subject: z.string().min(3).max(120),
        body: z.string().min(10).max(2_000),
      }),
    },
  );
}
```

Bad: the interrupt is swallowed by the catch, so the ticket is created with no approval prompt ever reaching the user.

```ts
async ({ subject, body }) => {
  try {
    interrupt({ subject, body });
    return (await deps.tickets.create({ subject, body })).id;
  } catch (error) {
    return 'Ticket creation failed.';
  }
};
```

## Example 2: service helpers

```ts
// src/services/chat.service.ts (additions)
import { Command, INTERRUPT, isInterrupted, type Interrupt } from '@langchain/langgraph';

export interface PendingApproval {
  id: string | undefined;
  action: unknown;
}

function toPending(interrupts: Interrupt[]): PendingApproval[] {
  return interrupts.map((pending) => ({ id: pending.id, action: pending.value }));
}

/** From the return value of invoke, or a `values` chunk of stream. */
function pendingFrom(state: unknown): PendingApproval[] {
  return isInterrupted(state) ? toPending(state[INTERRUPT]) : [];
}

/** From the checkpoint: what this thread is waiting for right now. */
async function pendingApprovals(graph: AssistantGraph, threadId: string): Promise<PendingApproval[]> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  return toPending(snapshot.tasks.flatMap((task) => task.interrupts));
}
```

`ChatReply` gains `pendingApprovals: PendingApproval[]`, and `runConfig` adds `user_id: options.userId` to `configurable` so the tool can scope the write.

## Example 3: send refuses a paused thread; resume continues it

```ts
async send(options: SendOptions): Promise<ChatReply> {
  await requireThread(options.userId, options.threadId);
  const graph = requireGraph();
  if ((await pendingApprovals(graph, options.threadId)).length > 0) {
    throw new ConflictError('Approve or reject the pending action first.', 'APPROVAL_PENDING');
  }
  const before = await previousMessageCount(graph, options.threadId);
  try {
    const state = await graph.invoke(turnInput(options.content), runConfig(options));
    await threads.touch(options.threadId);
    return { ...toReply(state, before), pendingApprovals: pendingFrom(state) };
  } catch (error) {
    throw toServiceError(error, options.signal);
  }
},

async resume(options: ResumeOptions): Promise<ChatReply> {
  await requireThread(options.userId, options.threadId);
  const graph = requireGraph();
  if ((await pendingApprovals(graph, options.threadId)).length === 0) {
    throw new ConflictError('Nothing in this conversation is waiting for approval.', 'NO_PENDING_APPROVAL');
  }
  const before = await previousMessageCount(graph, options.threadId);
  try {
    const state = await graph.invoke(new Command({ resume: options.decision }), runConfig(options));
    await threads.touch(options.threadId);
    return { ...toReply(state, before), pendingApprovals: pendingFrom(state) };
  } catch (error) {
    throw toServiceError(error, options.signal);
  }
},
```

`ResumeOptions` is `{ userId, threadId, decision: ApprovalDecision, signal?, callbacks? }`. Do not reset `iterations` on resume: the turn is still running.

## Example 4: streaming a pause

```ts
let finalState: AssistantStateType | undefined;
let pending: PendingApproval[] = [];
for await (const [mode, payload] of stream) {
  if (mode === 'values') {
    if (isInterrupted(payload)) {
      pending = pendingFrom(payload);
      continue;
    }
    finalState = payload;
    continue;
  }
  // token chunks as before (streaming-api skill)
}
if (!finalState) throw new ServiceUnavailableError('The assistant returned no answer.', 'LLM_UNAVAILABLE');
yield { type: 'done', ...toReply(finalState, before), pendingApprovals: pending };
```

A stream resumes the same way: `graph.stream(new Command({ resume: decision }), { ...runConfig(options), streamMode: ['messages', 'values'] })`.

## Example 5: request schema and route

```ts
// src/schemas/thread.schema.ts
export const approvalRequest = {
  params: z.object({ threadId: z.uuid() }).strict(),
  body: z.object({ approved: z.boolean(), reason: z.string().trim().max(500).optional() }).strict(),
} satisfies ValidationSchemas;
```

```ts
// src/routes/threads.routes.ts
router.post('/:threadId/approvals', validate(approvalRequest), controller.approve);
```

```ts
// src/controllers/threads.controller.ts
const approve: RequestHandler = async (_req, res) => {
  const { params, body } = validated(res, approvalRequest);
  const usage = usageHandler();
  const reply = await chat.resume({
    userId: requirePrincipal(res).userId,
    threadId: params.threadId,
    decision: body,
    signal: res.locals.signal as AbortSignal | undefined,
    callbacks: [usage],
  });
  res.json({ ...reply, usage: usage.usage });
};
```

## Example 6: tests

```ts
it('creates the ticket only after approval', async () => {
  const created: string[] = [];
  const tools = [
    createSupportTicketTool({
      tickets: { create: (ticket) => { created.push(ticket.subject); return Promise.resolve({ id: 'T-1' }); } },
    }),
  ];
  const model = scriptedModel([
    callTool('create_support_ticket', { subject: 'Broken login', body: 'Cannot log in since Monday.' }),
    answer('Your ticket T-1 is open.'),
  ]);
  const graph = buildAssistantGraph({
    model,
    tools,
    checkpointer: createMemoryCheckpointer(),
    breaker: createCircuitBreaker({ name: 'llm' }),
    maxIterations: 4,
    guardrailMode: 'block',
    logger,
  });
  const config = { configurable: { thread_id: 't1', user_id: 'user-1' } };

  const paused = await graph.invoke(
    { messages: [new HumanMessage('Open a ticket: I cannot log in')], iterations: 0, blocked: false },
    config,
  );
  expect(isInterrupted(paused)).toBe(true);
  expect((await graph.getState(config)).next).toEqual(['tools']);
  expect(created).toEqual([]);

  const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
  expect(created).toEqual(['Broken login']);
  expect(done.messages.at(-1)?.content).toBe('Your ticket T-1 is open.');
});
```

Add the same with `{ approved: false, reason: 'not now' }` (no ticket; the tool message says "declined"), and service-level tests for both 409 codes.
