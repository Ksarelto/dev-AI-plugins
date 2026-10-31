import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { Env } from '../config/env.js';

/** OpenRouter embeddings; `dimensions` must match the `vector(n)` column. */
export function createEmbeddings(env: Env): EmbeddingsInterface | undefined {
  if (!env.OPENROUTER_API_KEY) return undefined;
  return new OpenAIEmbeddings({
    model: env.MODEL_EMBED,
    apiKey: env.OPENROUTER_API_KEY,
    dimensions: env.EMBEDDING_DIMENSIONS,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    configuration: { baseURL: env.OPENROUTER_BASE_URL },
  });
}
