import { readFile } from 'node:fs/promises';
import { loadEnv } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { createTransactionRunner } from '../db/transaction.js';
import { createLogger } from '../lib/logger.js';
import { createEmbeddings } from '../llm/embeddings.js';
import { createIngestionPipeline } from '../rag/ingest.js';
import { createTextSplitter } from '../rag/splitter.js';
import { createKnowledgeRepository } from '../repositories/knowledge.repository.js';

/** Loads evals/golden/knowledge.json into the knowledge base (needs OPENROUTER_API_KEY). */
const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, name: 'ingest' });
const embeddings = createEmbeddings(env);
if (!embeddings) throw new Error('OPENROUTER_API_KEY is required to embed documents');

const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 2 });
const pipeline = createIngestionPipeline({
  splitter: createTextSplitter(),
  embeddings,
  repository: createKnowledgeRepository(database.db),
  transaction: createTransactionRunner(database.db),
});

try {
  const documents = JSON.parse(await readFile('evals/golden/knowledge.json', 'utf8')) as {
    title: string;
    source: string;
    content: string;
  }[];
  for (const document of documents) {
    const result = await pipeline.ingest({ ...document, createdBy: 'ingest-script' });
    logger.info({ title: document.title, ...result }, 'document ingested');
  }
} finally {
  await database.close();
}
