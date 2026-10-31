import { Router, type RequestHandler } from 'express';
import type { UsersController } from '../controllers/users.controller.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { listUsersRequest } from '../schemas/user.schema.js';

export function createUsersRouter(
  controller: UsersController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/me', controller.me);
  router.get('/', requireRole('admin'), validate(listUsersRequest), controller.list);
  return router;
}
