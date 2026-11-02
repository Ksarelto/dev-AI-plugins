import type { RequestHandler } from 'express';
import { requirePrincipal } from '../middleware/authenticate.js';
import { validated } from '../middleware/validate.js';
import { ingestDocumentRequest } from '../schemas/knowledge.schema.js';
import type { KnowledgeService } from '../services/knowledge.service.js';

export function createKnowledgeController(knowledge: KnowledgeService) {
  const ingest: RequestHandler = async (_req, res) => {
    const { body } = validated(res, ingestDocumentRequest);
    const result = await knowledge.ingest({ ...body, createdBy: requirePrincipal(res).userId });
    res.status(201).json(result);
  };
  return { ingest };
}

export type KnowledgeController = ReturnType<typeof createKnowledgeController>;
