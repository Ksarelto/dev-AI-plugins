import { z } from 'zod';

export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    code: z.string(),
    instance: z.string().optional(),
    errors: z
      .array(z.object({ path: z.string(), message: z.string(), code: z.string() }))
      .optional(),
  })
  .meta({ id: 'Problem' });

export const uuidParamsSchema = z.object({ id: z.uuid() }).strict();
