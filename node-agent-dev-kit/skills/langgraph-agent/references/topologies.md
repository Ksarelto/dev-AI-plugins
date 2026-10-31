# Other graph topologies

The boilerplate implements only guard → agent ⇄ tools. The shapes below are not in the boilerplate; they use LangGraph.js 1.6 APIs that were typechecked against the installed `@langchain/langgraph` (`addConditionalEdges`, `addSequence`, `addNode(..., { retryPolicy })`, `addNode(..., { ends })`, `Command`).

## Router: classify, then branch

A cheap structured-output classifier picks the path. The classifier is a model role of its own (`llm-models` skill) built in the container: `createChatModel(env, 'router')?.withStructuredOutput(IntentDecision, { name: 'intent' })`.

```ts
import { AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { Annotation, END, MessagesAnnotation, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { z } from 'zod';
import type { CircuitBreaker } from '../../lib/resilience.js';
import { CLASSIFY_PROMPT, OUT_OF_SCOPE_MESSAGE } from './prompts.js';

export const IntentDecision = z.object({
  intent: z.enum(['question', 'smalltalk', 'out_of_scope']).describe('What the user wants'),
});
export type Intent = z.infer<typeof IntentDecision>['intent'];

export const RoutedState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<Intent | null>({ reducer: (_current, update) => update, default: () => null }),
});
export type RoutedStateType = typeof RoutedState.State;
export type RoutedStateUpdate = typeof RoutedState.Update;

export function createClassifyNode(deps: {
  classifier: Runnable<BaseMessage[], z.infer<typeof IntentDecision>>;
  breaker: CircuitBreaker;
}) {
  return async (state: RoutedStateType, config: RunnableConfig): Promise<RoutedStateUpdate> => {
    const last = state.messages.at(-1);
    const decision = await deps.breaker.execute(() =>
      deps.classifier.invoke([new SystemMessage(CLASSIFY_PROMPT), ...(last ? [last] : [])], config),
    );
    return { intent: decision.intent };
  };
}

function routeByIntent(state: RoutedStateType): 'agent' | 'decline' {
  return state.intent === 'out_of_scope' ? 'decline' : 'agent';
}

// in build<Name>Graph(deps)
new StateGraph(RoutedState)
  .addNode('classify', createClassifyNode(deps))
  .addNode('agent', createAgentNode(deps))
  .addNode('decline', () => ({ messages: [new AIMessage(OUT_OF_SCOPE_MESSAGE)] }))
  .addEdge(START, 'classify')
  .addConditionalEdges('classify', routeByIntent, ['agent', 'decline'])
  .addEdge('decline', END)
  // agent ⇄ tools as in the reference graph
  .compile({ checkpointer: deps.checkpointer });
```

Keep the guard in front of the classifier (`START → guard → classify`). `intent` is per turn: reset it in the turn input.

## Fixed pipeline

```ts
new StateGraph(State)
  .addSequence({ extract: createExtractNode(deps), answer: createAnswerNode(deps) })
  .addEdge(START, 'extract')
  .addEdge('answer', END)
  .compile({ checkpointer: deps.checkpointer });
```

## Node retry policy

For a node that calls an idempotent dependency without its own retry (an internal HTTP API, a slow SQL function):

```ts
const isTransient = (error: unknown): boolean =>
  error instanceof Error && /ECONNRESET|ETIMEDOUT|503/.test(error.message);

.addNode('enrich', createEnrichNode(deps), {
  retryPolicy: { maxAttempts: 3, initialInterval: 500, retryOn: isTransient },
})
```

Never put a `retryPolicy` on the agent node: the model client already retries (`maxRetries`), then falls back, then trips the breaker. Stacking retries multiplies cost and latency.

## Routing from inside a node with `Command`

A node can return the update and the next node together. Declare the possible destinations with `ends` so the graph can be drawn and validated.

```ts
import { Command, END } from '@langchain/langgraph';

const triage = async (state: StateType, config: RunnableConfig) => {
  const decision = await deps.classifier.invoke(state.messages, config);
  return new Command({
    goto: decision.intent === 'out_of_scope' ? END : 'agent',
    update: { intent: decision.intent },
  });
};

new StateGraph(State)
  .addNode('triage', triage, { ends: ['agent', END] })
  .addNode('agent', createAgentNode(deps))
  .addEdge(START, 'triage');
```

Prefer `addConditionalEdges` with a pure router when the decision only reads state. Use `Command` when the node computes the decision and the update in one step (supervisors: `multi-agent` skill).

## Static breakpoints (debugging only)

`compile({ checkpointer, interruptBefore: ['tools'] })` pauses before every tool run. It is useful to inspect a thread locally; production approval flows use `interrupt()` inside the tool (`human-in-the-loop` skill).
