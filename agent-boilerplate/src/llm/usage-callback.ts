import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { Logger } from '../lib/logger.js';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

interface UsageMetadata {
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Counts tokens per request and logs each model call. Attach a fresh instance per request
 * through `callbacks` so usage is attributed to the right user and thread.
 */
export class UsageCallbackHandler extends BaseCallbackHandler {
  name = 'usage';
  readonly usage: TokenUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };

  constructor(private readonly logger: Logger) {
    super();
  }

  override handleLLMEnd(output: LLMResult): void {
    const generation = output.generations.at(0)?.at(0) as
      { message?: { usage_metadata?: UsageMetadata } } | undefined;
    const metadata = generation?.message?.usage_metadata;
    const inputTokens = metadata?.input_tokens ?? 0;
    const outputTokens = metadata?.output_tokens ?? 0;
    this.usage.calls += 1;
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.logger.info({ inputTokens, outputTokens }, 'llm call finished');
  }
}
