import { Router } from 'express';
import type { ThreadsController } from '../controllers/threads.controller.js';
import { validate } from '../middleware/validate.js';
import {
  createThreadRequest,
  sendMessageRequest,
  threadMessagesRequest,
} from '../schemas/thread.schema.js';

export function createThreadsRouter(controller: ThreadsController): Router {
  const router = Router();
  router.post('/', validate(createThreadRequest), controller.create);
  router.get('/', controller.list);
  router.get('/:threadId/messages', validate(threadMessagesRequest), controller.messages);
  router.post('/:threadId/messages', validate(sendMessageRequest), controller.send);
  router.post('/:threadId/messages/stream', validate(sendMessageRequest), controller.stream);
  return router;
}
