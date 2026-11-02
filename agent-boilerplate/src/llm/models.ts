import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import type { Env } from '../config/env.js';

export type ModelRole = 'chat' | 'chatFallback';

/**
 * Every chat model goes through OpenRouter's OpenAI-compatible API, so swapping providers is
 * a model-slug change in env, not a code change. Timeouts and retries are always set.
 */
export function createChatModel(env: Env, role: ModelRole = 'chat'): BaseChatModel | undefined {
  if (!env.OPENROUTER_API_KEY) return undefined;
  const model = role === 'chat' ? env.MODEL_CHAT : env.MODEL_CHAT_FALLBACK;
  if (!model) return undefined;
  return new ChatOpenAI({
    model,
    apiKey: env.OPENROUTER_API_KEY,
    temperature: env.LLM_TEMPERATURE,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    configuration: {
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: { 'HTTP-Referer': env.APP_URL, 'X-Title': env.APP_NAME },
    },
  });
}
