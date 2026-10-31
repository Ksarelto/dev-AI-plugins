import { AIMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { END, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Logger } from '../../lib/logger.js';
import type { CircuitBreaker } from '../../lib/resilience.js';
import { createAgentNode, type ToolCallingModel } from './nodes/agent.js';
import { createGuardNode } from './nodes/guard.js';
import { AssistantState, type AssistantStateType } from './state.js';

export interface AssistantGraphDeps {
  model: ToolCallingModel;
  tools: StructuredToolInterface[];
  checkpointer: BaseCheckpointSaver;
  breaker: CircuitBreaker;
  maxIterations: number;
  guardrailMode: 'block' | 'log';
  logger: Logger;
}

function routeAfterAgent(state: AssistantStateType): 'tools' | typeof END {
  const last = state.messages.at(-1);
  return last instanceof AIMessage && (last.tool_calls?.length ?? 0) > 0 ? 'tools' : END;
}

/**
 *   START → guard ─(blocked)→ END
 *             └→ agent ⇄ tools
 *                  └─(no tool calls / step limit)→ END
 */
export function buildAssistantGraph(deps: AssistantGraphDeps) {
  return new StateGraph(AssistantState)
    .addNode('guard', createGuardNode({ mode: deps.guardrailMode, logger: deps.logger }))
    .addNode('agent', createAgentNode(deps))
    .addNode('tools', new ToolNode(deps.tools))
    .addEdge(START, 'guard')
    .addConditionalEdges('guard', (state) => (state.blocked ? END : 'agent'), ['agent', END])
    .addConditionalEdges('agent', routeAfterAgent, ['tools', END])
    .addEdge('tools', 'agent')
    .compile({ checkpointer: deps.checkpointer });
}

export type AssistantGraph = ReturnType<typeof buildAssistantGraph>;
