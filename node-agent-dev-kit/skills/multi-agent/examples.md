# Multi-agent examples

Not in `agent-boilerplate`. Each example was typechecked against `@langchain/langgraph` 1.6 / `@langchain/core` 1.3 and run with `RunnableLambda` or `scriptedModel` stand-ins.

## Example 1: supervisor with `Command` routing and a subgraph specialist

```ts
// src/agents/team/state.ts
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

export const TeamState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /** Supervisor decisions in the current turn. Reset by the service. */
  steps: Annotation<number>({ reducer: (_current, update) => update, default: () => 0 }),
});

export type TeamStateType = typeof TeamState.State;
```

```ts
// src/agents/team/nodes/supervisor.ts
import { AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { Command, END } from '@langchain/langgraph';
import { z } from 'zod';
import { STEP_LIMIT_MESSAGE, SUPERVISOR_PROMPT } from '../prompts.js';
import type { TeamStateType } from '../state.js';

export const Route = z.object({
  next: z.enum(['researcher', 'writer', 'FINISH']),
  reason: z.string().max(200),
});
export type RouteDecision = z.infer<typeof Route>;

export function createSupervisorNode(deps: {
  router: Runnable<BaseMessage[], RouteDecision>;
  maxSteps: number;
}) {
  return async (state: TeamStateType, config: RunnableConfig) => {
    if (state.steps >= deps.maxSteps) {
      return new Command({ goto: END, update: { messages: [new AIMessage(STEP_LIMIT_MESSAGE)] } });
    }
    const decision = await deps.router.invoke([new SystemMessage(SUPERVISOR_PROMPT), ...state.messages], config);
    return new Command({
      goto: decision.next === 'FINISH' ? END : decision.next,
      update: { steps: state.steps + 1 },
    });
  };
}
```

```ts
// src/agents/team/researcher/graph.ts — a specialist; compiled WITHOUT a checkpointer
export function buildResearcherGraph(model: Runnable<BaseMessage[], BaseMessage>) {
  return new StateGraph(MessagesAnnotation)
    .addNode('research', async (state: typeof MessagesAnnotation.State, config: RunnableConfig) => ({
      messages: [await model.invoke(state.messages, config)],
    }))
    .addEdge(START, 'research')
    .addEdge('research', END)
    .compile();
}
```

```ts
// src/agents/team/graph.ts
export function buildTeamGraph(deps: {
  router: Runnable<BaseMessage[], RouteDecision>;
  researcher: ReturnType<typeof buildResearcherGraph>;
  writer: Runnable<BaseMessage[], BaseMessage>;
  checkpointer: BaseCheckpointSaver;
  maxSteps: number;
}) {
  return new StateGraph(TeamState)
    .addNode('supervisor', createSupervisorNode(deps), { ends: ['researcher', 'writer', END] })
    .addNode('researcher', deps.researcher)
    .addNode('writer', async (state: TeamStateType, config: RunnableConfig) => ({
      messages: [await deps.writer.invoke(state.messages, config)],
    }))
    .addEdge(START, 'supervisor')
    .addEdge('researcher', 'supervisor')
    .addEdge('writer', 'supervisor')
    .compile({ checkpointer: deps.checkpointer });
}
```

In production put the guard first (`START → guard → supervisor`), give the researcher its own agent ⇄ tools loop with an iteration cap, and wrap model calls in the breaker. The container builds the router as `createChatModel(env, 'router')?.withStructuredOutput(Route, { name: 'route' })`.

Test (scripted roles, checks order and cap):

