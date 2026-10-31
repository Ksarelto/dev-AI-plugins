import { assessInput } from '../../../guardrails/input.js';
import type { Logger } from '../../../lib/logger.js';
import { AIMessage } from '@langchain/core/messages';
import { BLOCKED_MESSAGE } from '../prompts.js';
import type { AssistantStateType, AssistantStateUpdate } from '../state.js';

export function createGuardNode(options: { mode: 'block' | 'log'; logger: Logger }) {
  return (state: AssistantStateType): AssistantStateUpdate => {
    const last = state.messages.at(-1);
    const text = typeof last?.content === 'string' ? last.content : '';
    const assessment = assessInput(text, { mode: options.mode });
    if (assessment.reasons.length > 0) {
      options.logger.warn(
        { reasons: assessment.reasons, blocked: !assessment.allowed },
        'input guardrail triggered',
      );
    }
    if (!assessment.allowed) return { blocked: true, messages: [new AIMessage(BLOCKED_MESSAGE)] };
    return { blocked: false };
  };
}
