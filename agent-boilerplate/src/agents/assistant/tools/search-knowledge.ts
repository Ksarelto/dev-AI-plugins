import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { asUntrustedDocument } from '../../../guardrails/input.js';
import { citationRef, type Citation } from '../../../guardrails/output.js';
import type { Logger } from '../../../lib/logger.js';
import { withTimeout } from '../../../lib/resilience.js';
import type { KnowledgeRetriever } from '../../../rag/retriever.js';

/** Carried on the ToolMessage (not shown to the model) so the service can build citations. */
export interface SearchArtifact {
  citations: Citation[];
  degraded: boolean;
}

export const UNAVAILABLE_MESSAGE =
  'The knowledge base is temporarily unavailable. Tell the user that sources could not be checked.';

export function createSearchKnowledgeTool(deps: {
  retriever: KnowledgeRetriever | undefined;
  topK: number;
  timeoutMs?: number;
  logger: Logger;
}) {
  return tool(
    async ({ query }): Promise<[string, SearchArtifact]> => {
      if (!deps.retriever) return [UNAVAILABLE_MESSAGE, { citations: [], degraded: true }];
      try {
        const results = await withTimeout(
          deps.retriever.search(query, deps.topK),
          deps.timeoutMs ?? 5_000,
          'knowledge search',
        );
        if (results.length === 0)
          return ['No matching documents were found.', { citations: [], degraded: false }];
        const content = results
          .map((chunk) =>
            asUntrustedDocument(
              { ref: citationRef(chunk.chunkId), title: chunk.title, source: chunk.source },
              chunk.content,
            ),
          )
          .join('\n\n');
        const citations = results.map(({ chunkId, documentId, title, source }) => ({
          chunkId,
          documentId,
          title,
          source,
        }));
        return [content, { citations, degraded: false }];
      } catch (error) {
        // Graceful degradation: the turn continues without retrieval and is flagged as degraded.
        deps.logger.warn({ err: error }, 'knowledge search failed');
        return [UNAVAILABLE_MESSAGE, { citations: [], degraded: true }];
      }
    },
    {
      name: 'search_knowledge',
      description:
        'Search the internal knowledge base (product docs, policies, FAQs). Use for any question about the product. Input is a short natural-language search query.',
      schema: z.object({ query: z.string().min(2).max(500).describe('What to search for') }),
      responseFormat: 'content_and_artifact',
    },
  );
}
