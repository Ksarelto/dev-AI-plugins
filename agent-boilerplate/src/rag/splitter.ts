import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/**
 * Paragraph → sentence → word splitting with overlap, so a chunk rarely cuts a thought in half.
 * ~1000 characters ≈ 250 tokens: small enough to be specific, large enough to stand alone.
 */
export function createTextSplitter(options: { chunkSize?: number; chunkOverlap?: number } = {}) {
  return new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize ?? 1_000,
    chunkOverlap: options.chunkOverlap ?? 150,
  });
}
