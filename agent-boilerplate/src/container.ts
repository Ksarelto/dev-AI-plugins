import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { buildAssistantGraph } from './agents/assistant/graph.js';
import type { ToolCallingModel } from './agents/assistant/nodes/agent.js';
import { createAssistantTools } from './agents/assistant/tools/index.js';
import type { Env } from './config/env.js';
import { createHealthController } from './controllers/health.controller.js';
import { createKnowledgeController } from './controllers/knowledge.controller.js';
import { createThreadsController } from './controllers/threads.controller.js';
import type { DatabaseHandle } from './db/client.js';
import { createTransactionRunner } from './db/transaction.js';
import { createHealthRegistry, type HealthCheck } from './lib/health.js';
import { createJwtService } from './lib/jwt.js';
import { createLifecycle, type Lifecycle } from './lib/lifecycle.js';
import type { Logger } from './lib/logger.js';
import { createCircuitBreaker } from './lib/resilience.js';
import { createEmbeddings } from './llm/embeddings.js';
import { createChatModel } from './llm/models.js';
import { UsageCallbackHandler } from './llm/usage-callback.js';
import { createPostgresCheckpointer } from './memory/checkpointer.js';
import { authenticate } from './middleware/authenticate.js';
import { createIngestionPipeline } from './rag/ingest.js';
import { createKnowledgeRetriever } from './rag/retriever.js';
import { createTextSplitter } from './rag/splitter.js';
import { createKnowledgeRepository } from './repositories/knowledge.repository.js';
import { createThreadsRepository } from './repositories/threads.repository.js';
import { createChatService } from './services/chat.service.js';
import { createKnowledgeService } from './services/knowledge.service.js';

export interface ContainerOptions {
  /** Tests inject scripted models, synthetic embeddings and an in-memory checkpointer. */
  chatModel?: ToolCallingModel | null;
  embeddings?: EmbeddingsInterface | null;
  checkpointer?: BaseCheckpointSaver;
  lifecycle?: Lifecycle;
}

/** Binds tools to the primary model and, when configured, to a fallback model on another provider. */
function bindModel(
  env: Env,
  tools: Parameters<NonNullable<BaseChatModel['bindTools']>>[0],
): ToolCallingModel | undefined {
  const primary = createChatModel(env, 'chat');
  if (!primary?.bindTools) return undefined;
  const bound = primary.bindTools(tools);
  const fallback = createChatModel(env, 'chatFallback');
  return fallback?.bindTools ? bound.withFallbacks([fallback.bindTools(tools)]) : bound;
}

/** Composition root: concrete LLM, embeddings, checkpointer, repositories and the graph. */
export function createContainer(
  env: Env,
  logger: Logger,
  database: DatabaseHandle,
  options: ContainerOptions = {},
) {
  const lifecycle = options.lifecycle ?? createLifecycle();
  const jwt = createJwtService({
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTokenTtlSeconds: 900,
  });

  const transaction = createTransactionRunner(database.db);
  const threads = createThreadsRepository(database.db);
  const knowledge = createKnowledgeRepository(database.db);

  const embeddings =
    options.embeddings === null ? undefined : (options.embeddings ?? createEmbeddings(env));
  const retriever = embeddings ? createKnowledgeRetriever(knowledge, embeddings) : undefined;
  const pipeline = embeddings
    ? createIngestionPipeline({
        splitter: createTextSplitter(),
        embeddings,
        repository: knowledge,
        transaction,
      })
    : undefined;

  const tools = createAssistantTools({ retriever, topK: env.RETRIEVAL_TOP_K, logger });
  const model =
    options.chatModel === null ? undefined : (options.chatModel ?? bindModel(env, tools));
  const llmBreaker = createCircuitBreaker({
    name: 'llm',
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
  });
  const graph = model
    ? buildAssistantGraph({
        model,
        tools,
        checkpointer: options.checkpointer ?? createPostgresCheckpointer(database.pool),
        breaker: llmBreaker,
        maxIterations: env.AGENT_MAX_ITERATIONS,
        guardrailMode: env.GUARDRAIL_MODE,
        logger,
      })
    : undefined;

  const checks: HealthCheck[] = [
    { name: 'postgres', critical: true, check: database.ping },
    {
      name: 'llm',
      critical: false,
      check: () =>
        !model
          ? Promise.reject(new Error('no model configured'))
          : llmBreaker.state() === 'open'
            ? Promise.reject(new Error('circuit open'))
            : Promise.resolve(),
    },
    {
      name: 'embeddings',
      critical: false,
      check: () =>
        embeddings ? Promise.resolve() : Promise.reject(new Error('no embeddings configured')),
    },
  ];
  const health = createHealthRegistry(checks);

  const chat = createChatService({ graph, threads, maxIterations: env.AGENT_MAX_ITERATIONS });
  const knowledgeService = createKnowledgeService({ pipeline });

  return {
    lifecycle,
    health,
    graph,
    controllers: {
      threads: createThreadsController(chat, () => new UsageCallbackHandler(logger)),
      knowledge: createKnowledgeController(knowledgeService),
      health: createHealthController(health, lifecycle),
    },
    middleware: { authenticate: authenticate(jwt) },
  };
}

export type Container = ReturnType<typeof createContainer>;
