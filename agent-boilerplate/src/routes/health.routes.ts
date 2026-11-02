import { Router } from 'express';
import type { HealthController } from '../controllers/health.controller.js';

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/health/live', controller.live);
  router.get('/health/ready', controller.ready);
  return router;
}
