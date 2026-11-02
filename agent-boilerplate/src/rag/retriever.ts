import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type { KnowledgeRepository, ScoredChunk } from '../repositories/knowledge.repository.js';

export interface KnowledgeRetriever {
  search(query: string, limit: number): Promise<ScoredChunk[]>;
}

/** Embeds the query once and runs hybrid (vector + keyword) search. */
export function createKnowledgeRetriever(
  repository: KnowledgeRepository,
  embeddings: EmbeddingsInterface,
): KnowledgeRetriever {
  return {
    async search(query, limit) {
      const embedding = await embeddings.embedQuery(query);
      return repository.hybridSearch({ text: query, embedding, limit });
    },
  };
}
