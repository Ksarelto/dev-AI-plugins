import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';
import type { ThreadRow } from '../db/schema/index.js';

/** Hard cap on one user message; long inputs cost tokens and widen the injection surface. */
export const MAX_MESSAGE_CHARS = 4_000;

const threadParams = z.object({ threadId: z.uuid() }).strict();

export const createThreadRequest = {
  body: z.object({ title: z.string().trim().min(1).max(200).optional() }).strict(),
} satisfies ValidationSchemas;

export const threadMessagesRequest = { params: threadParams } satisfies ValidationSchemas;

export const sendMessageRequest = {
  params: threadParams,
  body: z.object({ content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }).strict(),
} satisfies ValidationSchemas;

export function toThreadResponse(thread: ThreadRow) {
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}
