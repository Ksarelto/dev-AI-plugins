import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

/**
 * Graph state. `messages` uses LangGraph's append/merge reducer; the counters are
 * overwritten and reset by the caller at the start of every turn.
 */
export const AssistantState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /** Model calls in the current turn. The agent node stops at the configured cap. */
  iterations: Annotation<number>({ reducer: (_current, update) => update, default: () => 0 }),
  /** Set by the input guard; a blocked turn never reaches the model. */
  blocked: Annotation<boolean>({ reducer: (_current, update) => update, default: () => false }),
});

export type AssistantStateType = typeof AssistantState.State;
export type AssistantStateUpdate = typeof AssistantState.Update;
