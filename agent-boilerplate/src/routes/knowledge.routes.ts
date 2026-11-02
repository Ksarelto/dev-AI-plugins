import { Router } from 'express';
import type { KnowledgeController } from '../controllers/knowledge.controller.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { ingestDocumentRequest } from '../schemas/knowledge.schema.js';

export function createKnowledgeRouter(controller: KnowledgeController): Router {
  const router = Router();
  router.post(
    '/documents',
    requireRole('admin'),
    validate(ingestDocumentRequest),
    controller.ingest,
  );
  return router;
}
