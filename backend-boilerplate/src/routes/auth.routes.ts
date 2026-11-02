import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { loginRequest, refreshRequest, registerRequest } from '../schemas/auth.schema.js';

/** Wiring only: path → middleware → controller. */
export function createAuthRouter(controller: AuthController, authLimiter: RequestHandler): Router {
  const router = Router();
  router.use(authLimiter);
  router.post('/register', validate(registerRequest), controller.register);
  router.post('/login', validate(loginRequest), controller.login);
  router.post('/refresh', validate(refreshRequest), controller.refresh);
  router.post('/logout', validate(refreshRequest), controller.logout);
  return router;
}
