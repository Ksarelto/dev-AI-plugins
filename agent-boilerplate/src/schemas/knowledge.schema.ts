import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';

export const ingestDocumentRequest = {
  body: z
    .object({
      title: z.string().trim().min(1).max(300),
      source: z.string().trim().min(1).max(1_000),
      content: z.string().min(1).max(200_000),
    })
    .strict(),
} satisfies ValidationSchemas;
