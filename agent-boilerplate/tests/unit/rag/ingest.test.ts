import { SyntheticEmbeddings } from '@langchain/core/utils/testing';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../../src/db/client.js';
import { createIngestionPipeline } from '../../../src/rag/ingest.js';
import { createTextSplitter } from '../../../src/rag/splitter.js';
import type {
  KnowledgeRepository,
  NewChunk,
} from '../../../src/repositories/knowledge.repository.js';

describe('ingestion pipeline', () => {
  it('splits, embeds every chunk and stores them in order', async () => {
    const stored: NewChunk[] = [];
    const repository = {
      insertDocument: (_doc: unknown, chunks: NewChunk[]) => {
        stored.push(...chunks);
        return Promise.resolve({ id: 'doc-1' });
      },
    } as unknown as KnowledgeRepository;
    const pipeline = createIngestionPipeline({
      splitter: createTextSplitter({ chunkSize: 200, chunkOverlap: 20 }),
      embeddings: new SyntheticEmbeddings({ vectorSize: 8 }),
      repository,
      transaction: (work) => work({} as Transaction),
    });

    const content = Array.from(
      { length: 12 },
      (_, i) => `Paragraph ${i} about refunds and pricing.`,
    ).join('\n\n');
    const result = await pipeline.ingest({
      title: 'Policy',
      source: 'kb/policy.md',
      content,
      createdBy: 'admin',
    });

    expect(result.chunks).toBeGreaterThan(1);
    expect(stored.map((c) => c.position)).toEqual(stored.map((_, i) => i));
    expect(stored.every((c) => c.embedding.length === 8)).toBe(true);
  });
});