```ts
const decisions: RouteDecision[] = [
  { next: 'researcher', reason: 'needs facts' },
  { next: 'writer', reason: 'draft' },
  { next: 'FINISH', reason: 'done' },
];
const router = RunnableLambda.from((_messages: BaseMessage[]) => {
  const decision = decisions.shift();
  if (!decision) throw new Error('router has no more decisions');
  return decision;
});
const graph = buildTeamGraph({
  router,
  researcher: buildResearcherGraph(RunnableLambda.from((): BaseMessage => new AIMessage('facts'))),
  writer: RunnableLambda.from((): BaseMessage => new AIMessage('report')),
  checkpointer: createMemoryCheckpointer(),
  maxSteps: 5,
});
const out = await graph.invoke({ messages: [new HumanMessage('go')] }, { configurable: { thread_id: 't' } });
expect(out.messages.map((m) => m.content)).toEqual(['go', 'facts', 'report']);
expect(out.steps).toBe(3);
```

## Example 2: handoff between agents

The active agent calls `transfer_to_billing`; the tool jumps to the sibling node in the parent graph. `getCurrentTaskInput()` returns the subgraph state, so the parent receives the AI tool call and its tool result together (without it, the parent would hold an orphan `ToolMessage`, which providers reject).

```ts
import { ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { Command, MessagesAnnotation, getCurrentTaskInput } from '@langchain/langgraph';
import { z } from 'zod';

export function createHandoffTool(target: 'billing' | 'support', description: string) {
  return tool(
    (_input, config) => {
      const state = getCurrentTaskInput<typeof MessagesAnnotation.State>();
      const toolMessage = new ToolMessage({
        content: `Transferred to ${target}.`,
        tool_call_id: config.toolCall?.id ?? '',
        name: `transfer_to_${target}`,
      });
      return new Command({
        goto: target,
        graph: Command.PARENT,
        update: { messages: [...state.messages, toolMessage] },
      });
    },
    { name: `transfer_to_${target}`, description, schema: z.object({}) },
  );
}
```

```ts
// parent graph: the subgraph node declares where its handoffs may go
new StateGraph(MessagesAnnotation)
  .addNode('support', supportGraph, { ends: ['billing'] })
  .addNode('billing', billingGraph, { ends: ['support'] })
  .addEdge(START, 'support')
  .compile({ checkpointer });
```

`supportGraph` is an agent ⇄ tools subgraph whose `ToolNode` includes `createHandoffTool('billing', 'Hand the conversation to billing for refunds, invoices and payments.')`. Run result for "refund please": `human`, `ai` (tool call), `tool: Transferred to billing.`, then billing's answer.

## Example 3: parallel fan-out with `Send`

```ts
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph';
import { asUntrustedDocument } from '../../guardrails/input.js';
import { SUMMARIZE_PROMPT } from './prompts.js';

export const ReviewState = Annotation.Root({
  documents: Annotation<string[]>({ reducer: (_current, update) => update, default: () => [] }),
  /** Written by parallel branches: must concatenate. */
  summaries: Annotation<string[]>({ reducer: (current, update) => current.concat(update), default: () => [] }),
  report: Annotation<string>({ reducer: (_current, update) => update, default: () => '' }),
});
export type ReviewStateType = typeof ReviewState.State;

export function buildReviewGraph(deps: { summarizer: Runnable<BaseMessage[], BaseMessage>; maxDocuments: number }) {
  return new StateGraph(ReviewState)
    .addNode('summarize', async (input: { document: string }, config: RunnableConfig) => {
      const summary = await deps.summarizer.invoke(
        [new SystemMessage(SUMMARIZE_PROMPT), new HumanMessage(asUntrustedDocument({ kind: 'document' }, input.document))],
        config,
      );
      return { summaries: [typeof summary.content === 'string' ? summary.content : ''] };
    })
    .addNode('combine', (state: ReviewStateType) => ({ report: state.summaries.join('\n') }))
    .addConditionalEdges(
      START,
      (state: ReviewStateType) =>
        state.documents.slice(0, deps.maxDocuments).map((document) => new Send('summarize', { document })),
      ['summarize'],
    )
    .addEdge('summarize', 'combine')
    .addEdge('combine', END)
    .compile();
}
```

`invoke({ documents: ['a', 'b', 'c'] })` runs three `summarize` branches in one step, then `combine` once. Branch order is not guaranteed: sort or key results if order matters.
