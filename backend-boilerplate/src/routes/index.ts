import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';
import type { UsersController } from '../controllers/users.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createUsersRouter } from './users.routes.js';

export interface ApiRouterDeps {
  controllers: { auth: AuthController; users: UsersController };
  authenticate: RequestHandler;
  authLimiter: RequestHandler;
}

/** Every versioned resource is mounted here, and only here. */
export function createApiRouter({ controllers, authenticate, authLimiter }: ApiRouterDeps): Router {
  const router = Router();
  router.use('/auth', createAuthRouter(controllers.auth, authLimiter));
  router.use('/users', createUsersRouter(controllers.users, authenticate));
  return router;
}
