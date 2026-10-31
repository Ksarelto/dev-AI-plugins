import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { openSse } from '../lib/sse.js';
import { requirePrincipal } from '../middleware/authenticate.js';
import { validated } from '../middleware/validate.js';
import {
  createThreadRequest,
  sendMessageRequest,
  threadMessagesRequest,
  toThreadResponse,
} from '../schemas/thread.schema.js';
import type { ChatService } from '../services/chat.service.js';
import type { UsageCallbackHandler } from '../llm/usage-callback.js';

export function createThreadsController(
  chat: ChatService,
  usageHandler: () => UsageCallbackHandler,
) {
  const create: RequestHandler = async (_req, res) => {
    const { body } = validated(res, createThreadRequest);
    const thread = await chat.createThread(requirePrincipal(res).userId, body.title);
    res.status(201).json(toThreadResponse(thread));
  };

  const list: RequestHandler = async (_req, res) => {
    const threads = await chat.listThreads(requirePrincipal(res).userId);
    res.json({ items: threads.map(toThreadResponse) });
  };

  const messages: RequestHandler = async (_req, res) => {
    const { params } = validated(res, threadMessagesRequest);
    res.json({ items: await chat.getMessages(requirePrincipal(res).userId, params.threadId) });
  };

  const send: RequestHandler = async (_req, res) => {
    const { params, body } = validated(res, sendMessageRequest);
    const usage = usageHandler();
    const reply = await chat.send({
      userId: requirePrincipal(res).userId,
      threadId: params.threadId,
      content: body.content,
      signal: res.locals.signal as AbortSignal | undefined,
      callbacks: [usage],
    });
    res.json({ ...reply, usage: usage.usage });
  };

  /**
   * SSE: once headers are sent, errors can no longer change the status code, so this is
   * the one controller that catches — it reports the failure as an `error` event.
   */
  const stream: RequestHandler = async (_req, res) => {
    const { params, body } = validated(res, sendMessageRequest);
    const userId = requirePrincipal(res).userId;
    const events = chat.stream({
      userId,
      threadId: params.threadId,
      content: body.content,
      signal: res.locals.signal as AbortSignal | undefined,
    });
    // Pull the first event before opening the stream, so 404/503 still become normal problem responses.
    const first = await events.next();
    const sse = openSse(res);
    try {
      if (!first.done) sse.send(first.value.type, first.value);
      for await (const event of events) sse.send(event.type, event);
    } catch (error) {
      res.req.log.error({ err: error }, 'chat stream failed');
      const problem =
        error instanceof AppError ? error.toProblem() : { code: 'INTERNAL_ERROR', status: 500 };
      sse.send('error', problem);
    } finally {
      sse.close();
    }
  };

  return { create, list, messages, send, stream };
}

export type ThreadsController = ReturnType<typeof createThreadsController>;
