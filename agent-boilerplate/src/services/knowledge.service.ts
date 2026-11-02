import { ServiceUnavailableError } from '../lib/errors.js';
import type { IngestInput, IngestResult, IngestionPipeline } from '../rag/ingest.js';

export function createKnowledgeService(deps: { pipeline: IngestionPipeline | undefined }) {
  return {
    async ingest(input: IngestInput): Promise<IngestResult> {
      if (!deps.pipeline) {
        throw new ServiceUnavailableError(
          'Embeddings are not configured.',
          'EMBEDDINGS_NOT_CONFIGURED',
        );
      }
      return deps.pipeline.ingest(input);
    },
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
