import { Router, type RequestHandler } from 'express';
import type { KnowledgeController } from '../controllers/knowledge.controller.js';
import type { ThreadsController } from '../controllers/threads.controller.js';
import { createKnowledgeRouter } from './knowledge.routes.js';
import { createThreadsRouter } from './threads.routes.js';

export interface ApiRouterDeps {
  controllers: { threads: ThreadsController; knowledge: KnowledgeController };
  authenticate: RequestHandler;
}

/** Every route of this service requires a valid access token from the backend. */
export function createApiRouter({ controllers, authenticate }: ApiRouterDeps): Router {
  const router = Router();
  router.use(authenticate);
  router.use('/threads', createThreadsRouter(controllers.threads));
  router.use('/knowledge', createKnowledgeRouter(controllers.knowledge));
  return router;
}
