import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { Callbacks } from '@langchain/core/callbacks/manager';
import type { AssistantGraph } from '../agents/assistant/graph.js';
import type { AssistantStateType } from '../agents/assistant/state.js';
import type { SearchArtifact } from '../agents/assistant/tools/search-knowledge.js';
import { selectCitations, type Citation } from '../guardrails/output.js';
import { AppError, NotFoundError, ServiceUnavailableError } from '../lib/errors.js';
import type { ThreadsRepository } from '../repositories/threads.repository.js';
import type { ThreadRow } from '../db/schema/index.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatReply {
  message: ChatMessage;
  citations: Citation[];
  /** True when the answer was produced without a dependency (e.g. retrieval) that failed. */
  degraded: boolean;
  blocked: boolean;
}

export type ChatStreamEvent = { type: 'token'; content: string } | ({ type: 'done' } & ChatReply);

export interface SendOptions {
  userId: string;
  threadId: string;
  content: string;
  signal?: AbortSignal | undefined;
  callbacks?: Callbacks | undefined;
}

export interface ChatServiceDeps {
  /** Undefined when no model is configured: chat answers 503, everything else still works. */
  graph: AssistantGraph | undefined;
  threads: ThreadsRepository;
  maxIterations: number;
}

function textOf(message: BaseMessage | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content
    .map((part) =>
      typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '',
    )
    .join('');
}

/** Builds the reply from the messages this turn added to the thread. */
function toReply(state: AssistantStateType, previousCount: number): ChatReply {
  const turn = state.messages.slice(previousCount);
  const answer = textOf([...turn].reverse().find((m) => m instanceof AIMessage));
  const artifacts = turn
    .filter((m): m is ToolMessage => m instanceof ToolMessage && m.name === 'search_knowledge')
    .map((m) => m.artifact as SearchArtifact | undefined)
    .filter((a): a is SearchArtifact => a !== undefined);
  return {
    message: { role: 'assistant', content: answer },
    citations: selectCitations(
      answer,
      artifacts.flatMap((a) => a.citations),
    ),
    degraded: artifacts.some((a) => a.degraded),
    blocked: state.blocked,
  };
}

function toServiceError(error: unknown, signal: AbortSignal | undefined): unknown {
  if (error instanceof AppError || signal?.aborted) return error;
  return new ServiceUnavailableError(
    'The assistant is temporarily unavailable.',
    'LLM_UNAVAILABLE',
    5,
    {
      cause: error,
    },
  );
}

export function createChatService(deps: ChatServiceDeps) {
  const { threads, maxIterations } = deps;

  async function requireThread(userId: string, threadId: string): Promise<ThreadRow> {
    const thread = await threads.findOwned(threadId, userId);
    if (!thread) throw new NotFoundError('Conversation not found.', 'THREAD_NOT_FOUND');
    return thread;
  }

  function requireGraph(): AssistantGraph {
    if (!deps.graph) {
      throw new ServiceUnavailableError('The assistant is not configured.', 'LLM_NOT_CONFIGURED');
    }
    return deps.graph;
  }

  function runConfig(options: SendOptions) {
    return {
      configurable: { thread_id: options.threadId },
      // Each agent step is two graph steps (agent + tools); leave room for guard and the final answer.
      recursionLimit: maxIterations * 2 + 4,
      signal: options.signal,
      callbacks: options.callbacks,
    };
  }

  async function previousMessageCount(graph: AssistantGraph, threadId: string): Promise<number> {
    const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
    return (snapshot.values as Partial<AssistantStateType>).messages?.length ?? 0;
  }

  const turnInput = (content: string) => ({
    messages: [new HumanMessage(content)],
    iterations: 0,
    blocked: false,
  });

  return {
    async createThread(userId: string, title?: string): Promise<ThreadRow> {
      return threads.create({ userId, ...(title ? { title } : {}) });
    },

    async listThreads(userId: string): Promise<ThreadRow[]> {
      return threads.listByUser(userId, 50);
    },

    async getMessages(userId: string, threadId: string): Promise<ChatMessage[]> {
      await requireThread(userId, threadId);
      if (!deps.graph) return [];
      const snapshot = await deps.graph.getState({ configurable: { thread_id: threadId } });
      const messages = (snapshot.values as Partial<AssistantStateType>).messages ?? [];
      return messages.flatMap((message): ChatMessage[] => {
        if (message instanceof HumanMessage) return [{ role: 'user', content: textOf(message) }];
        if (message instanceof AIMessage && textOf(message))
          return [{ role: 'assistant', content: textOf(message) }];
        return [];
      });
    },

    async send(options: SendOptions): Promise<ChatReply> {
      await requireThread(options.userId, options.threadId);
      const graph = requireGraph();
      const before = await previousMessageCount(graph, options.threadId);
      try {
        const state = await graph.invoke(turnInput(options.content), runConfig(options));
        await threads.touch(options.threadId);
        return toReply(state, before);
      } catch (error) {
        throw toServiceError(error, options.signal);
      }
    },

    /** Streams model tokens as they arrive, then one `done` event with the full reply. */
    async *stream(options: SendOptions): AsyncGenerator<ChatStreamEvent> {
      await requireThread(options.userId, options.threadId);
      const graph = requireGraph();
      const before = await previousMessageCount(graph, options.threadId);
      let finalState: AssistantStateType | undefined;
      try {
        const stream = await graph.stream(turnInput(options.content), {
          ...runConfig(options),
          streamMode: ['messages', 'values'],
        });
        for await (const [mode, payload] of stream) {
          if (mode === 'values') {
            finalState = payload;
            continue;
          }
          const [chunk, metadata] = payload as [BaseMessage, { langgraph_node?: string }];
          if (metadata.langgraph_node === 'agent' && chunk instanceof AIMessageChunk) {
            const content = textOf(chunk);
            if (content) yield { type: 'token', content };
          }
        }
      } catch (error) {
        throw toServiceError(error, options.signal);
      }
      if (!finalState)
        throw new ServiceUnavailableError('The assistant returned no answer.', 'LLM_UNAVAILABLE');
      await threads.touch(options.threadId);
      yield { type: 'done', ...toReply(finalState, before) };
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
