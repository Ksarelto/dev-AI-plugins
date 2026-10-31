import { readFileSync } from 'node:fs';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildAssistantGraph } from '../src/agents/assistant/graph.js';
import { createAssistantTools } from '../src/agents/assistant/tools/index.js';
import { loadEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { createCircuitBreaker } from '../src/lib/resilience.js';
import { createEmbeddings } from '../src/llm/embeddings.js';
import { createChatModel } from '../src/llm/models.js';
import { createMemoryCheckpointer } from '../src/memory/checkpointer.js';
import type { KnowledgeRetriever } from '../src/rag/retriever.js';
import { createTextSplitter } from '../src/rag/splitter.js';
import type { ScoredChunk } from '../src/repositories/knowledge.repository.js';
import { createChatService } from '../src/services/chat.service.js';
import { createInMemoryThreads } from '../tests/helpers/in-memory-threads.js';

/**
 * Behavioural evals against real models (OpenRouter). Not part of `npm test`: run with
 * `npm run eval` before changing prompts, tools, chunking or models, and compare scores.
 */
interface GoldenCase {
  id: string;
  question: string;
  mustCite: string[];
  mustMention: string[];
  expectUnknown?: boolean;
  expectBlocked?: boolean;
}

const PASS_RATE_THRESHOLD = 0.8;
const cases = JSON.parse(readFileSync('evals/golden/assistant.json', 'utf8')) as GoldenCase[];
const documents = JSON.parse(readFileSync('evals/golden/knowledge.json', 'utf8')) as {
  title: string;
  source: string;
  content: string;
}[];

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

/** In-memory cosine retriever over the golden documents: evals test the agent, not Postgres. */
async function createGoldenRetriever(embeddings: EmbeddingsInterface): Promise<KnowledgeRetriever> {
  const splitter = createTextSplitter({ chunkSize: 400, chunkOverlap: 40 });
  const chunks: (ScoredChunk & { vector: number[] })[] = [];
  for (const [d, document] of documents.entries()) {
    const texts = await splitter.splitText(document.content);
    const vectors = await embeddings.embedDocuments(texts);
    texts.forEach((content, i) => {
      chunks.push({
        chunkId: `${d}${i}`.padStart(8, '0').padEnd(36, '0'),
        documentId: String(d),
        title: document.title,
        source: document.source,
        content,
        score: 0,
        vector: vectors[i] ?? [],
      });
    });
  }
  const cosine = (a: number[], b: number[]) => {
    let dot = 0;
    let na = 0;
    let nb = 0;
    a.forEach((x, i) => {
      const y = b[i] ?? 0;
      dot += x * y;
      na += x * x;
      nb += y * y;
    });
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  };
  return {
    async search(query, limit) {
      const q = await embeddings.embedQuery(query);
      return chunks
        .map(({ vector, ...chunk }) => ({ ...chunk, score: cosine(q, vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}

const judgeSchema = z.object({
  faithful: z
    .boolean()
    .describe('Every claim in the answer is supported by the reference documents.'),
  answersQuestion: z
    .boolean()
    .describe('The answer addresses the question, or correctly says it does not know.'),
  reason: z.string(),
});

describe.skipIf(!hasKey)('assistant golden set', () => {
  it(`passes at least ${PASS_RATE_THRESHOLD * 100}% of golden cases`, async () => {
    const env = loadEnv();
    const logger = createLogger({ level: 'silent', pretty: false });
    const embeddings = createEmbeddings(env);
    const model = createChatModel(env, 'chat');
    const judge = createChatModel(env, 'chat')?.withStructuredOutput(judgeSchema, {
      name: 'judgement',
    });
    if (!embeddings || !model?.bindTools || !judge)
      throw new Error('OPENROUTER_API_KEY is required');

    const tools = createAssistantTools({
      retriever: await createGoldenRetriever(embeddings),
      topK: 4,
      logger,
    });
    const graph = buildAssistantGraph({
      model: model.bindTools(tools),
      tools,
      checkpointer: createMemoryCheckpointer(),
      breaker: createCircuitBreaker({ name: 'llm' }),
      maxIterations: env.AGENT_MAX_ITERATIONS,
      guardrailMode: 'block',
      logger,
    });
    const threads = createInMemoryThreads();
    const chat = createChatService({ graph, threads, maxIterations: env.AGENT_MAX_ITERATIONS });
    const reference = documents.map((d) => `# ${d.title}\n${d.content}`).join('\n\n');

    const results: { id: string; pass: boolean; why: string }[] = [];
    for (const golden of cases) {
      const thread = await threads.create({ userId: 'eval' });
      const reply = await chat.send({
        userId: 'eval',
        threadId: thread.id,
        content: golden.question,
      });
      const text = reply.message.content.toLowerCase();
      const cited = reply.citations.map((c) => c.title);
      const failures: string[] = [];

      if (golden.expectBlocked && !reply.blocked) failures.push('not blocked');
      for (const title of golden.mustCite)
        if (!cited.includes(title)) failures.push(`missing citation ${title}`);
      for (const phrase of golden.mustMention)
        if (!text.includes(phrase.toLowerCase())) failures.push(`missing "${phrase}"`);
      if (!golden.expectBlocked) {
        const verdict = await judge.invoke(
          `Reference documents:\n${reference}\n\nQuestion: ${golden.question}\nAnswer: ${reply.message.content}\n\n` +
            (golden.expectUnknown
              ? 'The documents do not contain the answer; a correct answer says so.'
              : ''),
        );
        if (!verdict.faithful) failures.push(`unfaithful: ${verdict.reason}`);
        if (!verdict.answersQuestion) failures.push(`off-target: ${verdict.reason}`);
      }
      results.push({ id: golden.id, pass: failures.length === 0, why: failures.join('; ') });
    }

    console.table(results);
    const passRate = results.filter((r) => r.pass).length / results.length;
    expect(passRate).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
