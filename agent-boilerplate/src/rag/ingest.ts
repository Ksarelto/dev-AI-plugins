import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type { TextSplitter } from '@langchain/textsplitters';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.js';
import type { TransactionRunner } from '../db/transaction.js';

export interface IngestInput {
  title: string;
  source: string;
  content: string;
  createdBy: string;
}

export interface IngestResult {
  documentId: string;
  chunks: number;
}

const EMBED_BATCH_SIZE = 64;

/** split → embed in batches → store document and chunks atomically. Separate from the query path. */
export function createIngestionPipeline(deps: {
  splitter: TextSplitter;
  embeddings: EmbeddingsInterface;
  repository: KnowledgeRepository;
  transaction: TransactionRunner;
}) {
  return {
    async ingest(input: IngestInput): Promise<IngestResult> {
      const texts = await deps.splitter.splitText(input.content);
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
        vectors.push(
          ...(await deps.embeddings.embedDocuments(texts.slice(start, start + EMBED_BATCH_SIZE))),
        );
      }
      const document = await deps.transaction((tx) =>
        deps.repository.insertDocument(
          { title: input.title, source: input.source, createdBy: input.createdBy },
          texts.map((content, position) => ({
            position,
            content,
            embedding: vectors[position] ?? [],
          })),
          tx,
        ),
      );
      return { documentId: document.id, chunks: texts.length };
    },
  };
}

export type IngestionPipeline = ReturnType<typeof createIngestionPipeline>;
