import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import type { ToolCallingModel } from '../../src/agents/assistant/nodes/agent.js';

export type Turn = (messages: BaseMessage[]) => AIMessage | Promise<AIMessage>;

/**
 * A deterministic stand-in for a tool-calling chat model: each call runs the next scripted
 * turn. No network, no API key, same Runnable interface as `model.bindTools(tools)`.
 */
export function scriptedModel(turns: Turn[]): ToolCallingModel & { calls: BaseMessage[][] } {
  const calls: BaseMessage[][] = [];
  const runnable = RunnableLambda.from(async (messages: BaseMessage[]) => {
    calls.push(messages);
    const turn = turns.shift();
    if (!turn) throw new Error('scripted model has no more turns');
    return turn(messages);
  });
  return Object.assign(runnable, { calls });
}

export const callTool =
  (name: string, args: Record<string, unknown>, id = `call_${name}`): Turn =>
  () =>
    new AIMessage({ content: '', tool_calls: [{ id, name, args, type: 'tool_call' }] });

export const answer =
  (text: string): Turn =>
  () =>
    new AIMessage(text);

/** Answers by citing the first document the search tool returned, like a well-behaved model. */
export const answerCitingFirstResult =
  (text: string): Turn =>
  (messages) => {
    const toolOutput = [...messages].reverse().find((m) => m instanceof ToolMessage);
    const content =
      typeof toolOutput?.content === 'string'
        ? toolOutput.content
        : JSON.stringify(toolOutput?.content);
    const ref = /ref="([0-9a-f]{8})"/.exec(content)?.[1];
    return new AIMessage(ref ? `${text} [ref:${ref}]` : text);
  };

export const failing =
  (message = 'provider down'): Turn =>
  () => {
    throw new Error(message);
  };
