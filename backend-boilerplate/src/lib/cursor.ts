import { z } from 'zod';
import { BadRequestError } from './errors.js';

const keysetSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

export interface Keyset {
  createdAt: Date;
  id: string;
}

/** Opaque, URL-safe pagination cursor. Clients must not parse it. */
export function encodeCursor(keyset: Keyset): string {
  const payload = { createdAt: keyset.createdAt.toISOString(), id: keyset.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): Keyset {
  try {
    const parsed = keysetSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new BadRequestError('The pagination cursor is invalid.', 'INVALID_CURSOR');
  }
}
