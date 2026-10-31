import { AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import type { CircuitBreaker } from '../../../lib/resilience.js';
import { ITERATION_LIMIT_MESSAGE, SYSTEM_PROMPT } from '../prompts.js';
import type { AssistantStateType, AssistantStateUpdate } from '../state.js';

/** A chat model with tools already bound (and fallbacks, if configured). */
export type ToolCallingModel = Runnable<BaseMessage[], BaseMessage>;

export function createAgentNode(deps: {
  model: ToolCallingModel;
  breaker: CircuitBreaker;
  maxIterations: number;
}) {
  return async (
    state: AssistantStateType,
    config: RunnableConfig,
  ): Promise<AssistantStateUpdate> => {
    if (state.iterations >= deps.maxIterations) {
      return { messages: [new AIMessage(ITERATION_LIMIT_MESSAGE)] };
    }
    const response = await deps.breaker.execute(() =>
      deps.model.invoke([new SystemMessage(SYSTEM_PROMPT), ...state.messages], config),
    );
    return { messages: [response], iterations: state.iterations + 1 };
  };
}
